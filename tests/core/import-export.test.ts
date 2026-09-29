// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createProfileMeta } from '../../src/core/profile-factory';
import { buildExport, ImportError, isEncryptedExport, parseImport } from '../../src/core/import-export';
import { decryptText, encryptText } from '../../src/utils/crypto';
import { sampleProfile } from '../helpers';

const payload = () => ({
  profiles: [
    {
      meta: createProfileMeta('Personal', '👤'),
      data: sampleProfile(),
      documents: { doc_1: { name: 'Harshit_Goyal_Resume.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' } },
    },
  ],
});

describe('export', () => {
  it('produces a structured, versioned file', async () => {
    const envelope = await buildExport(payload(), { includeIdentification: false });
    expect(envelope).toMatchObject({ format: 'one-fill-export', version: 1, encrypted: false });
    const json = JSON.stringify(envelope);
    expect(json).toContain('Manipal University Jaipur');
  });

  it('excludes identification numbers unless explicitly included', async () => {
    const without = JSON.stringify(await buildExport(payload(), { includeIdentification: false }));
    expect(without).not.toContain('ABCDE1234F');
    expect(without).not.toContain('234567890124');
    const withIds = JSON.stringify(await buildExport(payload(), { includeIdentification: true }));
    expect(withIds).toContain('ABCDE1234F');
  });

  it('does not mutate the source profile', async () => {
    const source = payload();
    await buildExport(source, { includeIdentification: false });
    expect(source.profiles[0]!.data.identification.pan).toBe('ABCDE1234F');
  });
});

describe('import', () => {
  it('round-trips a plain export', async () => {
    const text = JSON.stringify(await buildExport(payload(), { includeIdentification: true }));
    const result = await parseImport(text);
    expect(result.profiles[0]!.data.personal.firstName).toBe('Harshit');
    expect(result.profiles[0]!.data.identification.pan).toBe('ABCDE1234F');
    expect(result.profiles[0]!.documents!.doc_1!.name).toBe('Harshit_Goyal_Resume.pdf');
  });

  it('round-trips an encrypted export and rejects wrong passwords', async () => {
    const text = JSON.stringify(await buildExport(payload(), { includeIdentification: true, password: 'correct horse battery' }));
    expect(isEncryptedExport(text)).toBe(true);
    expect(text).not.toContain('Harshit');
    await expect(parseImport(text)).rejects.toMatchObject({ code: 'password-required' });
    await expect(parseImport(text, 'wrong password')).rejects.toMatchObject({ code: 'wrong-password' });
    const result = await parseImport(text, 'correct horse battery');
    expect(result.profiles[0]!.data.contact.email).toBe('harshit@example.com');
  }, 20_000);

  it('rejects files that are not One-Fill exports', async () => {
    await expect(parseImport('not json')).rejects.toBeInstanceOf(ImportError);
    await expect(parseImport('{"hello":"world"}')).rejects.toMatchObject({ code: 'invalid' });
    await expect(parseImport(JSON.stringify({ format: 'one-fill-export', version: 99, encrypted: false, payload: {} }))).rejects.toMatchObject({ code: 'unsupported-version' });
  });

  it('sanitises hostile input: unknown keys, wrong types, oversized strings, bad data URLs', async () => {
    const hostile = {
      format: 'one-fill-export',
      version: 1,
      encrypted: false,
      payload: {
        profiles: [
          {
            meta: { id: 'x', name: 'A'.repeat(500), emoji: '👤', __proto__: { polluted: true } },
            data: {
              personal: { firstName: 'B'.repeat(10_000), gender: 'attack-helicopter', injected: '<img onerror=alert(1)>' },
              contact: { email: 42 },
              education: 'not an array',
              professional: { skills: ['ok', { evil: true }, 'x'.repeat(500)], resumes: [{ id: 'r1', fileName: 'cv.pdf' }], experienceYears: 'lots' },
              unknownSection: { a: 1 },
            },
            documents: { r1: { name: 'cv.pdf', type: 'application/pdf', dataUrl: 'javascript:alert(1)' } },
          },
        ],
        settings: { sensitivePolicy: 'auto', theme: 'neon' },
      },
    };
    const result = await parseImport(JSON.stringify(hostile));
    const p = result.profiles[0]!;
    expect(p.meta.name.length).toBeLessThanOrEqual(40);
    expect(p.data.personal.firstName.length).toBeLessThanOrEqual(500);
    expect(p.data.personal.gender).toBe('');
    expect(p.data.personal).not.toHaveProperty('injected');
    expect(p.data).not.toHaveProperty('unknownSection');
    expect(p.data.contact.email).toBe('42');
    expect(p.data.education).toEqual([]);
    expect(p.data.professional.skills).toEqual(['ok', 'x'.repeat(60)]);
    expect(p.data.professional.experienceYears).toBeNull();
    // A resume without a valid file is dropped entirely.
    expect(p.data.professional.resumes).toEqual([]);
    expect(result.settings!.sensitivePolicy).toBe('ask');
    expect(result.settings!.theme).toBe('system');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('crypto', () => {
  it('uses a fresh salt and IV for every encryption', async () => {
    const a = await encryptText('hello', 'pw', 20_000);
    const b = await encryptText('hello', 'pw', 20_000);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(await decryptText(a, 'pw')).toBe('hello');
  });

  it('detects tampering', async () => {
    const blob = await encryptText('hello', 'pw', 20_000);
    const bytes = Buffer.from(blob.data, 'base64');
    bytes[0] = bytes[0]! ^ 0xff;
    await expect(decryptText({ ...blob, data: bytes.toString('base64') }, 'pw')).rejects.toThrow();
  });
});
