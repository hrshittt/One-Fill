/**
 * A form-fill history entry. Intentionally metadata-only: no field names, no values,
 * no full URLs (paths/query strings can contain personal data).
 */
export interface HistoryEntry {
  id: string;
  domain: string;
  pageTitle: string;
  timestamp: number;
  fieldsFilled: number;
  profileId: string;
  /** How the fill was triggered. */
  trigger: 'popup' | 'auto' | 'shortcut';
}

/** Per-site mapping corrections: field signature → profile key, or SKIP_FIELD to leave it empty. */
export type SiteOverrides = Record<string, string>;
export type OverridesStore = Record<string, SiteOverrides>;

export const SKIP_FIELD = '__skip__';
