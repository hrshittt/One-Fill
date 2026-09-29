import type { ControlKind, DetectedField, FieldKey, FieldMatch, MatchCandidate, MatchSource } from '../types/fields';
import { SKIP_FIELD, type SiteOverrides } from '../types/history';
import { matchAutocomplete } from './autocomplete-matcher';
import { detectBlockReason } from './blocklist';
import { getPreparedCatalog, isFieldKey, type PreparedDefinition, type ValueType } from './field-catalog';
import { fieldNameSimilarity, isOneTypoAway } from './fuzzy-matcher';
import { analyzeOptions, type OptionHint } from './option-matcher';
import { QUALIFIERS, qualifierAppliesTo, qualifiersIn, qualifierTokens, type QualifierId } from './qualifiers';
import { fieldSignature } from './signature';
import { containsSequence, normalizeIdentifier, normalizeText, tokensToText, type NormalizedText } from './text-normalizer';

/**
 * Field intelligence layer.
 *
 * For every detected field the mapper scores every catalog definition using, in order of trust:
 *   Level 1  HTML autocomplete semantics        (autocomplete="given-name")
 *   Level 2  Known field names / exact phrases   (name="fname", label "First Name")
 *   Level 3  Keyword matching                    ("Please enter your first name here")
 *   Level 4  Fuzzy matching                      ("Frist nmae", "adress")
 *   Level 5  Context                             (section headings, option sets, input type, neighbours)
 * then applies qualifier rules ("Father's name" ≠ your name) and ambiguity checks, so uncertain
 * fields go to review instead of being filled with a guess.
 */

export const CONFIDENCE = {
  /** At or above: filled without review. */
  READY: 0.8,
  /** Below: treated as "no match". */
  MIN_MATCH: 0.45,
  /** Below: not offered as an alternative in review. */
  MIN_CANDIDATE: 0.3,
  /** Two different keys closer than this are considered ambiguous. */
  AMBIGUITY_GAP: 0.07,
} as const;

type SignalKind = 'label' | 'aria' | 'placeholder' | 'name' | 'id' | 'attr' | 'title' | 'nearby' | 'type' | 'options';

const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  label: 1,
  aria: 1,
  placeholder: 0.92,
  name: 0.9,
  id: 0.86,
  attr: 0.88,
  title: 0.8,
  nearby: 0.78,
  type: 0.8,
  options: 0.86,
};

interface Signal {
  kind: SignalKind;
  weight: number;
  norm: NormalizedText;
}

/** Signals written for humans. Identifiers (name/id/attrs) are too noisy to veto a match on their own. */
const HUMAN_SIGNALS = new Set<SignalKind>(['label', 'aria', 'placeholder', 'title', 'nearby']);

export interface PreparedField {
  field: DetectedField;
  signals: Signal[];
  labelTokens: Set<string>;
  /** Tokens used for exclusion checks: human-readable text if there is any, else identifiers. */
  exclusionTokens: Set<string>;
  contextTokens: Set<string>;
  labelQuals: Set<QualifierId>;
  contextQuals: Set<QualifierId>;
  optionHint: OptionHint | null;
  displayLabel: string;
  /** Every token the catalog knows; unknown label tokens may be typos. */
  knownTokens: ReadonlySet<string>;
}

let vocabulary: Set<string> | null = null;

function getVocabulary(): ReadonlySet<string> {
  if (!vocabulary) {
    vocabulary = new Set<string>();
    for (const def of getPreparedCatalog()) {
      for (const syn of def.prepared) syn.norm.tokens.forEach((t) => vocabulary!.add(t));
      def.excludeSet.forEach((t) => vocabulary!.add(t));
    }
  }
  return vocabulary;
}

/** Synthetic signals derived from the option set of a select / radio group (Level 5). */
const OPTION_HINT_SIGNALS: Partial<Record<OptionHint, [string, number]>> = {
  gender: ['gender', 0.9],
  marital: ['marital status', 0.9],
  country: ['country', 0.8],
  callingCode: ['country code', 0.9],
  state: ['state', 0.85],
  month: ['month', 0.7],
  day: ['day', 0.6],
  year: ['year', 0.6],
  degree: ['degree', 0.8],
  educationLevel: ['highest qualification', 0.8],
  employment: ['employment status', 0.8],
  experience: ['experience', 0.75],
};

// ── Preparation ────────────────────────────────────────────────────────────────

