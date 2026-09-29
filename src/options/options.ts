import { computeCompleteness, type CompletenessItem } from '../core/completeness';
import { hasSiteAccess, revokeSiteAccess } from '../extension/permissions';
import { collectOrphanDocuments, deleteDocuments } from '../storage/document-storage';
import {
  createProfile,
  deleteProfile,
  duplicateProfile,
  getActiveProfile,
  getProfile,
  getProfileIndex,
  saveProfileData,
  setActiveProfile,
  updateProfileMeta,
} from '../storage/profile-storage';
import { getSettings, updateSettings } from '../storage/settings-storage';
import { getStore, STORAGE_KEYS } from '../storage/store';
import type { ProfileIndex, StoredProfile, UserProfile } from '../types/profile';
import type { Settings } from '../types/settings';
import { h, render, type Child } from '../ui/dom';
import { openDialog } from '../ui/dialog';
import { icon, logoMark, type IconName } from '../ui/icons';
import { applyTheme, toast } from '../ui/theme';
import type { ValidationProblem } from '../utils/validation';
import { renderData } from './data-view';
import { renderHistory } from './history-view';
import { PROFILE_SECTIONS, renderProfileEditor } from './profile-editor';
import { validateProfile } from './profile-validation';
import { renderSettings } from './settings-view';

type Route = 'profile' | 'settings' | 'history' | 'data' | 'privacy';

const PROFILE_EMOJIS = ['👤', '💼', '🎓', '🏠', '🧑‍💻', '🌍', '⭐', '🗂️'];

const state = {
  route: 'profile' as Route,
  index: null as unknown as ProfileIndex,
  saved: null as unknown as StoredProfile,
  draft: null as unknown as UserProfile,
  dirty: false,
  errors: new Map<string, ValidationProblem>(),
  settings: null as unknown as Settings,
  welcome: new URLSearchParams(location.search).has('welcome'),
  /** Files uploaded during this editing session (deleted again on discard). */
  newDocuments: new Set<string>(),
};

const root = document.getElementById('app')!;
let content: HTMLElement;
let saveBar: HTMLElement;

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadProfile(): Promise<void> {
  state.index = await getProfileIndex();
  state.saved = await getActiveProfile();
  state.draft = structuredClone(state.saved.data);
  state.dirty = false;
  state.errors.clear();
  state.newDocuments.clear();
}

async function reloadAll(): Promise<void> {
  state.settings = await getSettings();
  applyTheme(state.settings.theme);
  await loadProfile();
  paintShell();
}

function markDirty(): void {
  if (!state.dirty) {
    state.dirty = true;
    updateSaveBar();
  }
}

async function save(): Promise<void> {
  const problems = validateProfile(state.draft);
  state.errors = problems;
  const errors = [...problems.entries()].filter(([, p]) => p.level === 'error');
  if (errors.length) {
    paintContent();
    toast(`Please fix ${errors.length} field${errors.length === 1 ? '' : 's'} before saving`, 'error');
    const first = document.getElementById(`f-${errors[0]![0]}`);
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first?.focus({ preventScroll: true });
    return;
  }
  const removedDocs = state.saved.data.professional.resumes.map((r) => r.id).filter((id) => !state.draft.professional.resumes.some((r) => r.id === id));
  await saveProfileData(state.saved.meta.id, state.draft);
  await deleteDocuments(removedDocs);
  state.newDocuments.clear();
  const stored = await getProfile(state.saved.meta.id);
  if (stored) state.saved = stored;
  state.index = await getProfileIndex();
  state.dirty = false;
  updateSaveBar();
  paintContent(true);
  paintSidebar();
  toast('Profile saved');
}

async function discard(): Promise<void> {
  await deleteDocuments([...state.newDocuments]);
  state.draft = structuredClone(state.saved.data);
  state.dirty = false;
  state.errors.clear();
  state.newDocuments.clear();
  updateSaveBar();
  paintContent(true);
}

