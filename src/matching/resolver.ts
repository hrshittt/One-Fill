import type { DetectedField, FieldKey, FieldMatch } from '../types/fields';
import { CONFIDENCE } from './field-mapper';
import { FIELD_DEFINITIONS, type ProfileSection } from './field-catalog';

/**
 * Pluggable fallback resolvers for fields the heuristic mapper could not map confidently.
 *
 * This is the extension point for an AI-powered matcher. The contract is privacy-preserving by
 * design: a resolver receives field *descriptors* (labels, attributes, section text) and the
 * catalog of possible keys — never profile values — and answers with suggested keys.
 * Suggestions are capped below the READY threshold, so they always go through user review.
 */

export interface ResolverRequest {
  field: DetectedField;
  match: FieldMatch;
}

export interface ResolverSuggestion {
  frameId: number;
  fieldId: string;
  key: FieldKey | null;
  confidence: number;
}

export interface CatalogEntry {
  key: FieldKey;
  label: string;
  section: ProfileSection;
}

export interface FieldResolver {
  readonly id: string;
  resolve(requests: ResolverRequest[], catalog: readonly CatalogEntry[]): Promise<ResolverSuggestion[]>;
}

const registry: FieldResolver[] = [];

export function registerResolver(resolver: FieldResolver): () => void {
  registry.push(resolver);
  return () => {
    const i = registry.indexOf(resolver);
    if (i >= 0) registry.splice(i, 1);
  };
}

/** Highest confidence a resolver suggestion can reach — keeps AI suggestions in "needs review". */
export const RESOLVER_CONFIDENCE_CAP = CONFIDENCE.READY - 0.01;

export async function applyResolvers(
  fields: readonly DetectedField[],
  matches: FieldMatch[],
  resolvers: readonly FieldResolver[] = registry,
): Promise<FieldMatch[]> {
  if (resolvers.length === 0) return matches;
  const fieldByKey = new Map(fields.map((f) => [`${f.frameId}:${f.id}`, f]));
  const pending = matches.filter((m) => !m.blocked && m.source !== 'user' && m.confidence < CONFIDENCE.READY);
  if (pending.length === 0) return matches;

  const catalog: CatalogEntry[] = FIELD_DEFINITIONS.map(({ key, label, section }) => ({ key, label, section }));
  const requests = pending.map((match) => ({ match, field: fieldByKey.get(`${match.frameId}:${match.fieldId}`)! }));

  for (const resolver of resolvers) {
    let suggestions: ResolverSuggestion[] = [];
    try {
      suggestions = await resolver.resolve(requests, catalog);
    } catch {
      continue; // A failing resolver never breaks filling.
    }
    for (const s of suggestions) {
      const match = matches.find((m) => m.frameId === s.frameId && m.fieldId === s.fieldId);
      if (!match || !s.key || match.source === 'user') continue;
      const confidence = Math.min(RESOLVER_CONFIDENCE_CAP, s.confidence);
      if (confidence <= match.confidence) continue;
      match.key = s.key;
      match.confidence = confidence;
      match.source = 'resolver';
      match.candidates = [{ key: s.key, confidence, source: 'resolver' }, ...match.candidates.filter((c) => c.key !== s.key)];
    }
  }
  return matches;
}
