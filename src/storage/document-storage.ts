import type { FilePayload } from '../types/fields';
import { getStore, STORAGE_KEYS } from './store';

/**
 * Resume files are stored as data URLs under "doc:<id>", separate from profile data.
 * chrome.storage.local allows ~10 MB per extension, so individual files are capped.
 */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/rtf',
];

interface StoredDocument {
  name: string;
  type: string;
  dataUrl: string;
}

export async function saveDocument(id: string, doc: StoredDocument): Promise<void> {
  await getStore().set({ [STORAGE_KEYS.document(id)]: doc });
}

export async function getDocument(id: string): Promise<FilePayload | null> {
  const doc = await getStore().get<StoredDocument>(STORAGE_KEYS.document(id));
  return doc ? { name: doc.name, type: doc.type, dataUrl: doc.dataUrl } : null;
}

export async function deleteDocuments(ids: string[]): Promise<void> {
  if (ids.length) await getStore().remove(ids.map(STORAGE_KEYS.document));
}

/** Deletes stored files no profile references (e.g. uploads from an editing session that was discarded). */
export async function collectOrphanDocuments(referencedIds: Iterable<string>): Promise<number> {
  const referenced = new Set([...referencedIds].map(STORAGE_KEYS.document));
  const orphans = (await getStore().keys()).filter((k) => k.startsWith('doc:') && !referenced.has(k));
  if (orphans.length) await getStore().remove(orphans);
  return orphans.length;
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
