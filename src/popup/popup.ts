import { computeCompleteness } from '../core/completeness';
import {
  assessFields,
  summarize,
  willFill,
  type AssessmentStatus,
  type FieldAssessment,
  type FillDecisions,
} from '../core/fill-plan';
import { resolveProfileValue } from '../core/profile-values';
import { displayValueFor } from '../core/fill-plan';
import { analyzeTab, type PageAnalysis } from '../extension/page-analysis';
import { fillTab, undoTab, type TabFillResult } from '../extension/tab-actions';
import { CONFIDENCE } from '../matching/field-mapper';
import { FIELD_DEFINITIONS, fieldLabel, SECTION_LABELS, type ProfileSection } from '../matching/field-catalog';
import { fieldSignature } from '../matching/signature';
import { addHistoryEntry } from '../storage/history-storage';
import { saveSiteOverrides } from '../storage/overrides-storage';
import { getActiveProfile, getProfileIndex, setActiveProfile } from '../storage/profile-storage';
import { getSettings } from '../storage/settings-storage';
import type { FieldKey } from '../types/fields';
import { SKIP_FIELD } from '../types/history';
import type { ProfileIndex, StoredProfile } from '../types/profile';
import { DEFAULT_SETTINGS, type Settings } from '../types/settings';
import { h, render, type Child } from '../ui/dom';
import { icon, logoMark, type IconName } from '../ui/icons';
import { applyTheme, toast } from '../ui/theme';
import { isRestrictedUrl } from '../utils/domain';
import { describeError, logger } from '../utils/logger';

type Phase = 'loading' | 'restricted' | 'idle' | 'scanning' | 'no-fields' | 'ready' | 'filling' | 'filled' | 'error';

interface MutableDecisions extends FillDecisions {
  confirmed: Set<string>;
  includeSensitive: Set<string>;
  excluded: Set<string>;
  overwrite: Set<string>;
}

const newDecisions = (): MutableDecisions => ({ confirmed: new Set(), includeSensitive: new Set(), excluded: new Set(), overwrite: new Set() });

const state = {
  phase: 'loading' as Phase,
  view: 'home' as 'home' | 'review',
  tabId: 0,
  tabUrl: '',
  settings: DEFAULT_SETTINGS as Settings,
  index: null as ProfileIndex | null,
  profile: null as StoredProfile | null,
  analysis: null as PageAnalysis | null,
  assessments: [] as FieldAssessment[],
  decisions: newDecisions(),
  keyOverrides: new Map<string, FieldKey | null>(),
  optionOverrides: new Map<string, string>(),
  /** Choices made in the review screen, applied on confirm. `undefined` = untouched. */
  reviewDraft: new Map<string, FieldKey | null>(),
  reviewShowAll: false,
  reviewFocus: '',
  remember: true,
  fillResult: null as (TabFillResult & { total: number }) | null,
  errorMessage: '',
  showBlocked: false,
  profileMenuOpen: false,
};

const app = document.getElementById('app')!;

// ── Lifecycle ──────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  try {
    const [settings, index] = await Promise.all([getSettings(), getProfileIndex()]);
    state.settings = settings;
    state.index = index;
    state.remember = settings.rememberCorrections;
    applyTheme(settings.theme);
    state.profile = await getActiveProfile();

    // The e2e harness opens the popup as a tab and points it at a test page.
    const e2eTabId = __E2E__ ? Number(new URLSearchParams(location.search).get('tabId')) : 0;
    const [tab] = e2eTabId ? [await chrome.tabs.get(e2eTabId)] : await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tab?.id ?? 0;
    state.tabUrl = tab?.url ?? '';
    if (!tab?.id || isRestrictedUrl(tab.url)) {
      state.phase = 'restricted';
      paint();
      return;
    }
    if (settings.autoDetect) await scan();
    else {
      state.phase = 'idle';
      paint();
    }
  } catch (error) {
    logger.error('Popup failed to start', error);
    state.phase = 'error';
    state.errorMessage = 'One-Fill could not start. Try reopening the popup.';
    paint();
  }
}

