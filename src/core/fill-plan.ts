import { CONFIDENCE } from '../matching/field-mapper';
import { getFieldDefinition, isSensitiveKey } from '../matching/field-catalog';
import { aliasesFor, matchOption } from '../matching/option-matcher';
import { simplify } from '../matching/text-normalizer';
import type { BlockReason, DetectedField, FieldKey, FieldMatch, FillInstruction } from '../types/fields';
import type { UserProfile } from '../types/profile';
import type { Settings } from '../types/settings';
import { maskAadhaar, maskDate, maskPhone, maskValue } from '../utils/mask';
import { formatDateForField, formatPhoneForField, formatUrlForField, toNumericString } from './formatters';
import { educationFor, resolveProfileValue, type ProfileValue } from './profile-values';

/**
 * Turns field matches + the profile into a reviewable fill plan.
 * Nothing here touches the DOM; the resulting instructions are executed by the content script.
 */

export type AssessmentStatus =
  | 'ready' // confident match with a value — filled by "Fill form"
  | 'review' // uncertain match, or the value doesn't fit — needs confirmation
  | 'sensitive' // government ID etc. — only filled when explicitly ticked
  | 'missing' // recognised, but the profile has no value
  | 'unmatched' // not recognised
  | 'prefilled' // the page already has a value and overwriting is off
  | 'unsupported' // recognised but cannot be filled automatically
  | 'blocked'; // never filled (password, OTP, payment, consent…)

export interface FieldAssessment {
  /** `${frameId}:${fieldId}` — unique across frames. */
  uid: string;
  field: DetectedField;
  match: FieldMatch;
  key: FieldKey | null;
  status: AssessmentStatus;
  confidence: number;
  sensitive: boolean;
  /** Value preview for the UI — masked for sensitive and contact data. */
  displayValue: string;
  instruction: FillInstruction | null;
  /** Resume document to attach (file instructions are hydrated right before filling). */
  documentId?: string;
  note: string;
}

export interface AssessOptions {
  settings: Pick<Settings, 'confirmUncertain' | 'sensitivePolicy' | 'overwriteExisting'>;
  locale?: string;
  /** Mapping chosen by the user in review, per uid. `null` means "leave empty". */
  keyOverrides?: ReadonlyMap<string, FieldKey | null>;
  /** Option chosen manually for a select/radio field, per uid (option id). */
  optionOverrides?: ReadonlyMap<string, string>;
  today?: Date;
}

export const uidOf = (f: Pick<DetectedField, 'frameId' | 'id'>) => `${f.frameId}:${f.id}`;

const BLOCK_NOTES: Record<BlockReason, string> = {
  password: 'Passwords are never filled',
  otp: 'One-time codes are never filled',
  captcha: 'Captchas are never filled',
  payment: 'Payment and bank details are never filled',
  consent: 'Consent boxes are left for you to tick',
  search: 'Search box',
  account: 'Account field',
};

export function assessFields(
  fields: readonly DetectedField[],
  matches: readonly FieldMatch[],
  profile: UserProfile,
  options: AssessOptions,
): FieldAssessment[] {
  const matchByUid = new Map(matches.map((m) => [`${m.frameId}:${m.fieldId}`, m]));
  const codeFieldForms = new Set(
    matches
      .filter((m) => (options.keyOverrides?.get(`${m.frameId}:${m.fieldId}`) ?? m.key) === 'contact.phoneCountryCode')
      .map((m) => {
        const f = fields.find((x) => x.frameId === m.frameId && x.id === m.fieldId);
        return `${m.frameId}:${f?.formIndex ?? -1}`;
      }),
  );

  return fields.map((field) => {
    const uid = uidOf(field);
    const match = matchByUid.get(uid)!;
    const overridden = options.keyOverrides?.has(uid) ?? false;
    const key = overridden ? (options.keyOverrides!.get(uid) ?? null) : match.key;
    let confidence = overridden ? 1 : match.confidence;
    const sensitive = isSensitiveKey(key);
    const result = (status: AssessmentStatus, extra: Partial<FieldAssessment> = {}): FieldAssessment => ({
      uid,
      field,
      match,
      key,
      status,
      confidence,
      sensitive,
      displayValue: '',
      instruction: null,
      note: '',
      ...extra,
    });

    if (match.blocked && !overridden) return result('blocked', { note: BLOCK_NOTES[match.blocked] });
    if (!key) return result('unmatched', { note: overridden ? 'You chose to leave this empty' : 'No matching information' });

    const value = resolveProfileValue(profile, key, match.qualifiers, options.today);
    if (!value) return result('missing', { note: 'Not in your profile yet' });

    const context: BuildContext = {
      locale: options.locale,
      hasSeparateCodeField: codeFieldForms.has(`${field.frameId}:${field.formIndex}`),
      optionOverride: options.optionOverrides?.get(uid),
      qualifiers: match.qualifiers,
    };
    const built = buildInstruction(field, key, value, profile, context);
    const displayValue = displayValueFor(key, value, profile);
    if (!built.instruction) return result(built.unsupported ? 'unsupported' : 'review', { displayValue, note: built.note });

    // Ambiguity only matters if the interpretations fill different things: a "Country" select
    // listing "India (+91)" means the same option whether it's the country or the dialling code.
    if (!overridden && confidence < CONFIDENCE.READY) {
      const [first, second] = match.candidates;
      if (first?.key === key && second && first.confidence >= CONFIDENCE.READY && second.confidence >= CONFIDENCE.MIN_MATCH) {
        const alternative = resolveProfileValue(profile, second.key, match.qualifiers, options.today);
        const altBuilt = alternative ? buildInstruction(field, second.key, alternative, profile, context) : null;
        if (altBuilt?.instruction && JSON.stringify(altBuilt.instruction) === JSON.stringify(built.instruction)) confidence = first.confidence;
      }
    }

    const extra = { displayValue, instruction: built.instruction, documentId: built.documentId, note: built.note };
    if (sensitive) {
      return result('sensitive', {
        ...extra,
        note: options.settings.sensitivePolicy === 'never' ? 'Sensitive fields are turned off in settings' : 'Sensitive — tick to include',
      });
    }
    if (field.hasValue && !options.settings.overwriteExisting) return result('prefilled', { ...extra, note: 'Already filled on the page' });
    if (built.note) return result('review', extra);
    if (!overridden && confidence < CONFIDENCE.READY && options.settings.confirmUncertain) {
      return result('review', { ...extra, note: 'Please confirm this match' });
    }
    return result('ready', extra);
  });
}

