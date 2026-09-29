import { assessFields, EMPTY_DECISIONS, type FieldAssessment } from '../core/fill-plan';
import { analyzeTab } from '../extension/page-analysis';
import { hasSiteAccess, SITE_ACCESS } from '../extension/permissions';
import { fillTab } from '../extension/tab-actions';
import { mapFields } from '../matching/field-mapper';
import { addHistoryEntry } from '../storage/history-storage';
import { getSiteOverrides } from '../storage/overrides-storage';
import { ensureInitialized, getActiveProfile } from '../storage/profile-storage';
import { getSettings, updateSettings } from '../storage/settings-storage';
import { STORAGE_KEYS } from '../storage/store';
import type { DetectedField, FillInstruction } from '../types/fields';
import type { AutoFillResponse, ContentToBackgroundMessage, PageConfig } from '../types/messages';
import type { Settings } from '../types/settings';
import { hostnameOf } from '../utils/domain';
import { logger } from '../utils/logger';

/**
 * Background service worker.
 * - Locks storage to trusted extension contexts (content scripts can't read the profile).
 * - Registers the page-load content script only while the user has opted in AND granted site access.
 * - Answers content-script requests for page config and (opt-in) safe auto-fill.
 * - Handles the "fill safe fields" keyboard shortcut.
 */

const PAGE_LOAD_SCRIPT_ID = 'one-fill-page-load';
const PAGE_LOAD_MATCHES = SITE_ACCESS.origins!;

// Content scripts run inside web pages; if a page ever compromised its renderer it could read
// anything a content script can. Restricting storage keeps the profile in extension pages only.
void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureInitialized();
  await syncPageLoadScript();
  if (reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(() => void syncPageLoadScript());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.settings]) void syncPageLoadScript();
});

chrome.permissions.onRemoved.addListener(async () => {
  if (!(await hasSiteAccess())) {
    await updateSettings({ pageLoadDetection: false, autoFillSafe: false });
  }
});

/** Keeps the dynamically registered content script in sync with settings + permission. */
async function syncPageLoadScript(): Promise<void> {
  try {
    const settings = await getSettings();
    const wanted = (settings.pageLoadDetection || settings.autoFillSafe) && (await hasSiteAccess());
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [PAGE_LOAD_SCRIPT_ID] });
    if (wanted && existing.length === 0) {
      await chrome.scripting.registerContentScripts([
        {
          id: PAGE_LOAD_SCRIPT_ID,
          js: ['content.js'],
          matches: PAGE_LOAD_MATCHES,
          allFrames: true,
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]);
    } else if (!wanted && existing.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: [PAGE_LOAD_SCRIPT_ID] });
    }
  } catch (error) {
    logger.error('Could not update page-load script', error);
  }
}

function siteDisabled(settings: Settings, url: string | undefined): boolean {
  const host = hostnameOf(url);
  return !host || settings.disabledSites.includes(host);
}

// ── Messages from content scripts ─────────────────────────────────────────────

/** Matched-field counts per tab and frame, summed into the toolbar badge. */
const badgeCounts = new Map<number, Map<number, number>>();

chrome.tabs.onRemoved.addListener((tabId) => badgeCounts.delete(tabId));

chrome.runtime.onMessage.addListener((message: ContentToBackgroundMessage, sender, sendResponse) => {
  // Only accept messages from our own content scripts running in a tab.
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || typeof message?.type !== 'string') return false;
  handleContentMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      logger.error('Message handler failed', error);
      sendResponse(undefined);
    });
  return true; // async response
});