async function scan(): Promise<void> {
  state.phase = 'scanning';
  state.view = 'home';
  paint();
  try {
    state.analysis = await analyzeTab(state.tabId);
    state.decisions = newDecisions();
    state.keyOverrides.clear();
    state.optionOverrides.clear();
    state.reviewDraft.clear();
    state.fillResult = null;
    reassess();
    state.phase = state.assessments.some((a) => a.status !== 'blocked') ? 'ready' : 'no-fields';
  } catch (error) {
    state.phase = 'error';
    state.errorMessage = friendlyError(error);
  }
  paint();
}

function reassess(): void {
  if (!state.analysis || !state.profile) return;
  state.assessments = assessFields(state.analysis.fields, state.analysis.matches, state.profile.data, {
    settings: state.settings,
    keyOverrides: state.keyOverrides,
    optionOverrides: state.optionOverrides,
    locale: navigator.language,
  });
}

function friendlyError(error: unknown): string {
  const message = describeError(error);
  if (/file:|file url/i.test(message) || state.tabUrl.startsWith('file:')) {
    return 'To use One-Fill on local files, enable “Allow access to file URLs” for One-Fill in chrome://extensions.';
  }
  if (/cannot access|cannot be scripted|permission/i.test(message)) {
    return 'Chrome doesn’t allow One-Fill to read this page.';
  }
  return 'Something went wrong while reading this page. Reload the page and try again.';
}

async function fill(): Promise<void> {
  if (!state.profile || !state.analysis) return;
  state.phase = 'filling';
  paint();
  try {
    const first = await fillTab(state.tabId, state.assessments, state.decisions, state.settings);
    const filledUids = new Set(first.filledUids);
    let filled = first.filled;

    // Second pass: dependent dropdowns (country → state) and fields revealed by the first fill.
    await new Promise((r) => setTimeout(r, 600));
    try {
      const again = await analyzeTab(state.tabId);
      state.analysis = again;
      reassess();
      const extra = state.assessments.filter((a) => a.status === 'ready' && !filledUids.has(a.uid) && !state.decisions.excluded.has(a.uid));
      if (extra.length) {
        const second = await fillTab(state.tabId, extra, newDecisions(), state.settings);
        filled += second.filled;
        second.filledUids.forEach((u) => filledUids.add(u));
        reassess();
      }
    } catch {
      /* the first pass already succeeded */
    }

    state.fillResult = { ...first, filled, filledUids: [...filledUids], total: filled };
    state.phase = 'filled';
    if (state.settings.saveHistory && filled > 0 && state.analysis) {
      await addHistoryEntry({
        domain: state.analysis.hostname,
        pageTitle: state.analysis.title,
        fieldsFilled: filled,
        profileId: state.profile.meta.id,
        trigger: 'popup',
      });
    }
  } catch (error) {
    state.phase = 'error';
    state.errorMessage = friendlyError(error);
  }
  paint();
}

async function undo(): Promise<void> {
  try {
    const restored = await undoTab(state.tabId);
    toast(restored ? `Restored ${restored} field${restored === 1 ? '' : 's'}` : 'Nothing to undo', 'info');
  } catch {
    toast('Couldn’t undo on this page', 'error');
  }
  await scan();
}

async function switchProfile(id: string): Promise<void> {
  state.profileMenuOpen = false;
  await setActiveProfile(id);
  state.index = await getProfileIndex();
  state.profile = await getActiveProfile();
  state.keyOverrides.clear();
  state.decisions = newDecisions();
  reassess();
  paint();
  toast(`Using “${state.profile.meta.name}”`, 'info');
}

function openOptions(hash = ''): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`options/options.html${hash ? `#${hash}` : ''}`) });
  window.close();
}

function openPrivacy(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('privacy/privacy.html') });
  window.close();
}

// ── Review actions ─────────────────────────────────────────────────────────────

function reviewItems(): FieldAssessment[] {
  // Uncertain matches first; unrecognised fields only when there's nothing uncertain to review.
  const uncertain = state.assessments.filter((a) => a.status === 'review');
  const primary = uncertain.length ? uncertain : state.assessments.filter((a) => a.status === 'unmatched');
  if (state.reviewShowAll) {
    const rest = state.assessments.filter((a) => !primary.includes(a) && a.status !== 'blocked');
    return [...primary, ...rest];
  }
  if (state.reviewFocus) {
    const focused = state.assessments.find((a) => a.uid === state.reviewFocus);
    if (focused && !primary.includes(focused)) return [focused, ...primary];
  }
  return primary;
}

