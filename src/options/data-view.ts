import { buildExport, exportFileName, ImportError, isEncryptedExport, parseImport, type ExportedProfile, type ExportPayload } from '../core/import-export';
import { getDocument, saveDocument } from '../storage/document-storage';
import { createProfile, ensureInitialized, getProfile, saveProfileData, setActiveProfile } from '../storage/profile-storage';
import { getSettings, updateSettings } from '../storage/settings-storage';
import { getStore } from '../storage/store';
import type { FilePayload } from '../types/fields';
import type { ProfileIndex, StoredProfile } from '../types/profile';
import { h } from '../ui/dom';
import { openDialog } from '../ui/dialog';
import { icon } from '../ui/icons';
import { toast } from '../ui/theme';
import { createId } from '../utils/ids';

export interface DataContext {
  index: ProfileIndex;
  active: StoredProfile;
  /** Reload everything after data changed underneath the page. */
  reload(): Promise<void>;
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function countFilled(profile: ExportedProfile): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (typeof v === 'string') n += v.trim() ? 1 : 0;
    else if (typeof v === 'number') n += 1;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'id' && typeof x !== 'boolean' && walk(x));
  };
  walk(profile.data);
  return n;
}

export function renderData(ctx: DataContext): HTMLElement {
  // ── Export ──
  const scope = { value: 'active' as 'active' | 'all' };
  const includeIds = h('input', { type: 'checkbox', class: 'check' });
  const includeFiles = h('input', { type: 'checkbox', class: 'check', checked: true });
  const includeSettings = h('input', { type: 'checkbox', class: 'check', checked: true });
  const usePassword = h('input', { type: 'checkbox', class: 'check' });
  const password = h('input', { class: 'input', type: 'password', placeholder: 'Password', attrs: { autocomplete: 'new-password', 'aria-label': 'Export password' } });
  const confirm = h('input', { class: 'input', type: 'password', placeholder: 'Repeat password', attrs: { autocomplete: 'new-password', 'aria-label': 'Repeat password' } });
  const passwordFields = h('div', { class: 'password-fields', attrs: { hidden: true } }, password, confirm, h('p', { class: 'subtle small' }, 'AES-256 encryption. If you forget this password, the file can’t be opened.'));
  usePassword.addEventListener('change', () => (passwordFields.hidden = !usePassword.checked));

  const doExport = async () => {
    if (usePassword.checked) {
      if (password.value.length < 8) return toast('Use a password of at least 8 characters', 'error');
      if (password.value !== confirm.value) return toast('Passwords don’t match', 'error');
    }
    if (includeIds.checked && !usePassword.checked) {
      const ok = await openDialog({
        title: 'Export IDs without a password?',
        body: 'The file will contain your PAN, Aadhaar and other ID numbers in plain text. Anyone with the file can read them.',
        confirmLabel: 'Export anyway',
        danger: true,
      });
      if (!ok) return;
    }
    const ids = scope.value === 'all' ? ctx.index.profiles.map((p) => p.id) : [ctx.active.meta.id];
    const profiles: ExportedProfile[] = [];
    for (const id of ids) {
      const stored = await getProfile(id);
      if (!stored) continue;
      const documents: Record<string, FilePayload> = {};
      if (includeFiles.checked) {
        for (const r of stored.data.professional.resumes) {
          const doc = await getDocument(r.id);
          if (doc) documents[r.id] = doc;
        }
      } else {
        stored.data.professional.resumes = [];
      }
      profiles.push({ meta: stored.meta, data: stored.data, documents });
    }
    const payload: ExportPayload = includeSettings.checked ? { profiles, settings: await getSettings() } : { profiles };
    const envelope = await buildExport(payload, {
      includeIdentification: includeIds.checked,
      password: usePassword.checked ? password.value : undefined,
      appVersion: chrome.runtime.getManifest().version,
    });
    download(exportFileName(), JSON.stringify(envelope, null, 2));
    password.value = confirm.value = '';
    toast('Profile exported');
  };

  const scopeControl = h(
    'div',
    { class: 'segmented', attrs: { role: 'group', 'aria-label': 'What to export' } },
    ...(['active', 'all'] as const).map((value) => {
      const button = h('button', { type: 'button', attrs: { 'aria-pressed': String(scope.value === value) } }, value === 'active' ? `${ctx.active.meta.emoji} ${ctx.active.meta.name}` : `All profiles (${ctx.index.profiles.length})`);
      button.addEventListener('click', () => {
        scope.value = value;
        button.parentElement?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      });
      return button;
    }),
  );

  const option = (input: HTMLInputElement, title: string, text: string) =>
    h('label', { class: 'option-row' }, input, h('span', null, h('strong', null, title), h('span', { class: 'muted small' }, text)));

  // ── Import ──
  const preview = h('div', { class: 'import-preview' });
  const fileInput = h('input', { type: 'file', class: 'sr-only', attrs: { accept: '.json,application/json', 'aria-label': 'Choose an export file' } });

  const applyImport = async (payload: ExportPayload, mode: 'new' | 'replace', withSettings: boolean) => {
    const storeDocs = async (profile: ExportedProfile) => {
      // Fresh ids avoid clobbering files that belong to existing profiles.
      for (const resume of profile.data.professional.resumes) {
        const doc = profile.documents?.[resume.id];
        if (!doc) continue;
        const id = createId('doc');
        await saveDocument(id, doc);
        resume.id = id;
      }
    };
    if (mode === 'replace') {
      const first = payload.profiles[0]!;
      await storeDocs(first);
      await saveProfileData(ctx.active.meta.id, first.data);
    } else {
      let lastId = '';
      for (const profile of payload.profiles) {
        await storeDocs(profile);
        const created = await createProfile(profile.meta.name, profile.meta.emoji, profile.data);
        lastId = created.meta.id;
      }
      if (lastId) await setActiveProfile(lastId);
    }
    if (withSettings && payload.settings) await updateSettings(payload.settings);
    toast('Import complete');
    await ctx.reload();
  };

  const showPreview = (payload: ExportPayload) => {
    const settingsBox = h('input', { type: 'checkbox', class: 'check' });
    preview.replaceChildren(
      h(
        'div',
        { class: 'card import-card' },
        h('h3', null, icon('check', 16), `Found ${payload.profiles.length} profile${payload.profiles.length === 1 ? '' : 's'}`),
        h(
          'ul',
          { class: 'import-list' },
          payload.profiles.map((p) => {
            const name = [p.data.personal.firstName, p.data.personal.lastName].filter(Boolean).join(' ') || p.data.personal.fullName;
            return h('li', null, h('span', null, `${p.meta.emoji} ${p.meta.name}`), h('span', { class: 'muted small' }, `${name ? `${name} · ` : ''}${countFilled(p)} details`));
          }),
        ),
        payload.settings ? option(settingsBox, 'Also import settings', 'Theme, filling preferences and disabled sites.') : null,
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => void applyImport(payload, 'new', settingsBox.checked) } }, icon('plus', 15), payload.profiles.length > 1 ? 'Add as new profiles' : 'Add as new profile'),
          payload.profiles.length === 1
            ? h(
                'button',
                {
                  class: 'btn btn-secondary',
                  type: 'button',
                  on: {
                    click: async () => {
                      const ok = await openDialog({ title: `Replace “${ctx.active.meta.name}”?`, body: 'Everything in this profile will be replaced with the imported data.', confirmLabel: 'Replace', danger: true });
                      if (ok) await applyImport(payload, 'replace', settingsBox.checked);
                    },
                  },
                },
                `Replace “${ctx.active.meta.name}”`,
              )
            : null,
        ),
      ),
    );
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const text = await file.text();
    let passwordValue: string | undefined;
    if (isEncryptedExport(text)) {
      const answer = await openDialog({ title: 'This export is password-protected', confirmLabel: 'Unlock', input: { label: 'Password', type: 'password', required: true } });
      if (answer === null || answer === true) return;
      passwordValue = answer;
    }
    try {
      showPreview(await parseImport(text, passwordValue));
    } catch (error) {
      preview.replaceChildren(h('div', { class: 'notice notice-error' }, icon('alert', 17), h('span', null, error instanceof ImportError ? error.message : 'This file couldn’t be imported.')));
    }
  });

  // ── Danger zone ──
  const deleteEverything = async () => {
    const answer = await openDialog({
      title: 'Delete all One-Fill data?',
      body: 'This permanently deletes every profile, resume, setting and history entry stored by One-Fill on this device.',
      confirmLabel: 'Delete everything',
      danger: true,
      input: { label: 'Type DELETE to confirm', required: true, mustEqual: 'DELETE' },
    });
    if (answer !== 'DELETE') return;
    await getStore().clear();
    await ensureInitialized();
    toast('All data deleted');
    await ctx.reload();
  };

  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Import & export'), h('p', { class: 'muted' }, 'Move your profile between browsers or keep a backup. Files are created on your device — nothing is uploaded.')),
    h(
      'section',
      { class: 'card data-card' },
      h('div', { class: 'data-head' }, h('div', { class: 'section-icon' }, icon('download', 19)), h('div', null, h('h2', null, 'Export'), h('p', { class: 'muted' }, 'Download a structured JSON file of your profile.'))),
      scopeControl,
      h(
        'div',
        { class: 'option-list' },
        option(includeFiles, 'Include resume files', 'Needed to attach resumes after importing elsewhere.'),
        option(includeSettings, 'Include settings', 'Your filling preferences and disabled sites.'),
        option(includeIds, 'Include identification numbers', 'PAN, Aadhaar, passport and other IDs. Off by default.'),
        option(usePassword, 'Protect with a password', 'Encrypts the whole file. Recommended when including IDs.'),
        passwordFields,
      ),
      h('div', { class: 'button-row' }, h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => void doExport() } }, icon('download', 16), 'Export profile')),
    ),
    h(
      'section',
      { class: 'card data-card' },
      h('div', { class: 'data-head' }, h('div', { class: 'section-icon' }, icon('upload', 19)), h('div', null, h('h2', null, 'Import'), h('p', { class: 'muted' }, 'Restore a One-Fill export. You’ll see what’s inside before anything changes.'))),
      h('div', { class: 'button-row' }, h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => fileInput.click() } }, icon('upload', 16), 'Choose file…'), fileInput),
      preview,
    ),
    h(
      'section',
      { class: 'card data-card danger-zone' },
      h('div', { class: 'data-head' }, h('div', { class: 'section-icon danger' }, icon('trash', 19)), h('div', null, h('h2', null, 'Delete all data'), h('p', { class: 'muted' }, 'Remove every profile, file, setting and history entry from this browser.'))),
      h('div', { class: 'button-row' }, h('button', { class: 'btn btn-danger', type: 'button', on: { click: () => void deleteEverything() } }, 'Delete all data…')),
    ),
  );
}
