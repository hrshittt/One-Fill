import { hasSiteAccess, requestSiteAccess, revokeSiteAccess } from '../extension/permissions';
import { clearSiteOverrides, getAllOverrides } from '../storage/overrides-storage';
import type { Settings } from '../types/settings';
import { h, type Child } from '../ui/dom';
import { openDialog } from '../ui/dialog';
import { icon, type IconName } from '../ui/icons';
import { applyTheme, toast } from '../ui/theme';

export interface SettingsContext {
  settings: Settings;
  update(changes: Partial<Settings>): Promise<Settings>;
  rerender(): void;
}

function toggle(checked: boolean, label: string, onChange: (value: boolean, input: HTMLInputElement) => void, disabled = false): HTMLElement {
  const input = h('input', { type: 'checkbox', checked, disabled, attrs: { role: 'switch', 'aria-label': label } });
  input.addEventListener('change', () => onChange(input.checked, input));
  return h('span', { class: 'switch' }, input, h('span', { class: 'track' }), h('span', { class: 'thumb' }));
}

function row(iconName: IconName, title: string, description: Child, control: Child): HTMLElement {
  return h(
    'div',
    { class: 'setting-row' },
    h('div', { class: 'setting-icon' }, icon(iconName, 18)),
    h('div', { class: 'setting-text' }, h('strong', null, title), h('p', { class: 'muted' }, description)),
    h('div', { class: 'setting-control' }, control),
  );
}

function group(title: string, ...rows: Child[]): HTMLElement {
  return h('section', { class: 'card settings-group' }, h('h2', { class: 'group-title' }, title), ...rows);
}

