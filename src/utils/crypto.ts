/**
 * Password-based encryption for profile exports: PBKDF2-SHA256 → AES-256-GCM (WebCrypto).
 * Everything happens locally; the password is never stored.
 */

export const KDF_ITERATIONS = 310_000;

export interface EncryptedBlob {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plaintext: string, password: string, iterations = KDF_ITERATIONS): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoder.encode(plaintext)));
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(ciphertext),
  };
}

/** Throws if the password is wrong or the data was tampered with (GCM authentication). */
export async function decryptText(blob: EncryptedBlob, password: string): Promise<string> {
  const iterations = Math.min(Math.max(Number(blob.kdf.iterations) || KDF_ITERATIONS, 10_000), 5_000_000);
  const key = await deriveKey(password, fromBase64(blob.kdf.salt), iterations);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(blob.cipher.iv) as BufferSource }, key, fromBase64(blob.data) as BufferSource);
  return decoder.decode(plaintext);
}
