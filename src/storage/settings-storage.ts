import { DEFAULT_SETTINGS, type Settings } from '../types/settings';
import { getStore, STORAGE_KEYS } from './store';

export async function getSettings(): Promise<Settings> {
  const stored = await getStore().get<Partial<Settings>>(STORAGE_KEYS.settings);
  return normalizeSettings(stored);
}

export async function updateSettings(changes: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...changes });
  await getStore().set({ [STORAGE_KEYS.settings]: next });
  return next;
}

/** Merges stored values over defaults and enforces invariants (e.g. sensitive data is never auto-filled). */
export function normalizeSettings(stored: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof merged[key] !== typeof DEFAULT_SETTINGS[key]) (merged as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
  }
  if (merged.sensitivePolicy !== 'ask' && merged.sensitivePolicy !== 'never') merged.sensitivePolicy = 'ask';
  if (!['system', 'light', 'dark'].includes(merged.theme)) merged.theme = 'system';
  merged.disabledSites = Array.isArray(merged.disabledSites)
    ? merged.disabledSites.filter((s): s is string => typeof s === 'string').slice(0, 500)
    : [];
  return merged;
}
