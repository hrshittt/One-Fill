import type { FilePayload, FillInstruction, FillOutcome, FrameFillReport } from '../types/fields';
import type { FillOptions } from '../types/messages';
import type { ElementRegistry } from './element-registry';

/**
 * Reliable value setting for framework-controlled inputs.
 *
 * Why not `el.value = x`? React (and libraries built on it) install an instance-level `value`
 * property and a "value tracker" on every input. Assigning `el.value` updates the tracker too,
 * so React concludes nothing changed and its state never updates. Calling the *prototype* setter
 * bypasses the instance override, and the following bubbling `input` event makes React, Vue
 * (v-model listens to `input`) and Angular (DefaultValueAccessor listens to `input`) pick up the
 * new value. `change` serves v-model.lazy / jQuery / native listeners and `blur`/`focusout`
 * mark the control as touched for validation libraries.
 */

type TextControl = HTMLInputElement | HTMLTextAreaElement;

interface UndoEntry {
  restore: () => void;
}

export class FormFiller {
  private undoStack: UndoEntry[][] = [];

  constructor(
    private readonly registry: ElementRegistry,
    private readonly relocate: (id: string) => Element | null = () => null,
  ) {}

  async fill(instructions: readonly FillInstruction[], options: FillOptions): Promise<FrameFillReport> {
    const outcomes: FillOutcome[] = [];
    const undo: UndoEntry[] = [];
    let filled = 0;

    for (const instruction of instructions) {
      let outcome: FillOutcome;
      try {
        outcome = await this.apply(instruction, undo, options);
      } catch {
        outcome = { fieldId: instruction.fieldId, ok: false, reason: 'error' };
      }
      outcomes.push(outcome);
      if (outcome.ok) filled++;
      // Yield so frameworks can re-render (e.g. a country change that reveals a state field).
      await nextTick();
    }
    if (undo.length) this.undoStack.push(undo);
    return { filled, outcomes };
  }

  /** Restores the values from the most recent fill. Returns the number of fields restored. */
  undo(): number {
    const last = this.undoStack.pop();
    if (!last) return 0;
    for (const entry of [...last].reverse()) {
      try {
        entry.restore();
      } catch {
        /* element may be gone */
      }
    }
    return last.length;
  }

  private element(id: string): Element | null {
    return this.registry.get(id) ?? this.relocate(id);
  }

  private async apply(instruction: FillInstruction, undo: UndoEntry[], options: FillOptions): Promise<FillOutcome> {
    const fieldId = instruction.fieldId;
    const el = this.element(fieldId);
    if (!el) return { fieldId, ok: false, reason: 'not-found' };
    if ((el as HTMLInputElement).disabled) return { fieldId, ok: false, reason: 'disabled' };
    if ((el as HTMLInputElement).readOnly) return { fieldId, ok: false, reason: 'readonly' };

    let ok = false;
    let highlightTarget: Element = el;

    switch (instruction.action) {
      case 'text': {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { fieldId, ok: false, reason: 'unsupported' };
        if (!options.overwrite && el.value.trim() !== '') return { fieldId, ok: false, reason: 'rejected' };
        const previous = el.value;
        ok = setTextValue(el, instruction.value);
        if (ok) undo.push({ restore: () => setTextValue(el, previous) });
        break;
      }
      case 'select': {
        if (!(el instanceof HTMLSelectElement)) return { fieldId, ok: false, reason: 'unsupported' };
        const previous = el.selectedIndex;
        ok = setSelectIndex(el, instruction.optionIndex);
        if (ok) undo.push({ restore: () => setSelectIndex(el, previous) });
        break;
      }
      case 'radio': {
        const radio = this.element(instruction.optionId);
        if (!(radio instanceof HTMLInputElement)) return { fieldId, ok: false, reason: 'not-found' };
        const previouslyChecked = radioGroupOf(radio).find((r) => r.checked) ?? null;
        ok = setChecked(radio, true);
        highlightTarget = radio.labels?.[0] ?? radio;
        if (ok) {
          undo.push({
            restore: () => (previouslyChecked ? setChecked(previouslyChecked, true) : setCheckedSilently(radio, false)),
          });
        }
        break;
      }
      case 'checkbox': {
        if (!(el instanceof HTMLInputElement)) return { fieldId, ok: false, reason: 'unsupported' };
        const previous = el.checked;
        ok = setChecked(el, instruction.checked);
        if (ok) undo.push({ restore: () => setChecked(el, previous) });
        break;
      }
      case 'checkbox-group': {
        let changed = 0;
        for (const id of instruction.checkIds) {
          const box = this.element(id);
          if (!(box instanceof HTMLInputElement) || box.disabled) continue;
          const previous = box.checked;
          if (setChecked(box, true)) {
            changed++;
            undo.push({ restore: () => setChecked(box, previous) });
            highlight(box.labels?.[0] ?? box, options.highlight);
          }
        }
        ok = changed > 0;
        highlightTarget = el;
        break;
      }
      case 'file': {
        if (!(el instanceof HTMLInputElement) || el.type !== 'file') return { fieldId, ok: false, reason: 'unsupported' };
        ok = attachFile(el, instruction.file);
        if (ok) undo.push({ restore: () => clearFiles(el) });
        break;
      }
    }

    if (ok) highlight(highlightTarget, options.highlight);
    return ok ? { fieldId, ok: true } : { fieldId, ok: false, reason: 'rejected' };
  }
}

