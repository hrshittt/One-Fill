import type { DetectedField, FillInstruction, FrameFillReport, FrameScan } from './fields';

/** Configuration the background hands to content scripts running in "page-load" mode. */
export interface PageConfig {
  detect: boolean;
  autoFill: boolean;
  confirmBeforeAutoFill: boolean;
  highlight: boolean;
}

export type ContentToBackgroundMessage =
  | { type: 'onefill:get-page-config' }
  | { type: 'onefill:forms-detected'; matched: number; total: number }
  | { type: 'onefill:auto-fill-request'; fields: DetectedField[] }
  | { type: 'onefill:auto-fill-done'; filled: number; title: string; hostname: string };

export interface AutoFillResponse {
  instructions: FillInstruction[];
  /** Human-readable name of the active profile, for the in-page prompt. */
  profileName: string;
}

export interface FillOptions {
  overwrite: boolean;
  highlight: boolean;
  /** Show an in-page "Filled N fields · Undo" toast (used when filling without the popup). */
  announce?: boolean;
}

/**
 * API exposed by the content script on `globalThis.__oneFill` inside the extension's isolated world.
 * Extension pages call it through `chrome.scripting.executeScript({ func })`, which lets a single call
 * reach every frame and return per-frame results without extra permissions.
 */
export interface OneFillContentApi {
  version: number;
  scan(): FrameScan;
  fill(instructions: FillInstruction[], options: FillOptions): Promise<FrameFillReport>;
  undo(): number;
}

declare global {
  // eslint-disable-next-line no-var
  var __oneFill: OneFillContentApi | undefined;
  const __DEV__: boolean;
  /** True only in the end-to-end test build (dist-e2e); dead code is stripped from real builds. */
  const __E2E__: boolean;
}
