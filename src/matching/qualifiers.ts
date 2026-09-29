import type { FieldKey } from '../types/fields';

/**
 * Qualifiers are words that change *whose* or *which* value a field asks for:
 * "Father's name" is not your name, "Emergency contact phone" is not your phone,
 * "10th percentage" is not your graduation percentage.
 *
 * - A field definition can REQUIRE a qualifier (fatherName requires "father").
 * - A definition can ALLOW qualifiers (address fields allow "permanent"/"current").
 * - Any other qualifier found on the field's own label penalises the definition by `penalty`.
 *   Qualifiers found only in the surrounding section heading apply a softened penalty.
 */

export type QualifierId =
  | 'father'
  | 'mother'
  | 'guardian'
  | 'spouse'
  | 'emergency'
  | 'reference'
  | 'nominee'
  | 'account'
  | 'company'
  | 'alternate'
  | 'tenth'
  | 'twelfth'
  | 'undergrad'
  | 'postgrad'
  | 'diploma'
  | 'dob'
  | 'addressType';

interface QualifierGroup {
  tokens: readonly string[];
  /** Multiplier applied to definitions that neither require nor allow this qualifier. */
  penalty: number;
  /** Key prefixes the penalty applies to. Undefined = every definition. */
  appliesTo?: readonly string[];
}

export const QUALIFIERS: Record<QualifierId, QualifierGroup> = {
  father: { tokens: ['father', 'dad', 'paternal'], penalty: 0.2 },
  mother: { tokens: ['mother', 'mom', 'maternal'], penalty: 0.2 },
  guardian: { tokens: ['guardian', 'parent', 'parents'], penalty: 0.25 },
  spouse: { tokens: ['spouse', 'husband', 'wife'], penalty: 0.2 },
  emergency: { tokens: ['emergency', 'ice', 'kin'], penalty: 0.2 },
  reference: { tokens: ['reference', 'referee', 'referrer', 'referral', 'recommender', 'referred', 'referring'], penalty: 0.2 },
  nominee: { tokens: ['nominee', 'beneficiary'], penalty: 0.2 },
  account: {
    tokens: ['user', 'username', 'login', 'nick', 'nickname', 'screen', 'display', 'preferred', 'alias', 'handle'],
    penalty: 0.2,
    appliesTo: ['personal.'],
  },
  company: {
    tokens: ['company', 'employer', 'organization', 'firm', 'business', 'office', 'work', 'official', 'corporate'],
    penalty: 0.55,
    appliesTo: ['personal.', 'contact.', 'address.'],
  },
  alternate: {
    tokens: ['alternate', 'alternative', 'secondary', 'other', 'another', 'additional', 'second', 'backup', 'landline'],
    penalty: 0.25,
    appliesTo: ['contact.'],
  },
  tenth: { tokens: ['tenth'], penalty: 0.25, appliesTo: ['education.'] },
  twelfth: { tokens: ['twelfth'], penalty: 0.25, appliesTo: ['education.'] },
  undergrad: { tokens: ['undergrad'], penalty: 0.7, appliesTo: ['education.'] },
  postgrad: { tokens: ['postgrad'], penalty: 0.7, appliesTo: ['education.'] },
  diploma: { tokens: ['diploma'], penalty: 0.7, appliesTo: ['education.'] },
  dob: { tokens: ['dob'], penalty: 1 },
  addressType: {
    tokens: ['permanent', 'present', 'current', 'correspondence', 'residential', 'residence', 'mailing', 'communication', 'home', 'local', 'native', 'postal', 'billing', 'shipping'],
    penalty: 1,
  },
};

const TOKEN_TO_QUALIFIER = new Map<string, QualifierId>();
for (const [id, group] of Object.entries(QUALIFIERS) as [QualifierId, QualifierGroup][]) {
  for (const token of group.tokens) TOKEN_TO_QUALIFIER.set(token, id);
}

export function qualifiersIn(tokens: Iterable<string>): Set<QualifierId> {
  const found = new Set<QualifierId>();
  for (const token of tokens) {
    const q = TOKEN_TO_QUALIFIER.get(token);
    if (q) found.add(q);
  }
  return found;
}

export function qualifierTokens(ids: Iterable<QualifierId>): Set<string> {
  const tokens = new Set<string>();
  for (const id of ids) for (const t of QUALIFIERS[id].tokens) tokens.add(t);
  return tokens;
}

export function qualifierAppliesTo(id: QualifierId, key: FieldKey): boolean {
  const scope = QUALIFIERS[id].appliesTo;
  return !scope || scope.some((prefix) => key.startsWith(prefix));
}

/** Education-record selectors: which record a generic education key should read from. */
export const EDUCATION_LEVEL_QUALIFIERS: Partial<Record<QualifierId, string>> = {
  tenth: 'secondary',
  twelfth: 'higher-secondary',
  undergrad: 'bachelors',
  postgrad: 'masters',
  diploma: 'diploma',
};
