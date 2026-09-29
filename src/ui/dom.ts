/**
 * Tiny DOM builder. All text goes through `textContent` — never innerHTML — so page titles,
 * imported files and profile values can't inject markup into extension pages.
 */

export type Child = Node | string | number | null | undefined | false | Child[];

type EventMap = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export interface Props {
  class?: string | Array<string | false | null | undefined>;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: EventMap;
  [prop: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    switch (key) {
      case 'class':
        el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
        break;
      case 'style':
        if (typeof value === 'string') el.setAttribute('style', value);
        else Object.assign(el.style, value);
        break;
      case 'dataset':
        Object.assign(el.dataset, value);
        break;
      case 'attrs':
        for (const [name, v] of Object.entries(value as Record<string, unknown>)) {
          if (v === false || v === null || v === undefined) continue;
          el.setAttribute(name, v === true ? '' : String(v));
        }
        break;
      case 'on':
        for (const [event, handler] of Object.entries(value as Record<string, EventListener>)) el.addEventListener(event, handler);
        break;
      default:
        (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function render(root: Element, ...children: Child[]): void {
  clear(root);
  append(root, children);
}

/** Deterministic pleasant colour for an avatar derived from a string (e.g. a domain). */
export function colorFor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 52%)`;
}

export function formatDate(timestamp: number, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(timestamp));
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.round((timestamp - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(timestamp);
}