/** Returns false when the user wants to keep editing. */
async function confirmLeaveDirty(): Promise<boolean> {
  if (!state.dirty) return true;
  const answer = await openDialog({
    title: 'Discard unsaved changes?',
    body: 'You have changes to this profile that haven’t been saved.',
    confirmLabel: 'Discard changes',
    danger: true,
  });
  if (answer) await discard();
  return answer !== null;
}

// ── Routing ───────────────────────────────────────────────────────────────────

const SECTION_IDS = new Set(PROFILE_SECTIONS.map((s) => s.id));

function routeFromHash(): { route: Route; section?: string } {
  const hash = location.hash.replace('#', '');
  if (['settings', 'history', 'data', 'privacy'].includes(hash)) return { route: hash as Route };
  if (SECTION_IDS.has(hash)) return { route: 'profile', section: hash };
  if (hash === 'profiles') return { route: 'profile', section: 'top' };
  return { route: 'profile' };
}

async function navigate(): Promise<void> {
  const { route, section } = routeFromHash();
  const changed = route !== state.route;
  state.route = route;
  paintSidebar();
  if (changed || !content.hasChildNodes()) await paintContent();
  if (route === 'profile' && section) scrollToSection(section);
  else if (changed) document.querySelector('.main')?.scrollTo({ top: 0 });
}