interface BuildContext {
  locale?: string;
  hasSeparateCodeField: boolean;
  optionOverride?: string;
  qualifiers: readonly string[];
}

interface BuiltInstruction {
  instruction: FillInstruction | null;
  documentId?: string;
  /** When set on a successful build, the fill is possible but the user should double-check. */
  note: string;
  unsupported?: boolean;
}

function buildInstruction(field: DetectedField, key: FieldKey, value: ProfileValue, profile: UserProfile, ctx: BuildContext): BuiltInstruction {
  const def = getFieldDefinition(key);
  const fieldId = field.id;

  if (field.kind === 'file') {
    if (value.type !== 'file') return { instruction: null, note: 'This field needs a file upload', unsupported: true };
    return {
      instruction: { fieldId, action: 'file', file: { name: value.fileName, type: '', dataUrl: '' } },
      documentId: value.documentId,
      note: '',
    };
  }
  if (value.type === 'file') return { instruction: null, note: 'Resumes can only go into file upload fields', unsupported: true };
  if (field.kind === 'checkbox') return { instruction: null, note: 'Single checkboxes are left for you', unsupported: true };

  if (field.kind === 'select' || field.kind === 'radio-group') {
    if (ctx.optionOverride !== undefined) {
      const index = field.options.findIndex((o) => o.id === ctx.optionOverride);
      if (index >= 0) return optionInstruction(field, index, '');
    }
    const target = value.type === 'list' ? value.items[0] ?? '' : value.matchText ?? value.text;
    let match = matchOption(target, field.options, def?.optionSet, { country: profile.address.country });
    if (!match && value.type === 'text' && value.matchText) match = matchOption(value.text, field.options, def?.optionSet);
    // "B.Tech" isn't listed but "Bachelor's Degree" is: fall back to the record's level.
    if (!match && key === 'education.degree') {
      const level = educationFor(profile, ctx.qualifiers)?.level;
      const byLevel = level ? matchOption(level, field.options, 'educationLevel') : null;
      if (byLevel && byLevel.confidence >= 0.9) match = byLevel;
    }
    if (!match) return { instruction: null, note: `No option matches your ${def?.label.toLowerCase() ?? 'value'}` };
    return optionInstruction(field, match.index, match.confidence < 0.8 ? 'Closest option — please check' : '');
  }

  if (field.kind === 'checkbox-group') {
    const items = value.type === 'list' ? value.items : [value.matchText ?? value.text];
    const checkIds = new Set<string>();
    for (const item of items) {
      const aliases = aliasesFor(item, def?.optionSet);
      const option = field.options.find((o) => !o.disabled && (aliases.has(simplify(o.text)) || aliases.has(simplify(o.value))));
      if (option) checkIds.add(option.id);
    }
    if (checkIds.size === 0) return { instruction: null, note: 'None of the options match your profile' };
    return { instruction: { fieldId, action: 'checkbox-group', checkIds: [...checkIds] }, note: '' };
  }

  // Text-like controls.
  let text = value.type === 'list' ? value.items.join(', ') : value.text;
  switch (def?.valueType) {
    case 'date':
      text = formatDateForField(text, field, ctx.locale);
      break;
    case 'phone': {
      const code = key === 'contact.phone' || key === 'contact.alternatePhone' ? profile.contact.phoneCountryCode : '';
      text = formatPhoneForField(text, code, field, ctx.hasSeparateCodeField);
      break;
    }
    case 'url':
      text = formatUrlForField(text, field);
      break;
    default:
      break;
  }
  if (key === 'identification.aadhaar') {
    const digits = text.replace(/\D/g, '');
    text = field.maxLength !== null && field.maxLength < 14 ? digits : digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }
  if (field.kind === 'number') {
    const numeric = toNumericString(text);
    if (numeric === null) return { instruction: null, note: 'This field only accepts numbers' };
    text = numeric;
  }
  if (field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { instruction: null, note: 'This field expects a date', unsupported: true };
  }
  if (field.maxLength !== null && field.maxLength > 0 && text.length > field.maxLength) {
    return { instruction: null, note: `Your value is longer than this field allows (${field.maxLength} characters)` };
  }
  return { instruction: { fieldId, action: 'text', value: text }, note: '' };
}

