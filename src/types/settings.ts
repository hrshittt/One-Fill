export type ThemePreference = 'system' | 'light' | 'dark';

/** What to do with fields mapped to sensitive data (government IDs etc.). "Auto" is intentionally not an option. */
export type SensitivePolicy = 'ask' | 'never';

export interface Settings {
  /** Scan the current page automatically when the popup opens. */
  autoDetect: boolean;
  /**
   * Detect forms as pages load and show the matched-field count on the toolbar icon.
   * Requires the optional "all sites" host permission, requested when enabled.
   */
  pageLoadDetection: boolean;
  /** Uncertain (medium-confidence) matches require confirmation in Review before they are filled. */
  confirmUncertain: boolean;
  /**
   * Offer to fill high-confidence, non-sensitive fields as soon as a page loads.
   * With `confirmUncertain` on, a small in-page prompt asks first; otherwise fields are filled with an undo toast.
   */
  autoFillSafe: boolean;
  sensitivePolicy: SensitivePolicy;
  /** Replace values already typed into fields. Off by default — One-Fill never clobbers user input silently. */
  overwriteExisting: boolean;
  highlightFilled: boolean;
  saveHistory: boolean;
  /** Remember manual mapping corrections per website. */
  rememberCorrections: boolean;
  theme: ThemePreference;
  /** Hostnames where One-Fill should never run automatically. */
  disabledSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  autoDetect: true,
  pageLoadDetection: false,
  confirmUncertain: true,
  autoFillSafe: false,
  sensitivePolicy: 'ask',
  overwriteExisting: false,
  highlightFilled: true,
  saveHistory: true,
  rememberCorrections: true,
  theme: 'system',
  disabledSites: [],
};
