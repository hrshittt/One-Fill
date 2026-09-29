import { selectInstructions, type FieldAssessment, type FillDecisions } from '../core/fill-plan';
import { getDocument } from '../storage/document-storage';
import type { FillInstruction, FrameFillReport, FrameScan } from '../types/fields';
import type { FillOptions } from '../types/messages';
import type { Settings } from '../types/settings';

/**
 * Operations on a tab, used by the popup and the background service worker.
 *
 * Everything goes through `chrome.scripting.executeScript`, which works with the `activeTab`
 * grant the user gives by clicking the toolbar icon (or pressing the shortcut) — no broad host
 * permissions needed. `allFrames` reaches same-origin iframes; cross-origin frames are reached
 * only if the user granted optional site access.
 */

export async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
  } catch {
    // Some frames may be off-limits; fall back to the top frame alone.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
}

export async function scanTab(tabId: number): Promise<FrameScan[]> {
  let results: chrome.scripting.InjectionResult<FrameScan | null>[];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => globalThis.__oneFill?.scan() ?? null,
    });
  } catch {
    results = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__oneFill?.scan() ?? null });
  }
  return results
    .filter((r): r is chrome.scripting.InjectionResult<FrameScan> => !!r.result)
    .map((r) => ({
      ...r.result!,
      frameId: r.frameId,
      isTop: r.frameId === 0,
      fields: r.result!.fields.map((f) => ({ ...f, frameId: r.frameId })),
    }));
}

/** Resume uploads are carried as metadata in the plan; load the file bytes right before filling. */
async function hydrateFiles(instructions: FillInstruction[], assessments: FieldAssessment[]): Promise<FillInstruction[]> {
  const out: FillInstruction[] = [];
  for (const instruction of instructions) {
    if (instruction.action !== 'file') {
      out.push(instruction);
      continue;
    }
    const assessment = assessments.find((a) => a.field.id === instruction.fieldId && a.instruction === instruction);
    const doc = assessment?.documentId ? await getDocument(assessment.documentId) : null;
    if (doc) out.push({ ...instruction, file: doc });
  }
  return out;
}

export interface TabFillResult {
  filled: number;
  attempted: number;
  failedUids: string[];
  filledUids: string[];
}

export async function fillTab(
  tabId: number,
  assessments: FieldAssessment[],
  decisions: FillDecisions,
  settings: Pick<Settings, 'sensitivePolicy' | 'overwriteExisting' | 'highlightFilled'>,
  extra: Partial<FillOptions> = {},
): Promise<TabFillResult> {
  const byFrame = selectInstructions(assessments, decisions, settings.sensitivePolicy);
  const result: TabFillResult = { filled: 0, attempted: 0, failedUids: [], filledUids: [] };
  const options: FillOptions = {
    overwrite: settings.overwriteExisting || decisions.overwrite.size > 0,
    highlight: settings.highlightFilled,
    ...extra,
  };

  for (const [frameId, items] of byFrame) {
    const instructions = await hydrateFiles(
      items.map((i) => i.instruction),
      items.map((i) => i.assessment),
    );
    result.attempted += items.length;
    let report: FrameFillReport | null = null;
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: (list: FillInstruction[], opts: FillOptions) => globalThis.__oneFill?.fill(list, opts) ?? null,
        args: [instructions, options],
      });
      report = (injection?.result as FrameFillReport | null | undefined) ?? null;
    } catch {
      report = null;
    }
    const okIds = new Set(report?.outcomes.filter((o) => o.ok).map((o) => o.fieldId) ?? []);
    result.filled += report?.filled ?? 0;
    for (const { assessment } of items) {
      (okIds.has(assessment.field.id) ? result.filledUids : result.failedUids).push(assessment.uid);
    }
  }
  return result;
}

export async function undoTab(tabId: number): Promise<number> {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => globalThis.__oneFill?.undo() ?? 0,
  });
  return results.reduce((sum, r) => sum + (typeof r.result === 'number' ? r.result : 0), 0);
}
