/**
 * Field validators used by the profile editor. Each returns null when the value is acceptable,
 * or a problem with a severity: errors block saving, warnings are shown but allowed.
 * Empty values are always valid — every profile field is optional.
 */

export interface ValidationProblem {
  level: 'error' | 'warning';
  message: string;
}

export type Validator = (value: string) => ValidationProblem | null;

const error = (message: string): ValidationProblem => ({ level: 'error', message });
const warning = (message: string): ValidationProblem => ({ level: 'warning', message });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const validators = {
  email: (v) => (!v || EMAIL_RE.test(v.trim()) ? null : error('Enter a valid email address, like name@example.com.')),

  phone: (v) => {
    if (!v) return null;
    if (/[^\d\s()+\-.]/.test(v)) return error('Phone numbers can only contain digits, spaces and + ( ) -.');
    const digits = v.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 15) return error('Enter a phone number with 6–15 digits.');
    return null;
  },

  countryCode: (v) => (!v || /^\+\d{1,4}$/.test(v.trim()) ? null : error('Use the format +91 or +1.')),

  url: (v) => {
    if (!v) return null;
    try {
      const url = new URL(v.trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? null : error('Links must start with https://.');
    } catch {
      return error('Enter a full link, like https://linkedin.com/in/you.');
    }
  },

  postalCode: (v) => (!v || /^[A-Za-z0-9][A-Za-z0-9 \-]{1,9}$/.test(v.trim()) ? null : error('Enter a valid ZIP / postal code.')),

  dateOfBirth: (v) => {
    if (!v) return null;
    const date = parseIsoDate(v);
    if (!date) return error('Enter a valid date.');
    const age = ageOn(date, new Date());
    if (age < 0) return error('Date of birth can’t be in the future.');
    if (age > 120) return error('Please check the year.');
    if (age < 10) return warning('That makes you younger than 10 — double-check the year.');
    return null;
  },

  year: (v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1940 && n <= 2100 ? null : error('Enter a 4-digit year.');
  },

  percentage: (v) => {
    if (!v) return null;
    const n = Number(v.replace('%', ''));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? null : error('Enter a percentage between 0 and 100.');
  },

  cgpa: (v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? null : error('Enter a CGPA between 0 and 10.');
  },

  experience: (v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 60 ? null : error('Enter years of experience between 0 and 60.');
  },

  pan: (v) =>
    !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.trim().toUpperCase())
      ? null
      : error('PAN has 10 characters: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).'),

  aadhaar: (v) => {
    if (!v) return null;
    const digits = v.replace(/[\s-]/g, '');
    if (!/^\d{12}$/.test(digits)) return error('Aadhaar numbers have 12 digits.');
    if (/^[01]/.test(digits)) return error('Aadhaar numbers never start with 0 or 1.');
    if (!verhoeffValid(digits)) return warning('This doesn’t look like a valid Aadhaar number — check for typos.');
    return null;
  },

  passport: (v) => (!v || /^[A-Z0-9]{6,9}$/.test(v.trim().toUpperCase()) ? null : error('Passport numbers are 6–9 letters/digits.')),

  voterId: (v) => (!v || /^[A-Z]{3}[0-9]{7}$/.test(v.trim().toUpperCase()) ? null : warning('Voter IDs are usually 3 letters followed by 7 digits.')),

  drivingLicense: (v) =>
    !v || /^[A-Z0-9][A-Z0-9 \-/]{6,19}$/.test(v.trim().toUpperCase()) ? null : warning('Check the driving licence number.'),

  name: (v) => (!v || /^[\p{L}\p{M}' .\-]{1,80}$/u.test(v.trim()) ? null : warning('Names usually contain only letters, spaces, dots and hyphens.')),
} satisfies Record<string, Validator>;

export type ValidatorName = keyof typeof validators;

export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function ageOn(dob: Date, today: Date): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Verhoeff checksum (used by Aadhaar).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const reversed = [...digits].reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = D[c]![P[i % 8]![Number(reversed[i])]!]!;
  }
  return c === 0;
}