function scrollToSection(section: string): void {
  const target = section === 'top' ? document.getElementById('profile-top') : document.getElementById(`section-${section}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function paintShell(): void {
  content = h('div', { class: 'content', id: 'content' });
  saveBar = h(
    'div',
    { class: 'savebar', attrs: { role: 'region', 'aria-label': 'Unsaved changes' } },
    h('span', { class: 'savebar-text' }, icon('pencil', 16), 'You have unsaved changes'),
    h('div', { class: 'savebar-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', on: { click: () => void discard() } }, 'Discard'), h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => void save() } }, icon('check', 16), 'Save changes')),
  );
  render(root, h('aside', { class: 'sidebar', id: 'sidebar' }), h('main', { class: 'main' }, content), saveBar);
  paintSidebar();
  updateSaveBar();
  void navigate();
}

function updateSaveBar(): void {
  saveBar.classList.toggle('visible', state.dirty);
}

function paintSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const { route, section } = routeFromHash();
  const active = state.index.profiles.find((p) => p.id === state.index.activeProfileId);
  const link = (hash: string, label: string, iconName: IconName, current: boolean) =>
    h('a', { href: `#${hash}`, class: ['nav-link', current && 'active'], attrs: { 'aria-current': current ? 'page' : null } }, icon(iconName, 17), h('span', null, label));

  render(
    sidebar,
    h('div', { class: 'sidebar-brand' }, logoMark(30), h('div', null, h('strong', null, 'One-Fill'), h('span', { class: 'subtle small' }, 'Fill forms everywhere'))),
    h(
      'nav',
      { attrs: { 'aria-label': 'Profile sections' } },
      h('div', { class: 'nav-title' }, 'Profile'),
      PROFILE_SECTIONS.map((s) => link(s.id, s.label, s.icon, route === 'profile' && (section === s.id || (!section && s.id === 'personal')))),
    ),
    h(
      'nav',
      { attrs: { 'aria-label': 'App' } },
      h('div', { class: 'nav-title' }, 'App'),
      link('settings', 'Settings', 'sliders', route === 'settings'),
      link('history', 'History', 'clock', route === 'history'),
      link('data', 'Import & export', 'database', route === 'data'),
      link('privacy', 'Privacy', 'shieldCheck', route === 'privacy'),
    ),
    h(
      'div',
      { class: 'sidebar-foot' },
      active ? h('a', { href: '#profiles', class: 'sidebar-profile' }, h('span', { class: 'emoji' }, active.emoji), h('span', null, active.name)) : null,
      h('div', { class: 'local-badge' }, icon('lock', 13), `Stored on this device · v${chrome.runtime.getManifest().version}`),
    ),
  );
}

async function paintContent(keepScroll = false): Promise<void> {
  const main = document.querySelector('.main');
  const scroll = main?.scrollTop ?? 0;
  let view: Child;
  switch (state.route) {
    case 'settings':
      view = await renderSettings({
        settings: state.settings,
        update: async (changes) => (state.settings = await updateSettings(changes)),
        rerender: () => void paintContent(true),
      });
      break;
    case 'history':
      view = await renderHistory(state.index, state.settings.saveHistory, () => void paintContent(true));
      break;
    case 'data':
      view = renderData({ index: state.index, active: state.saved, reload: reloadAll });
      break;
    case 'privacy':
      view = await privacyView();
      break;
    default:
      view = profileView();
  }
  render(content, view);
  if (keepScroll && main) main.scrollTop = scroll;
}

function rerenderEditor(focusPath?: string): void {
  void paintContent(true).then(() => {
    if (!focusPath) return;
    const el = document.getElementById(`f-${focusPath}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function profileView(): Child {
  return [
    state.welcome ? welcomeBanner() : null,
    profileHeader(),
    renderProfileEditor({
      draft: state.draft,
      errors: state.errors,
      markDirty,
      rerender: rerenderEditor,
      onDocumentAdded: (id) => state.newDocuments.add(id),
    }),
    h('div', { class: 'editor-foot' }, h('button', { class: 'btn btn-primary btn-lg', type: 'button', on: { click: () => void save() } }, icon('check', 17), 'Save profile')),
  ];
}

function welcomeBanner(): HTMLElement {
  return h(
    'section',
    { class: 'welcome card' },
    h('div', { class: 'welcome-art' }, logoMark(52)),
    h(
      'div',
      { class: 'welcome-text' },
      h('h1', null, 'Welcome to One-Fill 👋'),
      h('p', null, 'Enter your information once, then fill forms anywhere by clicking the One-Fill icon (or pressing ', h('span', { class: 'kbd' }, 'Alt+Shift+F'), ').'),
      h('p', { class: 'muted small' }, icon('lock', 13), ' Everything you enter stays on this device. No account, no servers, no tracking.'),
    ),
    h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        attrs: { 'aria-label': 'Dismiss' },
        on: {
          click: () => {
            state.welcome = false;
            history.replaceState(null, '', location.pathname + location.hash);
            void paintContent(true);
          },
        },
      },
      icon('x', 18),
    ),
  );
}

function profileHeader(): HTMLElement {
  const completeness = computeCompleteness(state.draft);
  const meta = state.saved.meta;

  const switcher = h(
    'select',
    {
      class: 'select profile-select',
      attrs: { 'aria-label': 'Active profile' },
      on: {
        change: async (e: Event) => {
          const select = e.target as HTMLSelectElement;
          if (!(await confirmLeaveDirty())) {
            select.value = meta.id;
            return;
          }
          await setActiveProfile(select.value);
          await loadProfile();
          paintSidebar();
          await paintContent();
          toast(`Switched to “${state.saved.meta.name}”`, 'info');
        },
      },
    },
    state.index.profiles.map((p) => h('option', { value: p.id, selected: p.id === meta.id }, `${p.emoji}  ${p.name}`)),
  );

  const action = (label: string, iconName: IconName, onClick: () => void, danger = false) =>
    h('button', { class: ['btn', 'btn-ghost', 'btn-sm', danger && 'danger-text'], type: 'button', on: { click: onClick } }, icon(iconName, 15), label);

  const pickEmoji = (initial: string) => {
    let chosen = initial;
    const row = h(
      'div',
      { class: 'emoji-row', attrs: { role: 'radiogroup', 'aria-label': 'Icon' } },
      PROFILE_EMOJIS.map((e) =>
        h(
          'button',
          {
            type: 'button',
            class: ['emoji-choice', e === initial && 'selected'],
            attrs: { 'aria-label': e },
            on: {
              click: (ev: MouseEvent) => {
                chosen = e;
                row.querySelectorAll('.emoji-choice').forEach((b) => b.classList.toggle('selected', b === ev.currentTarget));
              },
            },
          },
          e,
        ),
      ),
    );
    return { row, get: () => chosen };
  };

  const newProfile = async () => {
    if (!(await confirmLeaveDirty())) return;
    const emoji = pickEmoji('💼');
    const name = await openDialog({ title: 'New profile', body: h('div', null, h('p', { class: 'muted' }, 'Keep separate details for different kinds of forms — e.g. “Job applications” or “University”.'), emoji.row), confirmLabel: 'Create profile', input: { label: 'Profile name', placeholder: 'Job applications', required: true } });
    if (typeof name !== 'string') return;
    const created = await createProfile(name, emoji.get());
    await setActiveProfile(created.meta.id);
    await loadProfile();
    paintSidebar();
    await paintContent();
    toast(`Created “${created.meta.name}”`);
  };

  const rename = async () => {
    const emoji = pickEmoji(meta.emoji);
    const name = await openDialog({ title: 'Rename profile', body: emoji.row, confirmLabel: 'Save', input: { label: 'Profile name', value: meta.name, required: true } });
    if (typeof name !== 'string') return;
    await updateProfileMeta(meta.id, { name, emoji: emoji.get() });
    state.index = await getProfileIndex();
    state.saved.meta = state.index.profiles.find((p) => p.id === meta.id) ?? state.saved.meta;
    paintSidebar();
    await paintContent(true);
  };

  const duplicate = async () => {
    if (!(await confirmLeaveDirty())) return;
    const copy = await duplicateProfile(meta.id);
    await setActiveProfile(copy.meta.id);
    await loadProfile();
    paintSidebar();
    await paintContent();
    toast(`Created “${copy.meta.name}”`);
  };

  const remove = async () => {
    if (state.index.profiles.length <= 1) return toast('You need at least one profile', 'error');
    const ok = await openDialog({ title: `Delete “${meta.name}”?`, body: 'This profile and its resumes will be permanently deleted from this device.', confirmLabel: 'Delete profile', danger: true });
    if (!ok) return;
    state.dirty = false;
    await deleteProfile(meta.id);
    await loadProfile();
    paintSidebar();
    await paintContent();
    toast('Profile deleted');
  };

  const suggestion = (item: CompletenessItem) =>
    h(
      'button',
      {
        class: 'suggestion',
        type: 'button',
        on: {
          click: () => {
            const el = document.getElementById(`f-${item.target}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              if (el.matches('input, select, textarea')) el.focus({ preventScroll: true });
              return;
            }
            const add = document.getElementById(item.target === 'emergency' ? 'add-emergency' : 'add-education');
            if (item.target === 'education' || item.target === 'emergency') add?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else scrollToSection(item.section);
          },
        },
      },
      icon('plus', 14),
      item.label.replace(/^Add /, ''),
    );

  return h(
    'section',
    { class: 'card profile-header', id: 'profile-top' },
    h(
      'div',
      { class: 'profile-row' },
      h('div', { class: 'profile-identity' }, h('span', { class: 'profile-emoji' }, meta.emoji), h('div', null, h('span', { class: 'subtle small' }, 'Editing profile'), switcher)),
      h('div', { class: 'profile-actions' }, action('New', 'plus', () => void newProfile()), action('Rename', 'pencil', () => void rename()), action('Duplicate', 'copy', () => void duplicate()), action('Delete', 'trash', () => void remove(), true)),
    ),
    h(
      'div',
      { class: 'completeness-block' },
      h(
        'div',
        { class: 'completeness-head' },
        h('strong', null, 'Profile completeness'),
        h('span', { class: 'completeness-pct' }, `${completeness.percent}%`),
      ),
      h('div', { class: 'progress progress-lg', attrs: { role: 'progressbar', 'aria-valuenow': completeness.percent, 'aria-valuemin': 0, 'aria-valuemax': 100 } }, h('span', { style: { width: `${completeness.percent}%` } })),
      h('span', { class: 'muted small' }, `${completeness.completed} / ${completeness.total} details completed`),
      completeness.suggestions.length
        ? h('div', { class: 'suggestions' }, h('span', { class: 'small strong' }, 'Complete your profile'), h('div', { class: 'suggestion-list' }, completeness.suggestions.slice(0, 6).map(suggestion)))
        : h('div', { class: 'notice notice-success' }, icon('check', 16), h('span', null, 'Your profile is complete. Nice!')),
    ),
  );
}