async function handleContentMessage(message: ContentToBackgroundMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab!.id!;
  const frameId = sender.frameId ?? 0;
  const pageUrl = sender.url ?? sender.tab?.url;

  switch (message.type) {
    case 'onefill:get-page-config': {
      const settings = await getSettings();
      const enabled = (await hasSiteAccess()) && !siteDisabled(settings, pageUrl);
      const config: PageConfig = {
        detect: enabled && settings.pageLoadDetection,
        autoFill: enabled && settings.autoFillSafe,
        confirmBeforeAutoFill: settings.confirmUncertain,
        highlight: settings.highlightFilled,
      };
      return config;
    }

    case 'onefill:forms-detected': {
      if (frameId === 0) badgeCounts.set(tabId, new Map());
      const frames = badgeCounts.get(tabId) ?? new Map<number, number>();
      frames.set(frameId, Math.max(0, Math.floor(Number(message.matched) || 0)));
      badgeCounts.set(tabId, frames);
      const total = [...frames.values()].reduce((a, b) => a + b, 0);
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4f46e5' });
      await chrome.action.setBadgeText({ tabId, text: total > 0 ? String(Math.min(total, 99)) : '' });
      return true;
    }

    case 'onefill:auto-fill-request': {
      const settings = await getSettings();
      if (!settings.autoFillSafe || siteDisabled(settings, pageUrl) || !(await hasSiteAccess())) return emptyAutoFill();
      const fields = sanitizeFields(message.fields, frameId);
      return planSafeFill(fields, hostnameOf(sender.tab?.url ?? pageUrl), settings);
    }

    case 'onefill:auto-fill-done': {
      const settings = await getSettings();
      if (settings.saveHistory && message.filled > 0) {
        const profile = await getActiveProfile();
        await addHistoryEntry({
          domain: hostnameOf(sender.tab?.url) || String(message.hostname).slice(0, 253),
          pageTitle: String(sender.tab?.title ?? message.title ?? ''),
          fieldsFilled: message.filled,
          profileId: profile.meta.id,
          trigger: 'auto',
        });
      }
      return true;
    }

    default:
      return undefined;
  }
}

function emptyAutoFill(): AutoFillResponse {
  return { instructions: [], profileName: '' };
}

/** Content scripts are untrusted input: keep only well-formed descriptors. */
function sanitizeFields(input: unknown, frameId: number): DetectedField[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 500)
    .filter((f): f is DetectedField => !!f && typeof f === 'object' && typeof (f as DetectedField).id === 'string' && Array.isArray((f as DetectedField).options))
    .map((f) => ({ ...f, frameId }));
}

/**
 * Safe auto-fill: only "ready" assessments — high confidence, non-sensitive, empty on the page,
 * no file uploads. Only values for fields present on the requesting page are returned.
 */
async function planSafeFill(fields: DetectedField[], hostname: string, settings: Settings): Promise<AutoFillResponse> {
  if (fields.length === 0) return emptyAutoFill();
  const profile = await getActiveProfile();
  const overrides = await getSiteOverrides(hostname.replace(/^www\./, ''));
  const matches = mapFields(fields, { overrides });
  const assessments = assessFields(fields, matches, profile.data, {
    settings: { confirmUncertain: true, sensitivePolicy: 'never', overwriteExisting: false },
  });
  const instructions: FillInstruction[] = assessments
    .filter((a: FieldAssessment) => a.status === 'ready' && !a.sensitive && a.instruction && a.instruction.action !== 'file')
    .map((a) => a.instruction!);
  return { instructions, profileName: profile.meta.name };
}

// ── Keyboard shortcut: fill safe fields without opening the popup ─────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-safe-fields' || !tab?.id) return;
  try {
    const settings = await getSettings();
    const profile = await getActiveProfile();
    const analysis = await analyzeTab(tab.id);
    const assessments = assessFields(analysis.fields, analysis.matches, profile.data, {
      settings: { confirmUncertain: true, sensitivePolicy: 'never', overwriteExisting: false },
    }).filter((a) => a.status === 'ready' && !a.sensitive);
    const result = await fillTab(tab.id, assessments, EMPTY_DECISIONS, settings, { announce: true });
    if (settings.saveHistory && result.filled > 0) {
      await addHistoryEntry({
        domain: analysis.hostname,
        pageTitle: analysis.title,
        fieldsFilled: result.filled,
        profileId: profile.meta.id,
        trigger: 'shortcut',
      });
    }
  } catch (error) {
    logger.error('Shortcut fill failed', error);
  }
});
