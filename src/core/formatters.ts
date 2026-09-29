import type { DetectedField } from '../types/fields';

/**
 * Formats profile values to fit a specific form field: date formats from placeholders,
 * national vs international phone numbers, URL normalisation.
 */

type DateOrder = 'dmy' | 'mdy' | 'ymd';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats an ISO date (yyyy-mm-dd) for the given field. */
export function formatDateForField(iso: string, field: Pick<DetectedField, 'kind' | 'placeholder' | 'pattern' | 'title' | 'label'>, locale = 'en-IN'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  if (field.kind === 'date') return iso;
  if (field.kind === 'month') return `${y}-${mo}`;

  const hint = `${field.placeholder} ${field.title} ${field.label}`.toLowerCase();
  const format = /(dd|mm|mmm|yyyy|yy)\s*([/\-. ])\s*(dd|mm|mmm|yyyy|yy)\s*\2\s*(dd|mm|mmm|yyyy|yy)/.exec(hint);
  if (format) {
    const sep = format[2]!;
    const parts = [format[1]!, format[3]!, format[4]!].map((token) => {
      switch (token) {
        case 'dd': return d;
        case 'mm': return mo;
        case 'mmm': return MONTH_SHORT[Number(mo) - 1]!;
        case 'yyyy': return y;
        case 'yy': return y.slice(2);
        default: return '';
      }
    });
    return parts.join(sep);
  }
  const order: DateOrder = /^en-us\b/i.test(locale) ? 'mdy' : 'dmy';
  return order === 'mdy' ? `${mo}/${d}/${y}` : `${d}/${mo}/${y}`;
}

/**
 * Phone numbers are stored as a national number plus a separate country code.
 * Fields get the national number unless they clearly expect the international format
 * (placeholder starting with "+", or a label mentioning the country code) and there is
 * no separate country-code field on the same form.
 */
export function formatPhoneForField(
  national: string,
  countryCode: string,
  field: Pick<DetectedField, 'placeholder' | 'label' | 'maxLength' | 'pattern'>,
  hasSeparateCodeField: boolean,
): string {
  let digits = national.replace(/\D/g, '');
  const code = countryCode.replace(/[^\d+]/g, '');
  const codeDigits = code.replace(/\D/g, '');
  // Tolerate numbers saved with the country code included.
  if (codeDigits && digits.length > 10 && digits.startsWith(codeDigits)) digits = digits.slice(codeDigits.length);
  if (hasSeparateCodeField || !code) return digits;
  if (field.maxLength !== null && field.maxLength <= digits.length + 1) return digits;
  const wantsInternational =
    /^\s*\+/.test(field.placeholder) || /country\s*code|international|with\s*(isd|code)|incl.*code/i.test(field.label) || /\\\+|^\+/.test(field.pattern);
  return wantsInternational ? `${code.startsWith('+') ? code : `+${code}`} ${digits}` : digits;
}

/** Adds https:// to bare domains for URL fields; extracts the handle when a username is requested. */
export function formatUrlForField(value: string, field: Pick<DetectedField, 'kind' | 'label' | 'placeholder'>): string {
  const trimmed = value.trim();
  const wantsHandle = /user\s*name|handle|\bid\b/i.test(`${field.label} ${field.placeholder}`) && field.kind !== 'url';
  if (wantsHandle) {
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      const parts = url.pathname.split('/').filter(Boolean);
      const handle = url.hostname.includes('linkedin.') ? parts[1] : parts[0];
      if (handle) return handle;
    } catch {
      /* fall through */
    }
  }
  if (field.kind === 'url' && trimmed && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** Extracts a plain number from values like "85%" or "8.7 CGPA" for numeric inputs. */
export function toNumericString(value: string): string | null {
  const m = /-?\d+(?:\.\d+)?/.exec(value.replace(/,/g, ''));
  return m ? m[0] : null;
}