function currentChoice(a: FieldAssessment): FieldKey | null {
  return state.reviewDraft.has(a.uid) ? state.reviewDraft.get(a.uid)! : a.key;
}

async function confirmReview(andFill: boolean): Promise<void> {
  const items = reviewItems();
  const remembered: Record<string, string> = {};
  for (const a of items) {
    const touched = state.reviewDraft.has(a.uid);
    const choice = currentChoice(a);
    // Untouched unmatched fields stay as they are; everything else shown counts as reviewed.
    if (!touched && a.status !== 'review' && a.uid !== state.reviewFocus) continue;
    if (touched || choice !== a.match.key) state.keyOverrides.set(a.uid, choice);
    if (choice) state.decisions.confirmed.add(a.uid);
    // Confirming a suggestion teaches One-Fill too: next time this field is filled without asking.
    if (state.remember && (touched || a.status === 'review')) remembered[fieldSignature(a.field)] = choice ?? SKIP_FIELD;
  }
  if (state.remember && state.analysis?.hostname && Object.keys(remembered).length) {
    await saveSiteOverrides(state.analysis.hostname, remembered);
  }
  state.reviewDraft.clear();
  state.reviewFocus = '';
  reassess();
  // Anything the user just confirmed and that is still in review (e.g. an imperfect option match) is accepted.
  for (const a of state.assessments) if (a.status === 'review' && state.keyOverrides.has(a.uid)) state.decisions.confirmed.add(a.uid);
  state.view = 'home';
  if (andFill) await fill();
  else paint();
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function paint(): void {
  const scroller = app.querySelector('.scroll');
  const scrollTop = scroller?.scrollTop ?? 0;
  app.setAttribute('aria-busy', String(state.phase === 'loading' || state.phase === 'scanning' || state.phase === 'filling'));
  render(app, state.view === 'review' ? reviewView() : homeView());
  const next = app.querySelector('.scroll');
  if (next) next.scrollTop = scrollTop;
}

function header(): HTMLElement {
  const index = state.index;
  const active = index?.profiles.find((p) => p.id === index.activeProfileId);
  const menu =
    state.profileMenuOpen && index
      ? h(
          'div',
          { class: 'menu', attrs: { role: 'menu' } },
          index.profiles.map((p) =>
            h(
              'button',
              { class: 'menu-item', attrs: { role: 'menuitemradio', 'aria-checked': p.id === index.activeProfileId }, on: { click: () => void switchProfile(p.id) } },
              h('span', { class: 'menu-emoji' }, p.emoji),
              h('span', { class: 'menu-label' }, p.name),
              p.id === index.activeProfileId ? icon('check', 16) : null,
            ),
          ),
          h('div', { class: 'menu-sep' }),
          h('button', { class: 'menu-item', on: { click: () => openOptions('profiles') } }, icon('pencil', 15), h('span', { class: 'menu-label' }, 'Manage profiles')),
        )
      : null;

  return h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, logoMark(26), h('span', null, 'One-Fill')),
    h(
      'div',
      { class: 'topbar-actions' },
      active
        ? h(
            'div',
            { class: 'profile-switch' },
            h(
              'button',
              {
                class: 'profile-chip',
                attrs: { 'aria-haspopup': 'menu', 'aria-expanded': state.profileMenuOpen, title: 'Switch profile' },
                on: {
                  click: () => {
                    state.profileMenuOpen = !state.profileMenuOpen;
                    paint();
                  },
                },
              },
              h('span', null, active.emoji),
              h('span', { class: 'profile-chip-name' }, active.name),
              icon('chevronDown', 14),
            ),
            menu,
          )
        : null,
      h('button', { class: 'icon-btn', attrs: { title: 'Settings', 'aria-label': 'Settings' }, on: { click: () => openOptions('settings') } }, icon('sliders', 18)),
    ),
  );
}

