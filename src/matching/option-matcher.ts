import type { FieldOption } from '../types/fields';
import type { OptionSet } from './field-catalog';
import {
  CALLING_CODES,
  COUNTRIES,
  DEGREES,
  DEMONYMS,
  EDUCATION_LEVELS,
  EMPLOYMENT_STATUSES,
  GENDERS,
  INDIAN_STATES,
  MARITAL_STATUSES,
  MONTHS,
  SALUTATIONS,
  US_STATES,
  YES_NO,
  type AliasGroup,
} from './dictionaries';
import { jaroWinkler } from './fuzzy-matcher';
import { simplify } from './text-normalizer';

/**
 * Dropdown / radio intelligence.
 *
 * `matchOption` picks the option that corresponds to a profile value using normalised
 * alias sets (Male ↔ M ↔ Man, India ↔ IN ↔ Bharat, 03 ↔ March ↔ Mar), numeric ranges
 * ("2–3 years", "5+ years") and conservative containment. When two different options are
 * almost equally plausible it returns null instead of guessing.
 */

export interface OptionMatch {
  index: number;
  confidence: number;
}

export interface OptionMatchContext {
  /** The user's country, used to break ties between options sharing a calling code (+1). */
  country?: string;
}

const MIN_CONFIDENCE = 0.6;
const AMBIGUITY_GAP = 0.03;

const PLACEHOLDER_RE = /^(?:-+\s*)?(?:select|choose|please select|please choose|pick|none selected|--|—|select one|select an option)\b/;

export function isPlaceholderOption(option: FieldOption, index: number): boolean {
  const text = simplify(option.text);
  if (!text && !option.value) return true;
  if (PLACEHOLDER_RE.test(text) || /^[-–—\s.]*$/.test(option.text)) return true;
  return index === 0 && option.value === '' && text.length < 30 && !/\d/.test(text) && /select|choose|option|--/.test(text);
}

export function matchOption(
  value: string,
  options: readonly FieldOption[],
  set?: OptionSet,
  context: OptionMatchContext = {},
): OptionMatch | null {
  const target = simplify(value);
  if (!target) return null;

  const candidates = options
    .map((option, index) => ({ option, index }))
    .filter(({ option, index }) => !option.disabled && !isPlaceholderOption(option, index));
  if (candidates.length === 0) return null;

  if (set === 'callingCode' || /^\+\d{1,4}$/.test(value.trim())) {
    return matchCallingCode(value, candidates, context);
  }

  const aliases = aliasesFor(value, set);
  const numeric = parseNumber(value);
  const allowFuzzy = !set || set === 'country' || set === 'state' || set === 'nationality';

  const scored = candidates.map(({ option, index }) => {
    const texts = [simplify(option.text), simplify(option.value)].filter(Boolean);
    let best = 0;
    for (const text of texts) {
      best = Math.max(best, scoreText(text, target, aliases, allowFuzzy));
      if (numeric !== null && (set === 'numeric' || set === 'month' || !set)) {
        best = Math.max(best, scoreNumeric(numeric, option.text || option.value));
      }
    }
    return { index, text: texts[0] ?? '', score: best };
  });

  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top || top.score < MIN_CONFIDENCE) return null;
  if (second && second.score >= MIN_CONFIDENCE && top.score - second.score < AMBIGUITY_GAP && second.text !== top.text) {
    return null;
  }
  return { index: top.index, confidence: top.score };
}

function scoreText(text: string, target: string, aliases: ReadonlySet<string>, allowFuzzy: boolean): number {
  if (text === target) return 1;
  if (aliases.has(text)) return 0.97;
  let best = 0;
  for (const alias of aliases) {
    if (alias.length < 3) continue; // short codes ("m", "in") must match exactly
    // Option text contains the alias as whole words: "India (+91)" ⊇ "india".
    if (containsWords(text, alias)) best = Math.max(best, 0.7 + 0.25 * (alias.length / text.length));
    // Alias contains the option text: only when nearly the whole alias is covered, to avoid
    // matching "Manipal University" when the user studied at "Manipal University Jaipur".
    else if (text.length >= 4 && containsWords(alias, text) && text.length / alias.length >= 0.85) {
      best = Math.max(best, 0.8);
    }
  }
  // Typo tolerance only between strings of similar length: a long shared prefix must not make
  // "Manipal University" look like "Manipal University Jaipur".
  const lengthRatio = Math.min(text.length, target.length) / Math.max(text.length, target.length);
  if (best === 0 && allowFuzzy && text.length >= 5 && target.length >= 5 && lengthRatio >= 0.9) {
    const similarity = jaroWinkler(text, target);
    if (similarity >= 0.94) best = 0.65 + (similarity - 0.94);
  }
  return best;
}