async function privacyView(): Promise<HTMLElement> {
  const access = await hasSiteAccess();
  const point = (iconName: IconName, title: string, text: string) =>
    h('div', { class: 'privacy-point' }, h('div', { class: 'section-icon' }, icon(iconName, 19)), h('div', null, h('strong', null, title), h('p', { class: 'muted' }, text)));
  const perm = (name: string, why: string, status: Child) => h('tr', null, h('td', null, h('code', null, name)), h('td', null, why), h('td', null, status));

  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Privacy'), h('p', { class: 'muted' }, 'One-Fill is local-first. Your information never leaves this device.')),
    h(
      'section',
      { class: 'card privacy-grid' },
      point('database', 'Stored only on this device', 'Your profiles live in Chrome’s local extension storage. There’s no account and no server.'),
      point('globe', 'Nothing is sent anywhere', 'No analytics, no tracking, no third-party APIs. One-Fill makes no network requests.'),
      point('lock', 'Sensitive fields always ask', 'Government IDs are masked in the UI and are only filled when you tick them.'),
      point('shield', 'Web pages can’t read your profile', 'Storage is locked to One-Fill’s own pages; a page only receives the values for fields you fill.'),
      point('clock', 'Metadata-only history', 'History keeps the site, title, date and field count — never the values you filled.'),
      point('trash', 'You’re in control', 'Export, import or delete everything at any time from Import & export.'),
    ),
    h(
      'section',
      { class: 'card data-card' },
      h('h2', null, 'Permissions'),
      h(
        'table',
        { class: 'perm-table' },
        h('thead', null, h('tr', null, h('th', null, 'Permission'), h('th', null, 'Why it’s needed'), h('th', null, 'Status'))),
        h(
          'tbody',
          null,
          perm('storage', 'Save your profiles and settings on this device.', h('span', { class: 'chip chip-success' }, 'Granted')),
          perm('activeTab', 'Read and fill the current page only after you click the icon or press the shortcut.', h('span', { class: 'chip chip-success' }, 'Granted')),
          perm('scripting', 'Run the form detector/filler in the page you chose.', h('span', { class: 'chip chip-success' }, 'Granted')),
          perm(
            'Site access (optional)',
            'Only for “Detect forms as pages load” and “Auto-fill safe fields”.',
            access
              ? h(
                  'button',
                  {
                    class: 'btn btn-secondary btn-sm',
                    type: 'button',
                    on: {
                      click: async () => {
                        await revokeSiteAccess();
                        state.settings = await updateSettings({ pageLoadDetection: false, autoFillSafe: false });
                        toast('Site access removed');
                        void paintContent(true);
                      },
                    },
                  },
                  'Revoke',
                )
              : h('span', { class: 'chip' }, 'Not granted'),
          ),
        ),
      ),
    ),
    h('p', null, h('a', { href: chrome.runtime.getURL('privacy/privacy.html'), target: '_blank' }, 'Read the full privacy policy ', icon('external', 13))),
  );
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  await reloadAll();
  // Clean up resume files left behind by discarded edits.
  const ids: string[] = [];
  for (const p of state.index.profiles) {
    const stored = await getProfile(p.id);
    stored?.data.professional.resumes.forEach((r) => ids.push(r.id));
  }
  void collectOrphanDocuments(ids);

  window.addEventListener('hashchange', () => void navigate());
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.route === 'profile') {
      e.preventDefault();
      void save();
    }
  });
  // Keep in sync with changes made from the popup (e.g. switching profile or theme).
  getStore().subscribe(async (changes) => {
    if (changes[STORAGE_KEYS.settings]) {
      state.settings = await getSettings();
      applyTheme(state.settings.theme);
    }
    if (changes[STORAGE_KEYS.profileIndex] && !state.dirty) {
      const index = await getProfileIndex();
      if (index.activeProfileId !== state.index.activeProfileId) {
        await loadProfile();
        paintSidebar();
        if (state.route === 'profile') void paintContent(true);
      } else {
        state.index = index;
        paintSidebar();
      }
    }
  });
}

void init();
