import type { HistoryEntry } from '../types/history';
import { createId } from '../utils/ids';
import { getStore, STORAGE_KEYS } from './store';

export const MAX_HISTORY_ENTRIES = 100;

export async function getHistory(): Promise<HistoryEntry[]> {
  const entries = await getStore().get<HistoryEntry[]>(STORAGE_KEYS.history);
  return Array.isArray(entries) ? entries : [];
}

/** Records a fill. Only metadata is stored — never field names or values. */
export async function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry> {
  const record: HistoryEntry = {
    id: createId('h'),
    timestamp: Date.now(),
    domain: entry.domain.slice(0, 253),
    pageTitle: entry.pageTitle.slice(0, 120),
    fieldsFilled: Math.max(0, Math.floor(entry.fieldsFilled)),
    profileId: entry.profileId,
    trigger: entry.trigger,
  };
  const history = [record, ...(await getHistory())].slice(0, MAX_HISTORY_ENTRIES);
  await getStore().set({ [STORAGE_KEYS.history]: history });
  return record;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const history = (await getHistory()).filter((h) => h.id !== id);
  await getStore().set({ [STORAGE_KEYS.history]: history });
}

export async function clearHistory(): Promise<void> {
  await getStore().set({ [STORAGE_KEYS.history]: [] });
}
