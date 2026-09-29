/**
 * Minimal in-page UI (toasts and the auto-fill prompt), rendered inside a *closed* shadow root
 * so page CSS can't restyle it and page scripts can't read it. It never displays profile values —
 * only counts and actions.
 */

const HOST_TAG = 'one-fill-ui';

const STYLES = `
:host { all: initial; }
.wrap {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  font: 500 13px/1.4 -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  color: #0f172a;
}
.card {
  display: flex; align-items: center; gap: 12px; min-width: 260px; max-width: 380px;
  padding: 12px 12px 12px 14px; border-radius: 14px;
  background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08);
  animation: enter 220ms cubic-bezier(.2,.8,.2,1);
}
.logo { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; }
.text { flex: 1; min-width: 0; }
.title { font-weight: 650; }
.sub { color: #64748b; font-weight: 450; font-size: 12px; }
.actions { display: flex; gap: 6px; }
button { font: inherit; cursor: pointer; border-radius: 9px; padding: 6px 11px; border: 1px solid transparent; }
.primary { background: #4f46e5; color: #fff; }
.primary:hover { background: #4338ca; }
.ghost { background: transparent; color: #475569; border-color: rgba(15, 23, 42, 0.12); }
.ghost:hover { background: rgba(15, 23, 42, 0.05); }
button:focus-visible { outline: 2px solid #818cf8; outline-offset: 2px; }
@keyframes enter { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
@media (prefers-color-scheme: dark) {
  .wrap { color: #e2e8f0; }
  .card { background: #1e1f2b; border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 12px 32px rgba(0,0,0,.5); }
  .sub { color: #94a3b8; }
  .ghost { color: #cbd5e1; border-color: rgba(255, 255, 255, 0.14); }
  .ghost:hover { background: rgba(255, 255, 255, 0.06); }
}
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }
`;

const LOGO_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

interface UiAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

interface CardOptions {
  title: string;
  subtitle?: string;
  actions?: UiAction[];
  /** Auto-dismiss after this many ms (0 = stay until an action is taken). */
  timeout?: number;
}

let current: { host: HTMLElement; timer?: number } | null = null;

export function dismissPageUi(): void {
  if (!current) return;
  window.clearTimeout(current.timer);
  current.host.remove();
  current = null;
}

export function showCard(options: CardOptions): void {
  dismissPageUi();
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const wrap = el('div', 'wrap');
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  const card = el('div', 'card');
  const logo = el('div', 'logo');
  logo.innerHTML = LOGO_SVG; // static markup, no page or profile data
  const text = el('div', 'text');
  text.append(el('div', 'title', options.title));
  if (options.subtitle) text.append(el('div', 'sub', options.subtitle));
  card.append(logo, text);

  if (options.actions?.length) {
    const actions = el('div', 'actions');
    for (const action of options.actions) {
      const button = el('button', action.primary ? 'primary' : 'ghost', action.label) as HTMLButtonElement;
      button.type = 'button';
      button.addEventListener('click', () => {
        dismissPageUi();
        action.onClick();
      });
      actions.append(button);
    }
    card.append(actions);
  }
  wrap.append(card);
  shadow.append(wrap);
  (document.body ?? document.documentElement).append(host);

  current = { host };
  if (options.timeout) current.timer = window.setTimeout(dismissPageUi, options.timeout);
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
