/**
 * Thin async key-value abstraction over `chrome.storage.local`.
 * All repositories go through `getStore()`, which lets tests inject an in-memory implementation.
 */

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
  /** Subscribes to changes; returns an unsubscribe function. */
  subscribe(listener: (changes: Record<string, StorageChange>) => void): () => void;
}

export const STORAGE_KEYS = {
  meta: 'meta',
  profileIndex: 'profiles',
  profile: (id: string) => `profile:${id}`,
  settings: 'settings',
  history: 'history',
  overrides: 'overrides',
  document: (id: string) => `doc:${id}`,
} as const;

export function createChromeStore(area: chrome.storage.StorageArea = chrome.storage.local): KeyValueStore {
  return {
    async get<T>(key: string) {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },
    async getMany(keys) {
      return keys.length ? ((await area.get(keys)) as Record<string, unknown>) : {};
    },
    async set(items) {
      await area.set(items);
    },
    async remove(keys) {
      await area.remove(keys);
    },
    async keys() {
      return Object.keys(await area.get(null));
    },
    async clear() {
      await area.clear();
    },
    subscribe(listener) {
      const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local') listener(changes);
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

export function createMemoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  const listeners = new Set<(changes: Record<string, StorageChange>) => void>();
  const emit = (changes: Record<string, StorageChange>) => listeners.forEach((l) => l(changes));
  return {
    async get<T>(key: string) {
      return structuredClone(data.get(key)) as T | undefined;
    },
    async getMany(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = structuredClone(data.get(k));
      return out;
    },
    async set(items) {
      const changes: Record<string, StorageChange> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data.get(k), newValue: structuredClone(v) };
        data.set(k, structuredClone(v));
      }
      emit(changes);
    },
    async remove(keys) {
      const changes: Record<string, StorageChange> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (data.has(k)) changes[k] = { oldValue: data.get(k) };
        data.delete(k);
      }
      emit(changes);
    },
    async keys() {
      return [...data.keys()];
    },
    async clear() {
      const changes: Record<string, StorageChange> = {};
      for (const [k, v] of data) changes[k] = { oldValue: v };
      data.clear();
      emit(changes);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let activeStore: KeyValueStore | null = null;

export function getStore(): KeyValueStore {
  activeStore ??= createChromeStore();
  return activeStore;
}

/** Test hook: replace the backing store. */
export function setStore(store: KeyValueStore): void {
  activeStore = store;
}