// ── Primitive setters ──────────────────────────────────────────────────────────

function nativeSetter(el: Element, prop: 'value' | 'checked' | 'selectedIndex'): ((v: unknown) => void) | undefined {
  // Use the element's own realm (iframes have their own prototypes).
  const view = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const proto =
    el instanceof (view?.HTMLTextAreaElement ?? HTMLTextAreaElement)
      ? (view?.HTMLTextAreaElement ?? HTMLTextAreaElement).prototype
      : el instanceof (view?.HTMLSelectElement ?? HTMLSelectElement)
        ? (view?.HTMLSelectElement ?? HTMLSelectElement).prototype
        : (view?.HTMLInputElement ?? HTMLInputElement).prototype;
  return Object.getOwnPropertyDescriptor(proto, prop)?.set as ((v: unknown) => void) | undefined;
}

function dispatchFocus(el: Element): void {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

function dispatchBlur(el: Element): void {
  el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function dispatchInputAndChange(el: Element, data: string | null = null): void {
  const view = el.ownerDocument.defaultView;
  const InputEventCtor = view?.InputEvent ?? InputEvent;
  el.dispatchEvent(new InputEventCtor('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** A masked input may reformat "9876543210" as "98765 43210"; that still counts as accepted. */
function accepted(el: TextControl, value: string): boolean {
  if (el.value === value) return true;
  if (!el.value) return false;
  const a = digitsOnly(el.value);
  return a.length > 0 && a === digitsOnly(value);
}

export function setTextValue(el: TextControl, value: string): boolean {
  dispatchFocus(el);
  const setter = nativeSetter(el, 'value');
  if (setter) setter.call(el, value);
  else el.value = value;
  dispatchInputAndChange(el, value);
  dispatchBlur(el);
  if (value === '' || accepted(el, value)) return true;

  // Some masked inputs and rich widgets reject programmatic values but accept "typing".
  // execCommand('insertText') goes through the browser's editing pipeline like a paste.
  try {
    el.focus({ preventScroll: true });
    el.select();
    const doc = el.ownerDocument;
    if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, value)) {
      dispatchBlur(el);
      return accepted(el, value);
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function setSelectIndex(el: HTMLSelectElement, index: number): boolean {
  if (index < 0 || index >= el.options.length) return false;
  dispatchFocus(el);
  const setter = nativeSetter(el, 'selectedIndex');
  if (setter) setter.call(el, index);
  else el.selectedIndex = index;
  dispatchInputAndChange(el);
  dispatchBlur(el);
  return el.selectedIndex === index;
}

export function setChecked(el: HTMLInputElement, checked: boolean): boolean {
  if (el.checked === checked) return true;
  // A real click toggles the control and fires click → input → change, which is what React
  // listens to for checkboxes and radios.
  el.click();
  if (el.checked !== checked) setCheckedSilently(el, checked);
  return el.checked === checked;
}

function setCheckedSilently(el: HTMLInputElement, checked: boolean): void {
  const setter = nativeSetter(el, 'checked');
  if (setter) setter.call(el, checked);
  else el.checked = checked;
  dispatchInputAndChange(el);
}

function radioGroupOf(radio: HTMLInputElement): HTMLInputElement[] {
  if (!radio.name) return [radio];
  const scope = radio.form ?? (radio.getRootNode() as Document | ShadowRoot);
  return Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((r) => r.name === radio.name);
}

export function attachFile(el: HTMLInputElement, payload: FilePayload): boolean {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(payload.dataUrl);
  if (!match) return false;
  const [, mime = 'application/octet-stream', isBase64, data = ''] = match;
  let bytes: Uint8Array;
  if (isBase64) {
    const binary = atob(data);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  const view = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const FileCtor = view?.File ?? File;
  const DataTransferCtor = view?.DataTransfer ?? (typeof DataTransfer !== 'undefined' ? DataTransfer : undefined);
  if (!DataTransferCtor) return false;
  const file = new FileCtor([bytes as BlobPart], payload.name || 'resume', { type: payload.type || mime });
  const transfer = new DataTransferCtor();
  transfer.items.add(file);
  el.files = transfer.files;
  dispatchInputAndChange(el);
  return (el.files?.length ?? 0) > 0;
}

function clearFiles(el: HTMLInputElement): void {
  const view = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const DataTransferCtor = view?.DataTransfer;
  if (DataTransferCtor) el.files = new DataTransferCtor().files;
  else el.value = '';
  dispatchInputAndChange(el);
}

function highlight(el: Element, enabled: boolean): void {
  if (!enabled || typeof (el as HTMLElement).animate !== 'function') return;
  // Web Animations leave no inline styles behind, so the page's own styling is untouched.
  (el as HTMLElement).animate(
    [
      { boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.9)', backgroundColor: 'rgba(99, 102, 241, 0.08)' },
      { boxShadow: '0 0 0 2px rgba(99, 102, 241, 0)', backgroundColor: 'transparent' },
    ],
    { duration: 1600, easing: 'ease-out' },
  );
}

/**
 * Yields one macrotask. MessageChannel isn't throttled in background tabs (unlike setTimeout)
 * and is what React's scheduler uses, so pending renders run before the next field is filled.
 */
function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
