/**
 * Masking helpers for showing personal data in the UI without exposing it.
 * Masking keeps separators (spaces, dashes, "+91") so the value stays recognisable.
 */

const MASK_CHAR = 'X';

/**
 * Masks every alphanumeric character except the last `visible` ones.
 *   maskValue('1234 5678 9012')  → 'XXXX XXXX 9012'
 *   maskValue('ABCDE1234F')      → 'XXXXXX234F'
 */
export function maskValue(value: string, visible = 4): string {
  const chars = [...value];
  let alnumSeen = 0;
  const totalAlnum = chars.filter(isAlnum).length;
  const keep = Math.min(visible, Math.max(0, totalAlnum - 1));
  return chars
    .map((ch) => {
      if (!isAlnum(ch)) return ch;
      alnumSeen += 1;
      return alnumSeen > totalAlnum - keep ? ch : MASK_CHAR;
    })
    .join('');
}

/** Aadhaar: always rendered as `XXXX XXXX 1234`. */
export function maskAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return maskValue(value, 0);
  return `XXXX XXXX ${digits.slice(-4)}`;
}

/**
 * Phone: keeps the country code and the last 5 digits.
 *   maskPhone('9876512345', '+91') → '+91 XXXXX 12345'
 */
export function maskPhone(value: string, countryCode = ''): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const code = countryCode.trim();
  const tail = digits.length > 6 ? digits.slice(-5) : digits.slice(-2);
  const hidden = MASK_CHAR.repeat(Math.max(0, digits.length - tail.length));
  return [code, hidden, tail].filter(Boolean).join(' ');
}

/** Email: keeps the first character and the domain. `harshit@gmail.com` → `h••••••@gmail.com`. */
export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return maskValue(value, 2);
  const local = value.slice(0, at);
  return `${local[0]}${'•'.repeat(Math.max(1, Math.min(local.length - 1, 6)))}${value.slice(at)}`;
}

/** Date of birth: shows only the year. */
export function maskDate(value: string): string {
  const year = /(\d{4})/.exec(value)?.[1];
  return year ? `••/••/${year}` : maskValue(value, 0);
}

function isAlnum(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}