export async function renderSettings(ctx: SettingsContext): Promise<HTMLElement> {
  const s = ctx.settings;
  const siteAccess = await hasSiteAccess();
  const overrides = await getAllOverrides();
  const rememberedSites = Object.keys(overrides).length;

  const save = async (changes: Partial<Settings>, message = 'Settings saved') => {
    ctx.settings = await ctx.update(changes);
    toast(message);
    ctx.rerender();
  };

  /** Features that need site access request it from the toggle's click (a user gesture). */
  const needsAccess = (key: 'pageLoadDetection' | 'autoFillSafe') => async (value: boolean, input: HTMLInputElement) => {
    if (value) {
      const granted = await requestSiteAccess();
      if (!granted) {
        input.checked = false;
        toast('Site access is needed for this feature', 'error');
        return;
      }
      await save({ [key]: true });
      return;
    }
    const next = { ...ctx.settings, [key]: false };
    await save({ [key]: false });
    if (!next.pageLoadDetection && !next.autoFillSafe) await revokeSiteAccess();
  };

  const segmented = <T extends string>(value: T, choices: Array<[T, string, IconName?]>, onPick: (v: T) => void) =>
    h(
      'div',
      { class: 'segmented', attrs: { role: 'group' } },
      choices.map(([v, label, iconName]) =>
        h('button', { type: 'button', attrs: { 'aria-pressed': String(v === value) }, on: { click: () => onPick(v) } }, iconName ? icon(iconName, 14) : null, label),
      ),
    );

  const disabledSitesInput = h('input', { class: 'input', placeholder: 'example.com', attrs: { 'aria-label': 'Add a site' } });
  const addDisabledSite = async () => {
    const host = disabledSitesInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return toast('Enter a domain like example.com', 'error');
    if (ctx.settings.disabledSites.includes(host)) return;
    await save({ disabledSites: [...ctx.settings.disabledSites, host] }, `One-Fill won’t run automatically on ${host}`);
  };
  disabledSitesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void addDisabledSite();
  });

  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Settings'), h('p', { class: 'muted' }, 'Control when One-Fill runs and what it’s allowed to fill.')),

    group(
      'Detection',
      row('search', 'Auto-detect forms', 'Scan the current page as soon as you open One-Fill.', toggle(s.autoDetect, 'Auto-detect forms', (v) => void save({ autoDetect: v }))),
      row(
        'zap',
        'Detect forms as pages load',
        h('span', null, 'Show the number of fields One-Fill can fill on the toolbar icon. ', h('span', { class: 'needs-access' }, icon('globe', 12), 'Needs access to the sites you visit')),
        toggle(s.pageLoadDetection && siteAccess, 'Detect forms as pages load', (v, i) => void needsAccess('pageLoadDetection')(v, i)),
      ),
    ),

    group(
      'Filling',
      row('alert', 'Show confirmation', 'Uncertain matches wait for your confirmation in Review before they’re filled.', toggle(s.confirmUncertain, 'Show confirmation', (v) => void save({ confirmUncertain: v }))),
      row(
        'sparkles',
        'Auto-fill safe fields',
        h(
          'span',
          null,
          'Offer to fill high-confidence, non-sensitive fields when a page loads. With “Show confirmation” on, a small prompt asks first. ',
          h('span', { class: 'needs-access' }, icon('globe', 12), 'Needs access to the sites you visit'),
        ),
        toggle(s.autoFillSafe && siteAccess, 'Auto-fill safe fields', (v, i) => void needsAccess('autoFillSafe')(v, i)),
      ),
      row(
        'lock',
        'Sensitive fields',
        'PAN, Aadhaar, passport and other IDs are never filled silently. Choose whether One-Fill may offer them at all.',
        segmented(s.sensitivePolicy, [['ask', 'Always ask', 'lock'], ['never', 'Never fill']], (v) => void save({ sensitivePolicy: v })),
      ),
      row('pencil', 'Replace existing values', 'Overwrite text already typed into a field. Off keeps whatever you entered.', toggle(s.overwriteExisting, 'Replace existing values', (v) => void save({ overwriteExisting: v }))),
      row('eye', 'Highlight filled fields', 'Briefly outline each field after it’s filled.', toggle(s.highlightFilled, 'Highlight filled fields', (v) => void save({ highlightFilled: v }))),
    ),

    group(
      'Learning & history',
      row(
        'check',
        'Remember my corrections',
        rememberedSites ? `Mappings you confirm are remembered per site (${rememberedSites} site${rememberedSites === 1 ? '' : 's'} so far).` : 'Mappings you confirm are remembered per site.',
        h(
          'div',
          { class: 'control-stack' },
          toggle(s.rememberCorrections, 'Remember my corrections', (v) => void save({ rememberCorrections: v })),
          rememberedSites
            ? h(
                'button',
                {
                  class: 'link-btn',
                  type: 'button',
                  on: {
                    click: async () => {
                      const ok = await openDialog({ title: 'Forget all corrections?', body: 'One-Fill will go back to its automatic matching on every site.', confirmLabel: 'Forget', danger: true });
                      if (!ok) return;
                      await clearSiteOverrides();
                      toast('Corrections cleared');
                      ctx.rerender();
                    },
                  },
                },
                'Forget all',
              )
            : null,
        ),
      ),
      row('clock', 'Save form history', 'Keep a list of sites where you used One-Fill: domain, page title, date and number of fields. Never the values.', toggle(s.saveHistory, 'Save form history', (v) => void save({ saveHistory: v }))),
    ),

    group(
      'Appearance',
      row(
        'sun',
        'Theme',
        'Match your system, or pick light or dark.',
        segmented(s.theme, [['system', 'System'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']], (v) => {
          applyTheme(v);
          void save({ theme: v });
        }),
      ),
    ),

    group(
      'Sites',
      h(
        'div',
        { class: 'setting-block' },
        h('p', { class: 'muted' }, 'One-Fill never runs automatically on these sites. You can still fill manually from the toolbar icon.'),
        h('div', { class: 'inline-form' }, disabledSitesInput, h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => void addDisabledSite() } }, 'Add')),
        s.disabledSites.length
          ? h(
              'ul',
              { class: 'site-list' },
              s.disabledSites.map((site) =>
                h(
                  'li',
                  null,
                  icon('globe', 15),
                  h('span', null, site),
                  h(
                    'button',
                    {
                      class: 'icon-btn',
                      type: 'button',
                      attrs: { 'aria-label': `Remove ${site}` },
                      on: { click: () => void save({ disabledSites: ctx.settings.disabledSites.filter((x) => x !== site) }) },
                    },
                    icon('x', 15),
                  ),
                ),
              ),
            )
          : null,
      ),
    ),

    group(
      'Keyboard shortcuts',
      h(
        'div',
        { class: 'setting-block' },
        h('p', null, h('span', { class: 'kbd' }, 'Alt'), ' + ', h('span', { class: 'kbd' }, 'Shift'), ' + ', h('span', { class: 'kbd' }, 'F'), h('span', { class: 'muted' }, '  opens One-Fill on the current page.')),
        h('p', { class: 'muted' }, 'You can also assign a shortcut that fills safe fields without opening the popup.'),
        h(
          'button',
          { class: 'btn btn-secondary btn-sm', type: 'button', on: { click: () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }) } },
          icon('keyboard', 15),
          'Customize shortcuts',
        ),
      ),
    ),
  );
}
