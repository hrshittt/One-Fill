import { normalizeSettings } from '../storage/settings-storage';
import type { FilePayload } from '../types/fields';
import type { ProfileMeta, UserProfile } from '../types/profile';
import type { Settings } from '../types/settings';
import { decryptText, encryptText, type EncryptedBlob } from '../utils/crypto';
import { createEmptyProfile, sanitizeMeta, sanitizeProfile } from './profile-factory';

/**
 * Profile export format.
 *
 * {
 *   "format": "one-fill-export", "version": 1, "exportedAt": "...", "encrypted": false,
 *   "payload": { "profiles": [{ "meta": …, "data": …, "documents": { "<id>": { name, type, dataUrl } } }], "settings": … }
 * }
 *
 * With a password, `payload` is replaced by `encryption` (AES-256-GCM, PBKDF2-SHA256 key).
 * Imports are always sanitised: unknown keys are dropped and values are type-checked and capped.
 */

export const EXPORT_FORMAT = 'one-fill-export';
export const EXPORT_VERSION = 1;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export interface ExportedProfile {
  meta: ProfileMeta;
  data: UserProfile;
  documents?: Record<string, FilePayload>;
}

export interface ExportPayload {
  profiles: ExportedProfile[];
  settings?: Settings;
}

interface EnvelopeBase {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  app: { name: string; version: string };
}

export type ExportEnvelope =
  | (EnvelopeBase & { encrypted: false; payload: ExportPayload })
  | (EnvelopeBase & { encrypted: true; encryption: EncryptedBlob });

export interface ExportOptions {
  includeIdentification: boolean;
  password?: string;
  appVersion?: string;
}

export async function buildExport(payload: ExportPayload, options: ExportOptions): Promise<ExportEnvelope> {
  const profiles = payload.profiles.map((p) => {
    const data = structuredClone(p.data);
    if (!options.includeIdentification) data.identification = createEmptyProfile().identification;
    return { ...p, data };
  });
  const clean: ExportPayload = { ...payload, profiles };
  const base: EnvelopeBase = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'One-Fill', version: options.appVersion ?? '' },
  };
  if (options.password) {
    return { ...base, encrypted: true, encryption: await encryptText(JSON.stringify(clean), options.password) };
  }
  return { ...base, encrypted: false, payload: clean };
}

export type ImportErrorCode = 'too-large' | 'invalid' | 'unsupported-version' | 'password-required' | 'wrong-password';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function isEncryptedExport(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { encrypted?: unknown };
    return parsed?.encrypted === true;
  } catch {
    return false;
  }
}

export async function parseImport(text: string, password?: string): Promise<ExportPayload> {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('too-large', 'This file is too large to be a One-Fill export.');
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ImportError('invalid', 'This file isn’t valid JSON.');
  }
  if (!envelope || envelope.format !== EXPORT_FORMAT) throw new ImportError('invalid', 'This isn’t a One-Fill export file.');
  if (typeof envelope.version !== 'number' || envelope.version > EXPORT_VERSION) {
    throw new ImportError('unsupported-version', 'This file was made by a newer version of One-Fill. Please update the extension.');
  }

  let payload: unknown = envelope.payload;
  if (envelope.encrypted === true) {
    if (!password) throw new ImportError('password-required', 'This export is password-protected.');
    try {
      payload = JSON.parse(await decryptText(envelope.encryption as EncryptedBlob, password));
    } catch {
      throw new ImportError('wrong-password', 'That password didn’t work. Check it and try again.');
    }
  }
  return sanitizePayload(payload);
}

function sanitizePayload(input: unknown): ExportPayload {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (!Array.isArray(src.profiles) || src.profiles.length === 0) throw new ImportError('invalid', 'No profiles were found in this file.');
  const profiles = src.profiles.slice(0, 20).map((raw): ExportedProfile => {
    const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const data = sanitizeProfile(p.data);
    const documents: Record<string, FilePayload> = {};
    const docsIn = (p.documents && typeof p.documents === 'object' ? p.documents : {}) as Record<string, unknown>;
    for (const resume of data.professional.resumes) {
      const doc = docsIn[resume.id] as Partial<FilePayload> | undefined;
      if (doc && typeof doc.dataUrl === 'string' && /^data:[\w/+.-]*;base64,/.test(doc.dataUrl) && doc.dataUrl.length < 4_000_000) {
        documents[resume.id] = { name: String(doc.name ?? resume.fileName).slice(0, 200), type: String(doc.type ?? resume.mimeType).slice(0, 100), dataUrl: doc.dataUrl };
      }
    }
    // Resume entries without their file can't be used for uploads; keep only those we have.
    data.professional.resumes = data.professional.resumes.filter((r) => documents[r.id]);
    return { meta: sanitizeMeta(p.meta), data, documents };
  });
  const settings = src.settings && typeof src.settings === 'object' ? normalizeSettings(src.settings as Partial<Settings>) : undefined;
  return settings ? { profiles, settings } : { profiles };
}

export function exportFileName(date = new Date()): string {
  return `one-fill-profile-${date.toISOString().slice(0, 10)}.json`;
}