function footer(): HTMLElement {
  const item = (label: string, name: IconName, onClick: () => void) =>
    h('button', { class: 'nav-item', on: { click: onClick } }, icon(name, 17), h('span', null, label));
  return h(
    'nav',
    { class: 'bottom-nav', attrs: { 'aria-label': 'One-Fill' } },
    item('Profile', 'user', () => openOptions('personal')),
    item('History', 'clock', () => openOptions('history')),
    item('Settings', 'sliders', () => openOptions('settings')),
    item('Privacy', 'shieldCheck', openPrivacy),
  );
}

function greeting(): HTMLElement | null {
  if (!state.profile) return null;
  const completeness = computeCompleteness(state.profile.data);
  const name = state.profile.data.personal.firstName.trim();
  const setupNeeded = completeness.completed < 3;
  return h(
    'section',
    { class: 'greeting' },
    h('h1', null, name ? `Hello, ${name} ` : 'Hello there ', h('span', { class: 'wave', attrs: { 'aria-hidden': 'true' } }, '👋')),
    setupNeeded
      ? h(
          'div',
          { class: 'setup card' },
          h('div', { class: 'setup-icon' }, icon('sparkles', 20)),
          h('div', { class: 'setup-text' }, h('strong', null, 'Set up your profile once'), h('span', null, 'Add your details and fill forms anywhere.')),
          h('button', { class: 'btn btn-primary btn-sm', on: { click: () => openOptions('personal') } }, 'Start'),
        )
      : h(
          'button',
          { class: 'completeness', on: { click: () => openOptions('personal') }, attrs: { title: 'Open your profile' } },
          h('span', { class: 'completeness-label' }, `Profile ${completeness.percent}% complete`),
          h('span', { class: 'progress' }, h('span', { style: { width: `${completeness.percent}%` } })),
          icon('chevronRight', 15),
        ),
  );
}

function homeView(): Child[] {
  return [header(), h('div', { class: 'scroll' }, greeting(), phaseContent()), footer()];
}

function phaseContent(): Child {
  switch (state.phase) {
    case 'loading':
    case 'scanning':
      return scanningCard();
    case 'restricted':
      return emptyCard('lock', 'One-Fill can’t run on this page', 'Chrome doesn’t let extensions fill forms on internal pages or the Web Store. Open a website with a form to get started.');
    case 'idle':
      return emptyCard('search', 'Ready when you are', 'Scan this page to find form fields you can fill.', h('button', { class: 'btn btn-primary', on: { click: () => void scan() } }, icon('search', 16), 'Scan page'));
    case 'no-fields':
      return emptyCard('clipboard', 'No form fields found', 'This page doesn’t have fields One-Fill can fill. If the form appears after you click something, scan again.', h('button', { class: 'btn btn-secondary', on: { click: () => void scan() } }, icon('refresh', 16), 'Scan again'));
    case 'error':
      return emptyCard('alert', 'Couldn’t read this page', state.errorMessage, h('button', { class: 'btn btn-secondary', on: { click: () => void scan() } }, icon('refresh', 16), 'Try again'));
    case 'filling':
      return h('div', null, summaryCard(true), fieldList());
    case 'filled':
      return h('div', null, filledBanner(), summaryCard(false), fieldList());
    case 'ready':
      return h('div', null, summaryCard(false), fieldList());
  }
}

function emptyCard(name: IconName, title: string, text: string, action?: Child): HTMLElement {
  return h('section', { class: 'card state-card' }, h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon(name, 22)), h('h3', null, title), h('p', null, text), action ?? null));
}

function scanningCard(): HTMLElement {
  return h(
    'section',
    { class: 'card summary', attrs: { 'aria-label': 'Scanning page' } },
    h('div', { class: 'summary-head' }, h('div', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }), h('div', null, h('strong', null, 'Scanning page…'), h('div', { class: 'subtle small' }, 'Looking for form fields'))),
    h('div', { class: 'skeleton-list' }, [0, 1, 2, 3].map(() => h('div', { class: 'skeleton-row' }, h('div', { class: 'skeleton sk-dot' }), h('div', { class: 'skeleton sk-line' }), h('div', { class: 'skeleton sk-short' })))),
  );
}