function optionInstruction(field: DetectedField, index: number, note: string): BuiltInstruction {
  const option = field.options[index]!;
  const instruction: FillInstruction =
    field.kind === 'select'
      ? { fieldId: field.id, action: 'select', optionIndex: Number(option.id) }
      : { fieldId: field.id, action: 'radio', optionId: option.id };
  return { instruction, note };
}

/** A short preview of what will be filled, masked where the value is sensitive or personal. */
export function displayValueFor(key: FieldKey, value: ProfileValue, profile: UserProfile): string {
  if (value.type === 'file') return `📎 ${value.fileName || 'Resume'}`;
  if (value.type === 'list') return value.items.slice(0, 4).join(', ') + (value.items.length > 4 ? ` +${value.items.length - 4}` : '');
  const text = value.text;
  if (key === 'identification.aadhaar') return maskAadhaar(text);
  if (isSensitiveKey(key)) return maskValue(text, 4);
  if (key === 'contact.phone' || key === 'contact.alternatePhone') return maskPhone(text, profile.contact.phoneCountryCode);
  if (key === 'emergency.phone') return maskPhone(text);
  if (key === 'personal.dateOfBirth') return maskDate(text);
  if (key === 'professional.coverLetter') return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

export interface FillDecisions {
  /** Review items the user confirmed. */
  confirmed: ReadonlySet<string>;
  /** Sensitive items the user explicitly ticked. */
  includeSensitive: ReadonlySet<string>;
  /** Ready items the user unticked. */
  excluded: ReadonlySet<string>;
  /** Prefilled items the user chose to overwrite. */
  overwrite: ReadonlySet<string>;
}

export const EMPTY_DECISIONS: FillDecisions = {
  confirmed: new Set(),
  includeSensitive: new Set(),
  excluded: new Set(),
  overwrite: new Set(),
};

/** Whether an assessment will be filled, given the user's decisions. */
export function willFill(a: FieldAssessment, decisions: FillDecisions, sensitivePolicy: Settings['sensitivePolicy']): boolean {
  if (!a.instruction || decisions.excluded.has(a.uid)) return false;
  switch (a.status) {
    case 'ready':
      return true;
    case 'review':
      return decisions.confirmed.has(a.uid);
    case 'sensitive':
      return sensitivePolicy === 'ask' && decisions.includeSensitive.has(a.uid);
    case 'prefilled':
      return decisions.overwrite.has(a.uid);
    default:
      return false;
  }
}

/** Groups the instructions to execute by frame. */
export function selectInstructions(
  assessments: readonly FieldAssessment[],
  decisions: FillDecisions,
  sensitivePolicy: Settings['sensitivePolicy'],
): Map<number, Array<{ assessment: FieldAssessment; instruction: FillInstruction }>> {
  const byFrame = new Map<number, Array<{ assessment: FieldAssessment; instruction: FillInstruction }>>();
  for (const a of assessments) {
    if (!willFill(a, decisions, sensitivePolicy)) continue;
    const list = byFrame.get(a.field.frameId) ?? [];
    list.push({ assessment: a, instruction: a.instruction! });
    byFrame.set(a.field.frameId, list);
  }
  return byFrame;
}

export interface PlanSummary {
  total: number;
  ready: number;
  review: number;
  sensitive: number;
  missing: number;
  unmatched: number;
  blocked: number;
  prefilled: number;
  unsupported: number;
  /** Fields recognised as a profile field (ready + review + sensitive + missing + prefilled). */
  matched: number;
}

export function summarize(assessments: readonly FieldAssessment[]): PlanSummary {
  const s: PlanSummary = { total: 0, ready: 0, review: 0, sensitive: 0, missing: 0, unmatched: 0, blocked: 0, prefilled: 0, unsupported: 0, matched: 0 };
  for (const a of assessments) {
    if (a.status === 'blocked') {
      s.blocked++;
      continue;
    }
    s.total++;
    s[a.status]++;
  }
  s.matched = s.ready + s.review + s.sensitive + s.missing + s.prefilled + s.unsupported;
  return s;
}