export function prepareField(field: DetectedField): PreparedField {
  const signals: Signal[] = [];
  const add = (kind: SignalKind, norm: NormalizedText, weight = SIGNAL_WEIGHTS[kind]) => {
    if (norm.tokens.length === 0) return;
    const existing = signals.find((s) => s.norm.text === norm.text);
    if (existing) existing.weight = Math.max(existing.weight, weight);
    else signals.push({ kind, weight, norm });
  };

  add('label', normalizeText(field.label));
  add('aria', normalizeText(field.ariaLabel));
  add('placeholder', normalizeText(field.placeholder));
  add('name', normalizeIdentifier(field.name));
  add('id', normalizeIdentifier(field.htmlId));
  for (const hint of field.attrHints.split('|')) add('attr', normalizeIdentifier(hint.trim()));
  add('title', normalizeText(field.title));
  add('nearby', normalizeText(field.nearbyText));

  const labelTokens = new Set(signals.flatMap((s) => s.norm.tokens));
  const humanTokens = new Set(signals.filter((s) => HUMAN_SIGNALS.has(s.kind)).flatMap((s) => s.norm.tokens));
  const exclusionTokens = humanTokens.size ? humanTokens : labelTokens;
  const contextNorm = normalizeText(field.sectionText);
  const contextTokens = new Set(contextNorm.tokens);

  // Type-based priors: an <input type=email> with no label is almost certainly asking for an email.
  if (field.kind === 'email') add('type', normalizeText('email'), 0.8);
  if (field.kind === 'tel') add('type', normalizeText('phone'), 0.62);
  if (field.kind === 'url') add('type', normalizeText('website'), 0.5);

  const optionHint =
    field.kind === 'select' || field.kind === 'radio-group' || field.kind === 'checkbox-group' ? analyzeOptions(field.options) : null;
  const hintSignal = optionHint ? OPTION_HINT_SIGNALS[optionHint] : undefined;
  if (hintSignal) add('options', normalizeText(hintSignal[0]), hintSignal[1]);

  const labelQuals = qualifiersIn(labelTokens);
  const contextQuals = qualifiersIn(contextTokens);
  for (const q of labelQuals) contextQuals.delete(q);

  return {
    field,
    signals,
    labelTokens,
    exclusionTokens,
    contextTokens,
    labelQuals,
    contextQuals,
    optionHint,
    displayLabel: displayLabelFor(field),
    knownTokens: getVocabulary(),
  };
}