function containsWords(haystack: string, needle: string): boolean {
  if (needle.length > haystack.length) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

// ── Aliases ────────────────────────────────────────────────────────────────────

function groupFor(groups: readonly AliasGroup[], target: string): AliasGroup | undefined {
  return groups.find((g) => g.some((alias) => simplify(alias) === target));
}

export function aliasesFor(value: string, set?: OptionSet): Set<string> {
  const target = simplify(value);
  const out = new Set<string>([target]);
  const add = (items: readonly string[] | undefined) => items?.forEach((i) => out.add(simplify(i)));

  switch (set) {
    case 'gender':
      add(groupFor(GENDERS, target));
      break;
    case 'marital':
      add(groupFor(MARITAL_STATUSES, target));
      break;
    case 'employment':
      add(groupFor(EMPLOYMENT_STATUSES, target));
      break;
    case 'month':
      add(groupFor(MONTHS, target));
      break;
    case 'degree':
      add(groupFor(DEGREES, target));
      break;
    case 'educationLevel': {
      const direct = EDUCATION_LEVELS[value];
      if (direct) add(direct);
      else add(Object.values(EDUCATION_LEVELS).find((list) => list.some((a) => simplify(a) === target)));
      break;
    }
    case 'state':
      add(groupFor(INDIAN_STATES, target) ?? groupFor(US_STATES, target));
      break;
    case 'country':
    case 'nationality': {
      const row = findCountry(target);
      if (row) {
        add(row);
        if (set === 'nationality') add(DEMONYMS[row[0]!]);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

export function findCountry(target: string): AliasGroup | undefined {
  const simple = simplify(target);
  const direct = groupFor(COUNTRIES, simple);
  if (direct) return direct;
  const byDemonym = Object.entries(DEMONYMS).find(([, list]) => list.some((d) => simplify(d) === simple));
  return byDemonym ? groupFor(COUNTRIES, simplify(byDemonym[0])) : undefined;
}

export function callingCodeFor(country: string): string | undefined {
  const row = findCountry(country);
  return row ? CALLING_CODES[row[0]!] : undefined;
}

// ── Numbers and ranges ─────────────────────────────────────────────────────────

function parseNumber(value: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(value);
  return m ? Number(m[1]) : null;
}

/**
 * Scores how well a numeric value fits an option such as "3", "2-3 years", "5+ years",
 * "Less than 1 year" or "Fresher". Ranges are treated as half-open so that 1 prefers
 * "1–2 years" over "0–1 years".
 */
export function scoreNumeric(value: number, optionText: string): number {
  const text = optionText.toLowerCase().replace(/,/g, '');
  // "Fresher" means exactly zero, so it beats the broader "0–1 years" bucket.
  if (/\bfresher\b|\bno experience\b|\bnone\b/.test(text)) return value === 0 ? 0.95 : 0;

  let m = /(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/.exec(text);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (value >= a && value < b) return 0.9;
    if (value === b) return 0.8;
    return 0;
  }
  m = /(?:more than|above|over|greater than|>)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\+|years?\s*(?:and|&)\s*(?:above|more|over)|or more)/.exec(text);
  if (m) {
    const a = Number(m[1] ?? m[2]);
    return value >= a ? 0.88 : 0;
  }
  m = /(?:less than|below|under|<)\s*(\d+(?:\.\d+)?)/.exec(text);
  if (m) return value < Number(m[1]) ? 0.88 : 0;

  m = /^\D*(\d+(?:\.\d+)?)\D*$/.exec(text);
  if (m && Number(m[1]) === value) return 0.96;
  return 0;
}

function matchCallingCode(
  value: string,
  candidates: Array<{ option: FieldOption; index: number }>,
  context: OptionMatchContext,
): OptionMatch | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const hits = candidates.filter(({ option }) => {
    const text = `${option.text} ${option.value}`;
    const codes = [...text.matchAll(/\+\s?(\d{1,4})\b/g)].map((m) => m[1]);
    if (codes.length === 0 && /^\s*\d{1,4}\s*$/.test(option.value || option.text)) codes.push((option.value || option.text).trim());
    return codes.includes(digits);
  });
  if (hits.length === 1) return { index: hits[0]!.index, confidence: 0.95 };
  if (hits.length > 1 && context.country) {
    const row = findCountry(context.country);
    const names = new Set((row ?? [context.country]).map(simplify));
    const byCountry = hits.filter(({ option }) => [...names].some((n) => n.length > 2 && containsWords(simplify(option.text), n)));
    if (byCountry.length === 1) return { index: byCountry[0]!.index, confidence: 0.9 };
  }
  return null;
}

// ── Option-set detection (used by the mapper as Level 5 context) ───────────────

export type OptionHint =
  | 'gender'
  | 'marital'
  | 'salutation'
  | 'country'
  | 'callingCode'
  | 'state'
  | 'month'
  | 'day'
  | 'year'
  | 'degree'
  | 'educationLevel'
  | 'employment'
  | 'experience'
  | 'yesno';

const setOf = (groups: readonly AliasGroup[]) => new Set(groups.flat().map(simplify));
const GENDER_WORDS = setOf(GENDERS);
const MARITAL_WORDS = setOf(MARITAL_STATUSES);
const COUNTRY_WORDS = setOf(COUNTRIES);
const STATE_WORDS = new Set([...INDIAN_STATES, ...US_STATES].map((g) => simplify(g[0]!)));
const MONTH_WORDS = new Set(MONTHS.flatMap((g) => [simplify(g[0]!), simplify(g[1]!)]));
const DEGREE_WORDS = setOf(DEGREES);
const EDU_LEVEL_WORDS = new Set(Object.values(EDUCATION_LEVELS).flat().map(simplify));
const EMPLOYMENT_WORDS = setOf(EMPLOYMENT_STATUSES);
const SALUTATION_WORDS = new Set(SALUTATIONS);
const YES_NO_WORDS = new Set(YES_NO);

export function analyzeOptions(options: readonly FieldOption[]): OptionHint | null {
  const texts = options
    .filter((o, i) => !isPlaceholderOption(o, i))
    .map((o) => simplify(o.text || o.value))
    .filter(Boolean);
  if (texts.length === 0) return null;
  const count = (words: ReadonlySet<string>) => texts.filter((t) => words.has(t)).length;
  const share = (n: number) => n / texts.length;

  if (texts.every((t) => YES_NO_WORDS.has(t))) return 'yesno';
  const genderHits = count(GENDER_WORDS);
  if (genderHits >= 2 && (texts.includes('male') || texts.includes('m')) && share(genderHits) >= 0.6) return 'gender';
  if (count(SALUTATION_WORDS) >= 2 && share(count(SALUTATION_WORDS)) >= 0.6) return 'salutation';
  if (count(MARITAL_WORDS) >= 2 && share(count(MARITAL_WORDS)) >= 0.6) return 'marital';
  if (texts.filter((t) => /\+\s?\d{1,4}\b/.test(t) || /^\+?\d{1,4}$/.test(t)).length >= 5 &&
      options.some((o) => /\+\d/.test(`${o.text} ${o.value}`))) return 'callingCode';
  const countryHits = count(COUNTRY_WORDS);
  if (countryHits >= 8 || (texts.length >= 5 && share(countryHits) >= 0.7)) return 'country';
  if (count(STATE_WORDS) >= 8) return 'state';
  if (count(MONTH_WORDS) >= 10) return 'month';
  const numbers = texts.filter((t) => /^\d+$/.test(t)).map(Number);
  if (numbers.length >= 5 && numbers.every((n) => n >= 1940 && n <= 2100)) return 'year';
  if (numbers.length >= 28 && numbers.every((n) => n >= 1 && n <= 31)) return 'day';
  if (texts.filter((t) => /\byears?\b/.test(t) && /\d/.test(t)).length >= 3 || texts.includes('fresher')) return 'experience';
  if (count(DEGREE_WORDS) >= 3) return 'degree';
  if (count(EDU_LEVEL_WORDS) >= 3) return 'educationLevel';
  if (count(EMPLOYMENT_WORDS) >= 2 && share(count(EMPLOYMENT_WORDS)) >= 0.5) return 'employment';
  return null;
}
