import { beforeEach, describe, expect, it } from 'vitest';
import { collectOrphanDocuments, getDocument, saveDocument } from '../../src/storage/document-storage';
import { addHistoryEntry, clearHistory, getHistory, MAX_HISTORY_ENTRIES } from '../../src/storage/history-storage';
import { getSiteOverrides, saveSiteOverrides } from '../../src/storage/overrides-storage';
import {
  createProfile,
  deleteProfile,
  duplicateProfile,
  ensureInitialized,
  getActiveProfile,
  getProfileIndex,
  saveProfileData,
  setActiveProfile,
  updateProfileMeta,
} from '../../src/storage/profile-storage';
import { getSettings, normalizeSettings, updateSettings } from '../../src/storage/settings-storage';
import { createMemoryStore, getStore, setStore } from '../../src/storage/store';
import type { Settings } from '../../src/types/settings';
import { sampleProfile } from '../helpers';

beforeEach(() => setStore(createMemoryStore()));

describe('profiles', () => {
  it('creates a default "Personal" profile on first run', async () => {
    const index = await ensureInitialized();
    expect(index.profiles).toHaveLength(1);
    expect(index.profiles[0]!.name).toBe('Personal');
    expect(index.activeProfileId).toBe(index.profiles[0]!.id);
    // Idempotent.
    expect((await ensureInitialized()).profiles).toHaveLength(1);
  });

  it('saves and reloads profile data', async () => {
    const active = await getActiveProfile();
    await saveProfileData(active.meta.id, sampleProfile());
    const reloaded = await getActiveProfile();
    expect(reloaded.data.personal.firstName).toBe('Harshit');
    expect(reloaded.data.education).toHaveLength(3);
    expect(reloaded.meta.updatedAt).toBeGreaterThanOrEqual(active.meta.updatedAt);
  });

  it('supports multiple profiles with switching, renaming and duplication', async () => {
    const personal = await getActiveProfile();
    await saveProfileData(personal.meta.id, sampleProfile());
    const jobs = await createProfile('Job applications', '💼');
    await setActiveProfile(jobs.meta.id);
    expect((await getActiveProfile()).meta.name).toBe('Job applications');
    expect((await getActiveProfile()).data.personal.firstName).toBe('');

    await updateProfileMeta(jobs.meta.id, { name: 'Jobs', emoji: '🧑‍💻' });
    expect((await getProfileIndex()).profiles.find((p) => p.id === jobs.meta.id)!.name).toBe('Jobs');

    const copy = await duplicateProfile(personal.meta.id);
    expect(copy.meta.name).toBe('Personal copy');
    expect(copy.data.personal.firstName).toBe('Harshit');
    expect(copy.data.professional.resumes).toEqual([]);
    expect((await getProfileIndex()).profiles).toHaveLength(3);
  });

  it('gives duplicate names a suffix', async () => {
    await createProfile('Work');
    const second = await createProfile('Work');
    expect(second.meta.name).toBe('Work 2');
  });

  it('deletes profiles but never the last one, and moves the active pointer', async () => {
    const first = await getActiveProfile();
    await expect(deleteProfile(first.meta.id)).rejects.toThrow(/at least one/);
    const second = await createProfile('Second');
    await setActiveProfile(second.meta.id);
    await deleteProfile(second.meta.id);
    expect((await getActiveProfile()).meta.id).toBe(first.meta.id);
  });

  it('sanitises data on save (drops unknown keys, coerces types)', async () => {
    const active = await getActiveProfile();
    const dirty = { ...sampleProfile(), evil: '<script>', personal: { ...sampleProfile().personal, gender: 'robot', extra: 1 } };
    await saveProfileData(active.meta.id, dirty as never);
    const stored = (await getStore().get<Record<string, unknown>>(`profile:${active.meta.id}`))!;
    expect(stored).not.toHaveProperty('evil');
    expect((stored.personal as Record<string, unknown>).gender).toBe('');
    expect(stored.personal).not.toHaveProperty('extra');
  });
});

describe('settings', () => {
  it('returns defaults and persists changes', async () => {
    expect((await getSettings()).confirmUncertain).toBe(true);
    await updateSettings({ theme: 'dark', saveHistory: false });
    const s = await getSettings();
    expect(s.theme).toBe('dark');
    expect(s.saveHistory).toBe(false);
  });

  it('never allows sensitive fields to be auto-filled, even from tampered storage', () => {
    const s = normalizeSettings({ sensitivePolicy: 'auto' as unknown as Settings['sensitivePolicy'] });
    expect(s.sensitivePolicy).toBe('ask');
  });

  it('repairs wrong types', () => {
    const s = normalizeSettings({ autoDetect: 'yes' as unknown as boolean, disabledSites: 'x' as unknown as string[] });
    expect(s.autoDetect).toBe(true);
    expect(s.disabledSites).toEqual([]);
  });
});

describe('history', () => {
  it('stores only metadata, newest first, capped', async () => {
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
      await addHistoryEntry({ domain: `site${i}.com`, pageTitle: `Form ${i}`, fieldsFilled: 3, profileId: 'p', trigger: 'popup' });
    }
    const history = await getHistory();
    expect(history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history[0]!.domain).toBe(`site${MAX_HISTORY_ENTRIES + 4}.com`);
    expect(Object.keys(history[0]!).sort()).toEqual(['domain', 'fieldsFilled', 'id', 'pageTitle', 'profileId', 'timestamp', 'trigger']);
    await clearHistory();
    expect(await getHistory()).toEqual([]);
  });
});

describe('site overrides', () => {
  it('merges corrections per domain', async () => {
    await saveSiteOverrides('example.com', { abc: 'contact.phone' });
    await saveSiteOverrides('example.com', { def: '__skip__' });
    expect(await getSiteOverrides('example.com')).toEqual({ abc: 'contact.phone', def: '__skip__' });
    expect(await getSiteOverrides('other.com')).toEqual({});
  });
});

describe('documents', () => {
  it('stores files separately and removes unreferenced ones', async () => {
    await saveDocument('doc_a', { name: 'a.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAA=' });
    await saveDocument('doc_b', { name: 'b.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,BBB=' });
    expect(await collectOrphanDocuments(['doc_a'])).toBe(1);
    expect(await getDocument('doc_a')).not.toBeNull();
    expect(await getDocument('doc_b')).toBeNull();
  });
});