export function displayLabelFor(field: DetectedField): string {
  const raw =
    field.label ||
    field.ariaLabel ||
    field.placeholder ||
    field.nearbyText ||
    field.title ||
    humanize(field.name) ||
    humanize(field.htmlId) ||
    'Unlabelled field';
  const clean = raw.replace(/\s+/g, ' ').replace(/[\s*:：]+$/, '').replace(/^[\s*]+/, '').trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

function humanize(identifier: string): string {
  const text = normalizeIdentifier(identifier).text;
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/** How plausible it is for a value of `valueType` to go into a control of `kind`. */
const KIND_COMPAT: Record<ControlKind, Partial<Record<ValueType, number>> & { default: number }> = {
  text: { default: 1, file: 0, longtext: 0.85, list: 0.9, date: 0.9 },
  email: { default: 0.35, email: 1 },
  tel: { default: 0.5, phone: 1, id: 0.8, number: 0.8, year: 0.7, name: 0.3, enum: 0.4, file: 0 },
  number: { default: 0.4, number: 1, year: 1, phone: 0.8, id: 0.7, enum: 0.6, name: 0.2, email: 0.1, date: 0.3, file: 0 },
  date: { default: 0.2, date: 1, file: 0 },
  month: { default: 0.2, date: 0.6, file: 0 },
  url: { default: 0.3, url: 1, file: 0 },
  textarea: { default: 0.7, longtext: 1, list: 1, text: 0.9, name: 0.6, email: 0.5, phone: 0.5, file: 0 },
  select: { default: 0.6, enum: 1, year: 1, number: 0.9, text: 0.85, list: 0.8, longtext: 0.3, date: 0.3, email: 0.2, phone: 0.3, url: 0.2, id: 0.2, file: 0 },
  'radio-group': { default: 0.2, enum: 1, year: 0.7, number: 0.7, text: 0.7, list: 0.6 },
  'checkbox-group': { default: 0.2, list: 1, enum: 0.8 },
  checkbox: { default: 0.1 },
  file: { default: 0, file: 1 },
};

interface DefScore {
  key: FieldKey;
  score: number;
  source: MatchSource;
}

function phraseScore(sig: NormalizedText, syn: NormalizedText): { score: number; source: MatchSource } {
  if (sig.text === syn.text || sig.compact === syn.compact) return { score: 1, source: 'name' };
  const extra = sig.tokens.length - syn.tokens.length;
  if (extra > 0 && containsSequence(sig.tokens, syn.tokens)) {
    return { score: Math.max(0.7, 0.93 - 0.05 * extra), source: 'keyword' };
  }
  if (extra >= 0 && syn.tokens.every((t) => sig.tokens.includes(t))) {
    return { score: Math.max(0.62, 0.84 - 0.05 * extra), source: 'keyword' };
  }
  // Identifiers that were never split ("candidatefirstname") still contain the compact synonym.
  if (syn.compact.length >= 5 && sig.compact.includes(syn.compact)) {
    return { score: Math.max(0.6, 0.86 - 0.02 * (sig.compact.length - syn.compact.length)), source: 'keyword' };
  }
  // Level 4: typos. Whole-string similarity, then token-by-token similarity for multi-word labels.
  let fuzzy = 0;
  const whole = fieldNameSimilarity(sig.compact, syn.compact);
  if (whole >= 0.9) fuzzy = 0.55 + (whole - 0.9) * 3.2;
  if (syn.tokens.length > 1 && sig.tokens.length === syn.tokens.length) {
    const tokenSims = syn.tokens.map((t, i) => (t === sig.tokens[i] ? 1 : fieldNameSimilarity(t, sig.tokens[i]!)));
    const min = Math.min(...tokenSims);
    if (min >= 0.88 && tokenSims.includes(1)) fuzzy = Math.max(fuzzy, 0.72 + ((min - 0.88) / 0.12) * 0.2);
  }
  return { score: fuzzy, source: 'fuzzy' };
}

/** Exclusion words apply to misspellings too ("Frist name" is still not a full name). */
function hasExcludedToken(def: PreparedDefinition, prep: PreparedField): boolean {
  for (const token of prep.exclusionTokens) {
    if (def.excludeSet.has(token)) return true;
    if (token.length >= 4 && !prep.knownTokens.has(token)) {
      for (const excluded of def.excludeSet) if (isOneTypoAway(token, excluded)) return true;
    }
  }
  return false;
}

function scoreDefinition(def: PreparedDefinition, prep: PreparedField): DefScore | null {
  let factor = KIND_COMPAT[prep.field.kind][def.valueType] ?? KIND_COMPAT[prep.field.kind].default;
  if (factor === 0) return null;

  const own = new Set<QualifierId>([...(def.requires ?? []), ...(def.allows ?? [])]);
  let viaContext = false;
  if (def.requires?.length) {
    if (def.requires.some((q) => prep.labelQuals.has(q))) {
      // satisfied by the field's own label
    } else if (def.requires.some((q) => prep.contextQuals.has(q))) {
      factor *= 0.9;
      viaContext = true;
    } else {
      return null;
    }
  }
  for (const q of prep.labelQuals) {
    if (!own.has(q) && qualifierAppliesTo(q, def.key)) factor *= QUALIFIERS[q].penalty;
  }
  for (const q of prep.contextQuals) {
    if (!own.has(q) && qualifierAppliesTo(q, def.key)) factor *= 1 - (1 - QUALIFIERS[q].penalty) * 0.5;
  }
  if (def.excludeSet.size && hasExcludedToken(def, prep)) factor *= 0.2;
  if (prep.optionHint === 'salutation' || prep.optionHint === 'yesno') factor *= 0.3;
  if (factor < 0.05) return null;

  const strip = own.size ? qualifierTokens(own) : null;
  let best = 0;
  let bestSource: MatchSource = 'keyword';
  let agreeing = 0;

  for (const signal of prep.signals) {
    let norm = signal.norm;
    if (strip) {
      const kept = norm.tokens.filter((t) => !strip.has(t));
      if (kept.length === 0) {
        // Only the qualifier itself remains, e.g. a field labelled just "Father".
        if (def.aloneTokens?.some((t) => norm.tokens.includes(t))) {
          const score = 0.95 * signal.weight;
          if (score > best) [best, bestSource] = [score, 'name'];
          agreeing++;
        }
        continue;
      }
      if (kept.length !== norm.tokens.length) norm = tokensToText(kept);
    }
    let signalBest = 0;
    let signalSource: MatchSource = 'keyword';
    for (const syn of def.prepared) {
      const { score, source } = phraseScore(norm, syn.norm);
      const weighted = score * syn.weight;
      if (weighted > signalBest) [signalBest, signalSource] = [weighted, source];
    }
    signalBest *= signal.weight;
    if (signalBest >= 0.6) agreeing++;
    if (signalBest > best) {
      best = signalBest;
      bestSource = signal.kind === 'options' || signal.kind === 'type' ? 'context' : signalSource;
    }
  }
  if (best === 0) return null;

  let prior = def.prior ?? 1;
  if (prior < 1 && def.boostSet.size) {
    const boosted = [...prep.labelTokens, ...prep.contextTokens].some((t) => def.boostSet.has(t));
    if (boosted) prior = 1;
  }
  const bonus = Math.min(0.06, 0.03 * Math.max(0, agreeing - 1));
  const score = Math.min(0.99, (best + bonus) * prior * factor);
  return { key: def.key, score, source: viaContext ? 'context' : bestSource };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface MapOptions {
  /** Per-site corrections the user made previously (signature → key or SKIP_FIELD). */
  overrides?: SiteOverrides;
}

export function mapField(field: DetectedField, options: MapOptions = {}): FieldMatch {
  return mapPrepared(prepareField(field), options);
}

function mapPrepared(prep: PreparedField, options: MapOptions): FieldMatch {
  const { field } = prep;
  const base = {
    fieldId: field.id,
    frameId: field.frameId,
    detectedLabel: prep.displayLabel,
    qualifiers: [...prep.labelQuals, ...prep.contextQuals],
  };
  const noMatch = (blocked: FieldMatch['blocked'] = null, candidates: MatchCandidate[] = []): FieldMatch => ({
    ...base,
    key: null,
    confidence: 0,
    source: null,
    candidates,
    blocked,
  });

  const autocomplete = matchAutocomplete(field.autocomplete, field.inputType);
  const blocked =
    autocomplete.blocked ?? detectBlockReason([...prep.labelTokens], field.kind, field.inputType, { name: field.name });
  if (blocked) return noMatch(blocked);

  const scored: DefScore[] = [];
  for (const def of getPreparedCatalog()) {
    const result = scoreDefinition(def, prep);
    if (result) scored.push(result);
  }

  if (autocomplete.key) {
    const existing = scored.find((s) => s.key === autocomplete.key);
    if (existing) {
      existing.score = Math.min(0.99, Math.max(existing.score, autocomplete.confidence) + 0.03);
      if (autocomplete.confidence >= existing.score - 0.03) existing.source = 'autocomplete';
    } else {
      scored.push({ key: autocomplete.key, score: autocomplete.confidence, source: 'autocomplete' });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates: MatchCandidate[] = scored
    .filter((s) => s.score >= CONFIDENCE.MIN_CANDIDATE)
    .slice(0, 4)
    .map((s) => ({ key: s.key, confidence: round(s.score), source: s.source }));

  // A remembered user decision beats every heuristic.
  const override = options.overrides?.[fieldSignature(field)];
  if (override === SKIP_FIELD) return noMatch(null, candidates);
  if (override && isFieldKey(override)) {
    const userCandidate: MatchCandidate = { key: override, confidence: 1, source: 'user' };
    return {
      ...base,
      key: override,
      confidence: 1,
      source: 'user',
      candidates: [userCandidate, ...candidates.filter((c) => c.key !== override)],
      blocked: null,
    };
  }

  const [top, second] = scored;
  if (!top || top.score < CONFIDENCE.MIN_MATCH) return noMatch(null, candidates);

  let confidence = top.score;
  // Two different interpretations score almost the same → ask the user.
  if (second && second.score >= CONFIDENCE.MIN_MATCH && top.score - second.score < CONFIDENCE.AMBIGUITY_GAP) {
    confidence = Math.min(confidence, 0.7);
  }
  // The page's autocomplete attribute disagrees with what the label says → ask the user.
  if (autocomplete.key && autocomplete.key !== top.key && autocomplete.confidence >= 0.9) {
    confidence = Math.min(confidence, 0.72);
  }

  return { ...base, key: top.key, confidence: round(confidence), source: top.source, candidates, blocked: null };
}

/**
 * Maps every field of a scan and applies cross-field context rules (Level 5):
 * - a generic "Address" input becomes Address line 1 when the same form also asks for line 2;
 * - a short phone-like field right before the phone number is its country code.
 */
export function mapFields(fields: readonly DetectedField[], options: MapOptions = {}): FieldMatch[] {
  const matches = fields.map((f) => mapField(f, options));
  const byId = new Map(fields.map((f) => [`${f.frameId}:${f.id}`, f]));
  const fieldOf = (m: FieldMatch) => byId.get(`${m.frameId}:${m.fieldId}`)!;
  const sameForm = (a: DetectedField, b: DetectedField) => a.frameId === b.frameId && a.formIndex === b.formIndex;

  for (const match of matches) {
    if (match.source === 'user') continue;
    const field = fieldOf(match);

    if (match.key === 'address.full' && field.kind !== 'textarea') {
      const hasLine2 = matches.some((m) => m.key === 'address.line2' && sameForm(fieldOf(m), field));
      if (hasLine2) match.key = 'address.line1';
    }

    if (match.key === 'contact.phone' && ((field.maxLength !== null && field.maxLength <= 5) || field.kind === 'select')) {
      const next = matches.find((m) => {
        const other = fieldOf(m);
        return m !== match && m.key === 'contact.phone' && sameForm(other, field) && other.order > field.order && other.order - field.order <= 2;
      });
      if (next) {
        match.key = 'contact.phoneCountryCode';
        match.confidence = Math.min(match.confidence, 0.85);
      }
    }
  }
  return matches;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
