import { clearHistory, deleteHistoryEntry, getHistory } from '../storage/history-storage';
import type { HistoryEntry } from '../types/history';
import type { ProfileIndex } from '../types/profile';
import { colorFor, formatDate, h } from '../ui/dom';
import { openDialog } from '../ui/dialog';
import { icon } from '../ui/icons';
import { toast } from '../ui/theme';

function dayLabel(timestamp: number): string {
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return formatDate(timestamp, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

const TRIGGER_LABEL: Record<HistoryEntry['trigger'], string> = { popup: 'From popup', auto: 'Auto-fill', shortcut: 'Shortcut' };

export async function renderHistory(index: ProfileIndex, saveHistory: boolean, rerender: () => void): Promise<HTMLElement> {
  const entries = await getHistory();
  const profileName = (id: string) => index.profiles.find((p) => p.id === id);

  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const label = dayLabel(entry.timestamp);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }

  const clearAll = async () => {
    const ok = await openDialog({ title: 'Clear form history?', body: 'This removes the list of sites where you used One-Fill. Your profile is not affected.', confirmLabel: 'Clear history', danger: true });
    if (!ok) return;
    await clearHistory();
    toast('History cleared');
    rerender();
  };

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'view-head view-head-row' },
      h('div', null, h('h1', null, 'Recent forms'), h('p', { class: 'muted' }, 'Only the site, page title, date and number of fields are kept — never what was filled.')),
      entries.length ? h('button', { class: 'btn btn-secondary btn-sm', type: 'button', on: { click: () => void clearAll() } }, icon('trash', 15), 'Clear') : null,
    ),
    !saveHistory
      ? h('div', { class: 'notice' }, icon('info', 17), h('span', null, 'History is turned off in Settings, so new fills aren’t recorded.'))
      : null,
    entries.length === 0
      ? h(
          'section',
          { class: 'card' },
          h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon('clock', 22)), h('h3', null, 'No forms filled yet'), h('p', null, 'When you fill a form with One-Fill, it shows up here.')),
        )
      : [...groups].map(([label, items]) =>
          h(
            'section',
            { class: 'history-group' },
            h('h2', { class: 'group-title' }, label),
            h(
              'ul',
              { class: 'card history-list' },
              items.map((entry) => {
                const profile = profileName(entry.profileId);
                return h(
                  'li',
                  { class: 'history-item' },
                  h('div', { class: 'avatar', style: { background: colorFor(entry.domain) }, attrs: { 'aria-hidden': 'true' } }, (entry.domain[0] ?? '?').toUpperCase()),
                  h(
                    'div',
                    { class: 'history-main' },
                    h('strong', null, entry.domain || 'Unknown site'),
                    h('span', { class: 'muted history-title' }, entry.pageTitle || '—'),
                  ),
                  h(
                    'div',
                    { class: 'history-meta' },
                    h('span', { class: 'chip chip-success' }, `${entry.fieldsFilled} field${entry.fieldsFilled === 1 ? '' : 's'} filled`),
                    h(
                      'span',
                      { class: 'subtle small' },
                      new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
                      ' · ',
                      TRIGGER_LABEL[entry.trigger],
                      profile ? ` · ${profile.emoji} ${profile.name}` : '',
                    ),
                  ),
                  h(
                    'button',
                    {
                      class: 'icon-btn',
                      type: 'button',
                      attrs: { 'aria-label': `Remove ${entry.domain} from history` },
                      on: {
                        click: async () => {
                          await deleteHistoryEntry(entry.id);
                          rerender();
                        },
                      },
                    },
                    icon('x', 16),
                  ),
                );
              }),
            ),
          ),
        ),
  );
}
