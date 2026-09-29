import { CONFIDENCE, mapFields } from '../matching/field-mapper';
import type { FillInstruction, FrameScan } from '../types/fields';
import type { AutoFillResponse, ContentToBackgroundMessage, FillOptions, OneFillContentApi, PageConfig } from '../types/messages';
import { ElementRegistry } from './element-registry';
import { detectFields } from './form-detector';
import { FormFiller } from './form-filler';
import { showCard } from './page-ui';

/**
 * Content script entry. Injected either on demand (popup / keyboard shortcut, via activeTab)
 * or on page load (only if the user enabled page-load detection and granted site access).
 *
 * It exposes a small API on `globalThis.__oneFill` inside the extension's isolated world.
 * The content script cannot read the profile: storage is restricted to trusted extension
 * contexts, and it only ever receives the specific values it is asked to fill.
 */

const API_VERSION = 1;

function install(): void {
  if (globalThis.__oneFill?.version === API_VERSION) return;

  const registry = new ElementRegistry();

  // If a framework re-rendered a field between scan and fill, find its replacement by signature.
  const relocate = (id: string): Element | null => {
    const signature = registry.signatureOf(id);
    if (!signature) return null;
    const replacement = detectFields(document, registry).find(
      (f) => f.id !== id && `${f.tag}|${f.kind}|${f.name}|${f.htmlId}|${f.label}` === signature,
    );
    return replacement ? registry.get(replacement.id) : null;
  };
  const filler = new FormFiller(registry, relocate);

  const announce = (filled: number, subtitle: string) => {
    if (filled === 0) return;
    showCard({
      title: `Filled ${filled} field${filled === 1 ? '' : 's'}`,
      subtitle,
      actions: [{ label: 'Undo', onClick: () => filler.undo() }],
      timeout: 8000,
    });
  };

  const api: OneFillContentApi = {
    version: API_VERSION,
    scan(): FrameScan {
      registry.prune();
      return {
        frameId: 0,
        url: location.origin,
        hostname: location.hostname,
        title: document.title.slice(0, 120),
        isTop: window === window.top,
        fields: detectFields(document, registry),
      };
    },
    async fill(instructions: FillInstruction[], options: FillOptions) {
      const report = await filler.fill(instructions, options);
      if (options.announce) announce(report.filled, 'High-confidence, non-sensitive fields');
      return report;
    },
    undo: () => filler.undo(),
  };
  globalThis.__oneFill = api;

  void startPageLoadMode(api, filler, announce);
}

function send<T>(message: ContentToBackgroundMessage): Promise<T | undefined> {
  return chrome.runtime.sendMessage(message).catch(() => undefined) as Promise<T | undefined>;
}

/** Page-load detection / safe auto-fill. No-ops unless the background says it's enabled. */
async function startPageLoadMode(api: OneFillContentApi, filler: FormFiller, announce: (n: number, s: string) => void): Promise<void> {
  const config = await send<PageConfig>({ type: 'onefill:get-page-config' });
  if (!config || (!config.detect && !config.autoFill)) return;

  const offered = new Set<string>();
  let runs = 0;
  let running = false;

  const run = async () => {
    if (running || runs >= 40) return;
    running = true;
    runs++;
    try {
      const scan = api.scan();
      if (config.detect) {
        const matched = mapFields(scan.fields).filter((m) => m.key && m.confidence >= CONFIDENCE.MIN_MATCH).length;
        await send({ type: 'onefill:forms-detected', matched, total: scan.fields.length });
      }
      if (!config.autoFill) return;

      const fresh = scan.fields.filter((f) => !offered.has(f.id) && !f.hasValue);
      if (fresh.length === 0) return;
      fresh.forEach((f) => offered.add(f.id));
      const response = await send<AutoFillResponse>({ type: 'onefill:auto-fill-request', fields: fresh });
      const instructions = response?.instructions ?? [];
      if (instructions.length === 0) return;

      const doFill = async () => {
        const report = await filler.fill(instructions, { overwrite: false, highlight: config.highlight });
        announce(report.filled, `From your ${response?.profileName ?? ''} profile`.trim());
        if (report.filled) {
          await send({ type: 'onefill:auto-fill-done', filled: report.filled, title: document.title.slice(0, 120), hostname: location.hostname });
        }
      };

      if (config.confirmBeforeAutoFill) {
        showCard({
          title: `Fill ${instructions.length} field${instructions.length === 1 ? '' : 's'} with One-Fill?`,
          subtitle: 'Only confident, non-sensitive matches',
          actions: [
            { label: 'Not now', onClick: () => undefined },
            { label: 'Fill', primary: true, onClick: () => void doFill() },
          ],
        });
      } else {
        await doFill();
      }
    } finally {
      running = false;
    }
  };

  await run();

  // Single-page apps and multi-step forms add fields after load.
  let timer: number | undefined;
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      Array.from(m.addedNodes).some((n) => n instanceof Element && (n.matches('input, select, textarea, form') || n.querySelector('input, select, textarea'))),
    );
    if (!relevant) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(), 900);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

install();