function summaryCard(busy: boolean): HTMLElement {
  const s = summarize(state.assessments);
  const toFill = state.assessments.filter((a) => willFill(a, state.decisions, state.settings.sensitivePolicy)).length;
  const percent = s.total ? Math.round((s.matched / s.total) * 100) : 0;
  const host = state.analysis?.hostname ?? '';
  const frames = new Set(state.analysis?.fields.map((f) => f.frameId)).size;

  return h(
    'section',
    { class: 'card summary' },
    h(
      'div',
      { class: 'summary-head' },
      h('div', { class: 'detected-badge' }, icon('check', 16)),
      h(
        'div',
        { class: 'summary-title' },
        h('strong', null, 'Form detected'),
        h('div', { class: 'subtle small' }, `${s.total} field${s.total === 1 ? '' : 's'} found${host ? ` on ${host}` : ''}${frames > 1 ? ` · ${frames} frames` : ''}`),
      ),
      h('button', { class: 'icon-btn', attrs: { title: 'Scan again', 'aria-label': 'Scan again' }, disabled: busy, on: { click: () => void scan() } }, icon('refresh', 17)),
    ),
    h(
      'div',
      { class: 'match-meter' },
      h('div', { class: 'match-numbers' }, h('span', { class: 'big' }, String(s.matched)), h('span', { class: 'muted' }, ` / ${s.total} fields matched`)),
      h('div', { class: 'progress' }, h('span', { style: { width: `${percent}%` } })),
    ),
    h(
      'div',
      { class: 'stat-row' },
      s.ready ? h('span', { class: 'chip chip-success' }, icon('check', 13), `${s.ready} ready`) : null,
      s.review ? h('span', { class: 'chip chip-warning' }, icon('alert', 13), `${s.review} need review`) : null,
      s.sensitive ? h('span', { class: 'chip chip-sensitive' }, icon('lock', 13), `${s.sensitive} sensitive`) : null,
      s.missing ? h('span', { class: 'chip' }, icon('plus', 13), `${s.missing} not in profile`) : null,
      s.unmatched ? h('span', { class: 'chip' }, icon('help', 13), `${s.unmatched} unknown`) : null,
    ),
    h(
      'div',
      { class: 'actions' },
      state.phase === 'filled' && toFill === 0
        ? h('button', { class: 'btn btn-primary btn-lg btn-block', on: { click: () => window.close() } }, icon('check', 17), 'Done')
        : h(
            'button',
            { class: 'btn btn-primary btn-lg btn-block', disabled: busy || toFill === 0, on: { click: () => void fill() } },
            busy ? [h('span', { class: 'spinner spinner-light', attrs: { 'aria-hidden': 'true' } }), 'Filling…'] : [icon('zap', 17), toFill ? `Fill ${toFill} field${toFill === 1 ? '' : 's'}` : 'Nothing to fill yet'],
          ),
      h(
        'button',
        {
          class: 'btn btn-secondary btn-block',
          disabled: busy,
          on: {
            click: () => {
              state.view = 'review';
              state.reviewShowAll = s.review + s.unmatched + s.missing === 0;
              paint();
            },
          },
        },
        'Review matches',
        s.review ? h('span', { class: 'count-badge' }, String(s.review)) : null,
      ),
    ),
  );
}

function filledBanner(): HTMLElement | null {
  const result = state.fillResult;
  if (!result) return null;
  const failed = result.failedUids.length;
  const pending = state.assessments.filter((a) => a.status === 'review').length;
  return h(
    'section',
    { class: ['banner', result.total ? 'banner-success' : 'banner-warning'] },
    h('div', { class: 'banner-icon' }, icon(result.total ? 'check' : 'alert', 18)),
    h(
      'div',
      { class: 'banner-text' },
      h('strong', null, result.total ? `${result.total} field${result.total === 1 ? '' : 's'} filled` : 'No fields were filled'),
      h(
        'span',
        null,
        [failed ? `${failed} couldn’t be filled` : '', pending ? `${pending} still need review` : '', !failed && !pending ? 'Double-check before submitting' : '']
          .filter(Boolean)
          .join(' · '),
      ),
    ),
    result.total ? h('button', { class: 'btn btn-ghost btn-sm', on: { click: () => void undo() } }, icon('undo', 15), 'Undo') : null,
  );
}

