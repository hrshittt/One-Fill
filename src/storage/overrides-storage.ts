import type { OverridesStore, SiteOverrides } from '../types/history';
import { getStore, STORAGE_KEYS } from './store';

/**
 * Mapping corrections the user made in Review, remembered per site.
 * Keys are field *signatures* (a hash of the field's structural attributes), never values.
 */

const MAX_SITES = 300;

export async function getAllOverrides(): Promise<OverridesStore> {
  return (await getStore().get<OverridesStore>(STORAGE_KEYS.overrides)) ?? {};
}

export async function getSiteOverrides(domain: string): Promise<SiteOverrides> {
  return (await getAllOverrides())[domain] ?? {};
}

export async function saveSiteOverrides(domain: string, changes: SiteOverrides): Promise<void> {
  if (!domain || Object.keys(changes).length === 0) return;
  const all = await getAllOverrides();
  all[domain] = { ...(all[domain] ?? {}), ...changes };
  const domains = Object.keys(all);
  // Drop the oldest sites once the cap is exceeded (object key order = insertion order).
  for (const old of domains.slice(0, Math.max(0, domains.length - MAX_SITES))) delete all[old];
  await getStore().set({ [STORAGE_KEYS.overrides]: all });
}

export async function clearSiteOverrides(domain?: string): Promise<void> {
  if (!domain) {
    await getStore().set({ [STORAGE_KEYS.overrides]: {} });
    return;
  }
  const all = await getAllOverrides();
  delete all[domain];
  await getStore().set({ [STORAGE_KEYS.overrides]: all });
}
