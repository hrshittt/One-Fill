import type { BlockReason, FieldKey } from '../types/fields';

/**
 * Level 1 — HTML autocomplete semantics (WHATWG "autofill detail tokens").
 * https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill
 */

const AUTOCOMPLETE_TO_KEY: Record<string, FieldKey> = {
  name: 'personal.fullName',
  'given-name': 'personal.firstName',
  'additional-name': 'personal.middleName',
  'family-name': 'personal.lastName',
  bday: 'personal.dateOfBirth',
  'bday-day': 'personal.dobDay',
  'bday-month': 'personal.dobMonth',
  'bday-year': 'personal.dobYear',
  sex: 'personal.gender',
  email: 'contact.email',
  tel: 'contact.phone',
  'tel-national': 'contact.phone',
  'tel-local': 'contact.phone',
  'tel-country-code': 'contact.phoneCountryCode',
  'street-address': 'address.full',
  'address-line1': 'address.line1',
  'address-line2': 'address.line2',
  'address-line3': 'address.landmark',
  'address-level2': 'address.city',
  'address-level1': 'address.state',
  country: 'address.country',
  'country-name': 'address.country',
  'postal-code': 'address.postalCode',
  organization: 'professional.currentCompany',
  'organization-title': 'professional.jobTitle',
  url: 'professional.portfolio',
};

/** Tokens that modify the field token but don't change its meaning. */
const MODIFIERS = new Set(['shipping', 'billing', 'home', 'work', 'mobile', 'fax', 'pager', 'webauthn']);

export interface AutocompleteResult {
  key: FieldKey | null;
  blocked: BlockReason | null;
  /** Lower confidence for tokens that are only loosely tied to our profile (e.g. "url"). */
  confidence: number;
}

const NONE: AutocompleteResult = { key: null, blocked: null, confidence: 0 };

export function matchAutocomplete(attribute: string, inputType: string): AutocompleteResult {
  const tokens = attribute.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return NONE;
  const fieldToken = tokens.filter((t) => !t.startsWith('section-') && !MODIFIERS.has(t)).pop();
  if (!fieldToken || fieldToken === 'on' || fieldToken === 'off') return NONE;

  if (fieldToken.startsWith('cc-') || fieldToken.startsWith('transaction-')) {
    return { key: null, blocked: 'payment', confidence: 1 };
  }
  if (fieldToken === 'one-time-code') return { key: null, blocked: 'otp', confidence: 1 };
  // Sites often set autocomplete="new-password" on ordinary fields just to suppress browser autofill,
  // so it is only trusted on real password inputs (which are blocked separately anyway).
  if ((fieldToken === 'new-password' || fieldToken === 'current-password') && inputType === 'password') {
    return { key: null, blocked: 'password', confidence: 1 };
  }

  const key = AUTOCOMPLETE_TO_KEY[fieldToken];
  if (!key) return NONE;
  // "tel" on a work line is probably not the user's personal mobile.
  const isWorkContact = tokens.includes('work') && (key === 'contact.phone' || key === 'contact.email');
  return { key, blocked: null, confidence: fieldToken === 'url' ? 0.7 : isWorkContact ? 0.75 : 0.96 };
}
