import { mapFields } from '../matching/field-mapper';
import { applyResolvers } from '../matching/resolver';
import { getSiteOverrides } from '../storage/overrides-storage';
import type { DetectedField, FieldMatch, FrameScan } from '../types/fields';
import { injectContentScript, scanTab } from './tab-actions';

export interface PageAnalysis {
  frames: FrameScan[];
  fields: DetectedField[];
  matches: FieldMatch[];
  /** Hostname of the top frame — the key for remembered corrections and history. */
  hostname: string;
  title: string;
}

export async function analyzeTab(tabId: number): Promise<PageAnalysis> {
  await injectContentScript(tabId);
  const frames = await scanTab(tabId);
  const top = frames.find((f) => f.isTop) ?? frames[0];
  const hostname = (top?.hostname ?? '').replace(/^www\./, '');
  const fields = frames.flatMap((f) => f.fields);
  const overrides = await getSiteOverrides(hostname);
  const matches = await applyResolvers(fields, mapFields(fields, { overrides }));
  return { frames, fields, matches, hostname, title: top?.title ?? '' };
}
