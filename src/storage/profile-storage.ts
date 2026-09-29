import { createEmptyProfile, createProfileMeta, sanitizeProfile } from '../core/profile-factory';
import type { ProfileIndex, ProfileMeta, StoredProfile, UserProfile } from '../types/profile';
import { SCHEMA_VERSION } from '../types/profile';
import { deleteDocuments } from './document-storage';
import { getStore, STORAGE_KEYS } from './store';

/**
 * Profiles are stored as:
 *   "profiles"       → ProfileIndex (active id + metadata for every profile)
 *   "profile:<id>"   → UserProfile data
 * so switching or listing profiles never loads every profile's data.
 */

export async function ensureInitialized(): Promise<ProfileIndex> {
  const store = getStore();
  const existing = await store.get<ProfileIndex>(STORAGE_KEYS.profileIndex);
  if (existing && existing.profiles.length > 0) return existing;

  const meta = createProfileMeta('Personal', '👤');
  const index: ProfileIndex = { activeProfileId: meta.id, profiles: [meta] };
  await store.set({
    [STORAGE_KEYS.meta]: { schemaVersion: SCHEMA_VERSION, installedAt: Date.now() },
    [STORAGE_KEYS.profileIndex]: index,
    [STORAGE_KEYS.profile(meta.id)]: createEmptyProfile(),
  });
  return index;
}

export async function getProfileIndex(): Promise<ProfileIndex> {
  return ensureInitialized();
}

export async function getProfile(id: string): Promise<StoredProfile | null> {
  const index = await getProfileIndex();
  const meta = index.profiles.find((p) => p.id === id);
  if (!meta) return null;
  const data = await getStore().get<UserProfile>(STORAGE_KEYS.profile(id));
  // Sanitising on read keeps older/partial records compatible with the current schema.
  return { meta, data: sanitizeProfile(data ?? createEmptyProfile()) };
}

export async function getActiveProfile(): Promise<StoredProfile> {
  const index = await getProfileIndex();
  const active = (await getProfile(index.activeProfileId)) ?? (await getProfile(index.profiles[0]!.id));
  if (!active) throw new Error('No profile available');
  return active;
}

export async function saveProfileData(id: string, data: UserProfile): Promise<ProfileMeta> {
  const store = getStore();
  const index = await getProfileIndex();
  const meta = index.profiles.find((p) => p.id === id);
  if (!meta) throw new Error('Profile not found');
  meta.updatedAt = Date.now();
  await store.set({
    [STORAGE_KEYS.profile(id)]: sanitizeProfile(data),
    [STORAGE_KEYS.profileIndex]: index,
  });
  return meta;
}

export async function createProfile(name: string, emoji = '🗂️', data?: UserProfile): Promise<StoredProfile> {
  const store = getStore();
  const index = await getProfileIndex();
  const meta = createProfileMeta(uniqueName(name.trim() || 'Profile', index.profiles), emoji);
  const profileData = data ? sanitizeProfile(data) : createEmptyProfile();
  index.profiles.push(meta);
  await store.set({
    [STORAGE_KEYS.profile(meta.id)]: profileData,
    [STORAGE_KEYS.profileIndex]: index,
  });
  return { meta, data: profileData };
}

export async function duplicateProfile(id: string): Promise<StoredProfile> {
  const source = await getProfile(id);
  if (!source) throw new Error('Profile not found');
  // Resume files are per-profile blobs; the copy keeps text data only.
  const data = structuredClone(source.data);
  data.professional.resumes = [];
  return createProfile(`${source.meta.name} copy`, source.meta.emoji, data);
}

export async function updateProfileMeta(id: string, changes: Partial<Pick<ProfileMeta, 'name' | 'emoji'>>): Promise<void> {
  const index = await getProfileIndex();
  const meta = index.profiles.find((p) => p.id === id);
  if (!meta) throw new Error('Profile not found');
  if (changes.name !== undefined) meta.name = changes.name.trim().slice(0, 40) || meta.name;
  if (changes.emoji !== undefined) meta.emoji = changes.emoji;
  meta.updatedAt = Date.now();
  await getStore().set({ [STORAGE_KEYS.profileIndex]: index });
}

export async function setActiveProfile(id: string): Promise<void> {
  const index = await getProfileIndex();
  if (!index.profiles.some((p) => p.id === id)) throw new Error('Profile not found');
  index.activeProfileId = id;
  await getStore().set({ [STORAGE_KEYS.profileIndex]: index });
}

export async function deleteProfile(id: string): Promise<void> {
  const store = getStore();
  const index = await getProfileIndex();
  if (index.profiles.length <= 1) throw new Error('You need at least one profile.');
  const profile = await getProfile(id);
  index.profiles = index.profiles.filter((p) => p.id !== id);
  if (index.activeProfileId === id) index.activeProfileId = index.profiles[0]!.id;
  await store.set({ [STORAGE_KEYS.profileIndex]: index });
  await store.remove(STORAGE_KEYS.profile(id));
  if (profile) await deleteDocuments(profile.data.professional.resumes.map((r) => r.id));
}

function uniqueName(name: string, existing: ProfileMeta[]): string {
  const names = new Set(existing.map((p) => p.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}
