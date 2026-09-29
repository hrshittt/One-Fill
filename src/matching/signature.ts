import type { DetectedField } from '../types/fields';
import { normalizeText } from './text-normalizer';

/**
 * A stable, value-free fingerprint of a form field, used to remember per-site mapping
 * corrections. Built only from structural attributes and the label.
 */
export function fieldSignature(field: Pick<DetectedField, 'tag' | 'kind' | 'name' | 'htmlId' | 'label' | 'ariaLabel' | 'placeholder'>): string {
  const label = normalizeText(field.label || field.ariaLabel || field.placeholder).text;
  return fnv1a([field.tag, field.kind, field.name, field.htmlId, label].join('|'));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