const STATUS_META: Record<AssessmentStatus, { icon: IconName; tone: string; rank: number }> = {
  ready: { icon: 'check', tone: 'ok', rank: 0 },
  review: { icon: 'alert', tone: 'warn', rank: 1 },
  sensitive: { icon: 'lock', tone: 'sensitive', rank: 2 },
  prefilled: { icon: 'pencil', tone: 'muted', rank: 3 },
  missing: { icon: 'plus', tone: 'muted', rank: 4 },
  unmatched: { icon: 'help', tone: 'muted', rank: 5 },
  unsupported: { icon: 'info', tone: 'muted', rank: 6 },
  blocked: { icon: 'shield', tone: 'muted', rank: 7 },
};

function fieldList(): HTMLElement {
  const filled = new Set(state.fillResult?.filledUids ?? []);
  const visible = state.assessments
    .filter((a) => a.status !== 'blocked')
    .sort((a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank || a.field.order - b.field.order);
  const blocked = state.assessments.filter((a) => a.status === 'blocked');

  return h(
    'section',
    { class: 'field-list', attrs: { 'aria-label': 'Detected fields' } },
    h('h2', { class: 'list-title' }, 'Detected fields'),
    h('ul', { class: 'rows' }, visible.map((a) => fieldRow(a, filled.has(a.uid)))),
    blocked.length
      ? h(
          'div',
          { class: 'blocked' },
          h(
            'button',
            {
              class: 'blocked-toggle',
              attrs: { 'aria-expanded': state.showBlocked },
              on: {
                click: () => {
                  state.showBlocked = !state.showBlocked;
                  paint();
                },
              },
            },
            icon('shieldCheck', 15),
            `${blocked.length} field${blocked.length === 1 ? '' : 's'} skipped for your safety`,
            icon(state.showBlocked ? 'chevronDown' : 'chevronRight', 14),
          ),
          state.showBlocked ? h('ul', { class: 'blocked-list' }, blocked.map((a) => h('li', null, h('span', null, a.match.detectedLabel), h('span', { class: 'subtle' }, a.note)))) : null,
        )
      : null,
  );
}

function fieldRow(a: FieldAssessment, justFilled: boolean): HTMLElement {
  const meta = STATUS_META[a.status];
  const label = a.match.detectedLabel;
  const confidence = a.status === 'review' || (a.status === 'ready' && a.confidence < 0.9) ? `${Math.round(a.confidence * 100)}%` : '';

  let value: Child = h('span', { class: 'row-value' }, a.displayValue);
  let control: Child = null;
  const openReview = () => {
    state.view = 'review';
    state.reviewFocus = a.uid;
    state.reviewShowAll = false;
    paint();
  };

  switch (a.status) {
    case 'review':
      value = h('span', { class: 'row-value warn' }, a.note || 'Needs confirmation');
      break;
    case 'sensitive': {
      const disabled = state.settings.sensitivePolicy === 'never';
      control = h(
        'label',
        { class: 'include', attrs: { title: disabled ? 'Sensitive fields are turned off in Settings' : 'Fill this sensitive field' } },
        h('input', {
          type: 'checkbox',
          class: 'check',
          checked: state.decisions.includeSensitive.has(a.uid),
          disabled,
          attrs: { 'aria-label': `Include ${label}` },
          on: {
            change: (e: Event) => {
              const checked = (e.target as HTMLInputElement).checked;
              if (checked) state.decisions.includeSensitive.add(a.uid);
              else state.decisions.includeSensitive.delete(a.uid);
              paint();
            },
          },
        }),
        h('span', null, 'Include'),
      );
      break;
    }
    case 'prefilled':
      value = h('span', { class: 'row-value subtle' }, 'Already filled');
      control = h(
        'label',
        { class: 'include', attrs: { title: 'Replace the value on the page' } },
        h('input', {
          type: 'checkbox',
          class: 'check',
          checked: state.decisions.overwrite.has(a.uid),
          attrs: { 'aria-label': `Overwrite ${label}` },
          on: {
            change: (e: Event) => {
              const checked = (e.target as HTMLInputElement).checked;
              if (checked) state.decisions.overwrite.add(a.uid);
              else state.decisions.overwrite.delete(a.uid);
              paint();
            },
          },
        }),
        h('span', null, 'Replace'),
      );
      break;
    case 'missing':
      value = h(
        'button',
        { class: 'link-btn', on: { click: () => openOptions(a.key ? a.key.split('.')[0]! : 'personal') } },
        `Add ${a.key ? fieldLabel(a.key).toLowerCase() : 'to profile'}`,
      );
      break;
    case 'unmatched':
    case 'unsupported':
      value = h('span', { class: 'row-value subtle' }, a.note);
      break;
    default:
      break;
  }

  const clickable = a.status === 'review' || a.status === 'ready' || a.status === 'unmatched';
  return h(
    'li',
    { class: ['row', `row-${meta.tone}`, justFilled && 'row-filled', state.decisions.excluded.has(a.uid) && 'row-excluded'] },
    h('span', { class: ['row-icon', `tone-${meta.tone}`], attrs: { 'aria-hidden': 'true' } }, icon(justFilled ? 'check' : meta.icon, 14)),
    h(
      clickable ? 'button' : 'div',
      clickable ? { class: 'row-main', on: { click: openReview }, attrs: { title: 'Review this match' } } : { class: 'row-main' },
      h('span', { class: 'row-label' }, label, confidence ? h('span', { class: 'row-confidence' }, confidence) : null),
      value,
    ),
    control,
  );
}

// ── Review view ────────────────────────────────────────────────────────────────

const KEYS_BY_SECTION = (() => {
  const map = new Map<ProfileSection, typeof FIELD_DEFINITIONS[number][]>();
  for (const def of FIELD_DEFINITIONS) {
    const list = map.get(def.section) ?? [];
    list.push(def);
    map.set(def.section, list);
  }
  return map;
})();

function valuePreview(a: FieldAssessment, key: FieldKey): string {
  if (!state.profile) return '';
  const value = resolveProfileValue(state.profile.data, key, a.match.qualifiers);
  return value ? displayValueFor(key, value, state.profile.data) : '';
}

function reviewView(): Child[] {
  const items = reviewItems();
  const host = state.analysis?.hostname ?? 'this site';
  return [
    h(
      'header',
      { class: 'topbar' },
      h(
        'button',
        {
          class: 'icon-btn',
          attrs: { 'aria-label': 'Back' },
          on: {
            click: () => {
              state.view = 'home';
              state.reviewDraft.clear();
              state.reviewFocus = '';
              paint();
            },
          },
        },
        icon('chevronLeft', 20),
      ),
      h('div', { class: 'review-title' }, h('strong', null, 'Review matches'), h('span', { class: 'subtle small' }, `${items.length} field${items.length === 1 ? '' : 's'}`)),
      h('span', { style: 'width:32px' }),
    ),
    h(
      'div',
      { class: 'scroll review-scroll' },
      items.length === 0 ? emptyCard('check', 'Everything looks good', 'All detected fields are matched confidently.') : null,
      items.map((a) => reviewCard(a)),
      h(
        'button',
        {
          class: 'link-btn show-all',
          on: {
            click: () => {
              state.reviewShowAll = !state.reviewShowAll;
              paint();
            },
          },
        },
        state.reviewShowAll ? 'Show only fields that need attention' : 'Show all detected fields',
      ),
    ),
    h(
      'footer',
      { class: 'review-footer' },
      h(
        'label',
        { class: 'remember' },
        h('input', {
          type: 'checkbox',
          class: 'check',
          checked: state.remember,
          on: { change: (e: Event) => (state.remember = (e.target as HTMLInputElement).checked) },
        }),
        h('span', null, `Remember my choices on ${host}`),
      ),
      h(
        'div',
        { class: 'review-actions' },
        h('button', { class: 'btn btn-secondary', on: { click: () => void confirmReview(false) } }, 'Confirm'),
        h('button', { class: 'btn btn-primary', on: { click: () => void confirmReview(true) } }, icon('zap', 16), 'Confirm & fill'),
      ),
    ),
  ];
}

function reviewCard(a: FieldAssessment): HTMLElement {
  const choice = currentChoice(a);
  const name = `choice-${a.uid}`;
  const candidates = a.match.candidates.map((c) => c.key).filter((k, i, arr) => arr.indexOf(k) === i).slice(0, 3);
  if (a.key && !candidates.includes(a.key)) candidates.unshift(a.key);
  const choiceIsOther = choice !== null && !candidates.includes(choice);

  const setChoice = (key: FieldKey | null) => {
    state.reviewDraft.set(a.uid, key);
    paint();
  };

  const radio = (key: FieldKey | null, label: Child, preview: string, checked: boolean) =>
    h(
      'label',
      { class: ['option', checked && 'option-checked'] },
      h('input', { type: 'radio', name, checked, on: { change: () => setChoice(key) } }),
      h('span', { class: 'option-label' }, label),
      key ? h('span', { class: ['option-value', !preview && 'subtle'] }, preview || 'Not in your profile') : null,
    );

  const statusChip =
    a.status === 'review'
      ? h('span', { class: 'chip chip-warning' }, `${Math.round(a.confidence * 100)}% match`)
      : a.status === 'ready'
        ? h('span', { class: 'chip chip-success' }, a.match.source === 'user' ? 'Your choice' : `${Math.round(a.confidence * 100)}% match`)
        : a.status === 'missing'
          ? h('span', { class: 'chip' }, 'Not in profile')
          : a.status === 'sensitive'
            ? h('span', { class: 'chip chip-sensitive' }, icon('lock', 12), 'Sensitive')
            : h('span', { class: 'chip' }, 'No match');

  const otherSelect = h(
    'select',
    {
      class: 'select select-sm',
      attrs: { 'aria-label': 'Choose another profile field' },
      on: { change: (e: Event) => setChoice(((e.target as HTMLSelectElement).value || null) as FieldKey | null) },
    },
    h('option', { value: '', selected: !choiceIsOther }, 'Another field…'),
    [...KEYS_BY_SECTION].map(([section, defs]) =>
      h('optgroup', { label: SECTION_LABELS[section] }, defs.map((d) => h('option', { value: d.key, selected: choiceIsOther && choice === d.key }, d.label))),
    ),
  );

  const optionPicker =
    (a.field.kind === 'select' || a.field.kind === 'radio-group') && choice && a.note.startsWith('No option')
      ? h(
          'div',
          { class: 'option-picker' },
          h('span', { class: 'small muted' }, 'Pick the option to use:'),
          h(
            'select',
            {
              class: 'select select-sm',
              on: {
                change: (e: Event) => {
                  const value = (e.target as HTMLSelectElement).value;
                  if (value) state.optionOverrides.set(a.uid, value);
                  else state.optionOverrides.delete(a.uid);
                },
              },
            },
            h('option', { value: '' }, 'Choose…'),
            a.field.options.filter((o) => !o.disabled).map((o) => h('option', { value: o.id, selected: state.optionOverrides.get(a.uid) === o.id }, o.text || o.value)),
          ),
        )
      : null;

  return h(
    'article',
    { class: ['card', 'review-card', state.reviewFocus === a.uid && 'review-focus'], attrs: { 'aria-label': a.match.detectedLabel } },
    h('div', { class: 'review-head' }, h('strong', { class: 'review-label' }, a.match.detectedLabel), statusChip),
    h('p', { class: 'review-question' }, 'What should this field contain?'),
    h(
      'div',
      { class: 'options', attrs: { role: 'radiogroup', 'aria-label': `Mapping for ${a.match.detectedLabel}` } },
      candidates.map((key) => radio(key, fieldLabel(key), valuePreview(a, key), choice === key)),
      h(
        'label',
        { class: ['option', choiceIsOther && 'option-checked'] },
        h('input', {
          type: 'radio',
          name,
          checked: choiceIsOther,
          on: { change: () => (otherSelect as HTMLSelectElement).focus() },
        }),
        otherSelect,
        choiceIsOther && choice ? h('span', { class: ['option-value', !valuePreview(a, choice) && 'subtle'] }, valuePreview(a, choice) || 'Not in your profile') : null,
      ),
      radio(null, 'Leave empty', '', choice === null),
    ),
    optionPicker,
    a.status === 'review' && a.confidence >= CONFIDENCE.READY && a.note ? h('p', { class: 'small muted' }, a.note) : null,
  );
}

document.addEventListener('click', (e) => {
  if (state.profileMenuOpen && !(e.target as Element).closest('.profile-switch')) {
    state.profileMenuOpen = false;
    paint();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.profileMenuOpen) {
    state.profileMenuOpen = false;
    paint();
  }
});

paint();
void init();
