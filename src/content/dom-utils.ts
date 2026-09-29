/**
 * DOM helpers for understanding form controls the way a person reads them:
 * explicit labels, wrapping labels, ARIA relationships, text placed next to the control,
 * and the section heading the control sits under.
 */

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const SKIP_TEXT_IN = new Set(['SELECT', 'OPTION', 'OPTGROUP', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE', 'BUTTON', 'svg']);
const CONTROL_SELECTOR = 'input:not([type=hidden]), select, textarea';
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, legend, [role="heading"], caption';
const HEADING_CLASS_RE = /(^|[-_\s])(title|header|heading|legend|subtitle|section-?name|section-?label|group-?label)($|[-_\s])/i;

export function collapse(text: string | null | undefined, max = 120): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Visible-ish text of an element, skipping option lists, scripts and nested controls
 * so a <label> wrapping a <select> doesn't return every country name.
 */
export function textOf(root: Element | null, max = 120, exclude?: Element): string {
  if (!root) return '';
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentElement; p && p !== root.parentElement; p = p.parentElement) {
        if (SKIP_TEXT_IN.has(p.tagName) || p === exclude || p.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
        if (p === root) break;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let out = '';
  for (let node = walker.nextNode(); node && out.length < max * 2; node = walker.nextNode()) out += ` ${node.nodeValue ?? ''}`;
  return collapse(out, max);
}

function byIds(el: Element, attr: string): string {
  const ids = el.getAttribute(attr)?.split(/\s+/).filter(Boolean) ?? [];
  const root = el.getRootNode() as Document | ShadowRoot;
  return collapse(
    ids
      .map((id) => (root.getElementById ? root.getElementById(id) : el.ownerDocument.getElementById(id)))
      .map((node) => textOf(node, 80))
      .join(' '),
  );
}

/** Explicit label: <label for>, wrapping <label>, or aria-labelledby. */
export function getLabelText(el: FormControl): string {
  const parts: string[] = [];
  const labels = 'labels' in el && el.labels ? Array.from(el.labels) : [];
  if (labels.length === 0 && el.id) {
    // Controls inside shadow roots don't get `.labels`; resolve <label for> within the same root.
    const root = el.getRootNode() as Document | ShadowRoot;
    // Inside a quoted attribute selector only `"` and `\` need escaping.
    const label = root.querySelector?.(`label[for="${el.id.replace(/["\\]/g, '\\$&')}"]`);
    if (label) labels.push(label as HTMLLabelElement);
  }
  for (const label of labels) parts.push(textOf(label, 100, el));
  const labelledBy = byIds(el, 'aria-labelledby');
  if (labelledBy) parts.push(labelledBy);
  return collapse([...new Set(parts.filter(Boolean))].join(' '), 140);
}

export function getDescription(el: Element): string {
  return byIds(el, 'aria-describedby');
}

function containsControl(el: Element): boolean {
  return el.matches(CONTROL_SELECTOR) || el.querySelector(CONTROL_SELECTOR) !== null;
}

/**
 * In two-column table forms (<td>Father's Name</td><td><input></td>) the previous cell *is*
 * the label, so it's returned as one — but only when the control has its cell to itself.
 */
export function getTableRowLabel(el: Element): string {
  const cell = el.closest('td, th');
  if (!cell || cell.querySelectorAll(CONTROL_SELECTOR).length !== 1) return '';
  let prev = cell.previousElementSibling;
  while (prev && !textOf(prev, 80)) prev = prev.previousElementSibling;
  return prev && !containsControl(prev) ? textOf(prev, 100) : '';
}

/**
 * Text placed right before the control in the layout — "Name: [input]", table rows
 * (<td>Name</td><td><input></td>), sibling spans/divs. Siblings that contain other controls
 * are skipped so the previous field's label is never borrowed.
 */
export function getNearbyText(el: Element): string {
  // Direct text nodes immediately before the control ("Name: <input>").
  let prevNode = el.previousSibling;
  while (prevNode && prevNode.nodeType === Node.TEXT_NODE && !prevNode.nodeValue?.trim()) prevNode = prevNode.previousSibling;
  if (prevNode?.nodeType === Node.TEXT_NODE) return collapse(prevNode.nodeValue, 80);

  // Table layouts: text of the previous cell in the same row.
  const cell = el.closest('td, th');
  if (cell) {
    let prevCell = cell.previousElementSibling;
    while (prevCell && !textOf(prevCell, 80)) prevCell = prevCell.previousElementSibling;
    if (prevCell && !containsControl(prevCell)) return textOf(prevCell, 80);
  }

  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++) {
    let sibling = node.previousElementSibling;
    for (let i = 0; sibling && i < 3; i++, sibling = sibling.previousElementSibling) {
      if (containsControl(sibling)) break;
      const text = textOf(sibling, 80);
      if (text) return text;
    }
    const parent: Element | null = node.parentElement;
    if (!parent || parent.matches('form, fieldset, body, [role="form"]')) break;
    // Stop climbing once the container holds other controls: anything further up belongs to them.
    if (parent.querySelectorAll(CONTROL_SELECTOR).length > 1) break;
    node = parent;
  }
  return '';
}

function isHeadingLike(el: Element): boolean {
  if (el.matches(HEADING_SELECTOR)) return true;
  const cls = typeof el.className === 'string' ? el.className : '';
  return HEADING_CLASS_RE.test(cls) && !containsControl(el) && textOf(el, 90).length > 0 && textOf(el, 200).length < 90;
}

function lastHeadingWithin(el: Element): Element | null {
  if (isHeadingLike(el)) return el;
  const headings = el.querySelectorAll(HEADING_SELECTOR);
  return headings.length ? headings[headings.length - 1]! : null;
}

/** Nearest section heading or group label above the control, used as context. */
export function getSectionText(el: Element, ownLabel = ''): string {
  // ARIA groups first: role=group/radiogroup/region with an accessible name.
  const group = el.parentElement?.closest('[role="group"], [role="radiogroup"], [role="region"], section[aria-label], section[aria-labelledby]');
  if (group) {
    const name = group.getAttribute('aria-label') || byIds(group, 'aria-labelledby');
    if (name && name !== ownLabel) return collapse(name, 90);
  }
  const fieldset = el.closest('fieldset');
  const legend = fieldset?.querySelector(':scope > legend');
  if (legend) {
    const text = textOf(legend, 90);
    if (text && text !== ownLabel) return text;
  }

  let node: Element | null = el;
  for (let depth = 0; node && depth < 10; depth++) {
    let sibling = node.previousElementSibling;
    for (let i = 0; sibling && i < 20; i++, sibling = sibling.previousElementSibling) {
      const heading = lastHeadingWithin(sibling);
      if (heading) {
        const text = textOf(heading, 90);
        if (text && text !== ownLabel) return text;
      }
    }
    node = node.parentElement;
    if (!node || node.tagName === 'BODY') break;
  }
  return '';
}

/** Attributes frameworks and test suites use to name fields. */
const HINT_ATTRIBUTES = [
  'formcontrolname',
  'ng-reflect-name',
  'data-automation-id',
  'data-testid',
  'data-test',
  'data-qa',
  'data-field',
  'data-field-name',
  'data-name',
  'data-label',
  'data-placeholder',
  'wire:model',
  'x-model',
];

export function getAttributeHints(el: Element): string {
  return HINT_ATTRIBUTES.map((a) => el.getAttribute(a))
    .filter((v): v is string => !!v && v.length < 80)
    .join('|');
}

// ── Visibility ─────────────────────────────────────────────────────────────────

let layoutAvailable: boolean | null = null;

/** jsdom and other layout-less environments report zero-size rects for everything. */
function hasLayout(doc: Document): boolean {
  layoutAvailable ??= doc.documentElement.getBoundingClientRect().width > 0;
  return layoutAvailable;
}

/** Test hook. */
export function setLayoutAvailable(value: boolean | null): void {
  layoutAvailable = value;
}

export function isVisible(el: HTMLElement): boolean {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (!view) return false;
  if (el.closest('[hidden], [inert]')) return false;

  const style = view.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;

  const isToggle = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');

  if (hasLayout(doc)) {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) {
      return isToggle ? labelVisible(el as HTMLInputElement) : false;
    }
    const rect = el.getBoundingClientRect();
    const tiny = rect.width < 2 || rect.height < 2;
    // Honeypots: fields pushed far off-screen or shrunk to nothing to trap bots.
    const offscreen = rect.right + view.scrollX < 0 || rect.bottom + view.scrollY < 0 || rect.left > 20000;
    if ((tiny || offscreen) && !isToggle) return false;
    if ((tiny || offscreen) && isToggle) return labelVisible(el as HTMLInputElement);
    if (Number(style.opacity) === 0 && !isToggle) return false;
    return true;
  }

  // No layout engine: walk ancestors for display:none.
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') return isToggle ? labelVisible(el as HTMLInputElement) : false;
  }
  return true;
}

function labelVisible(el: HTMLInputElement): boolean {
  const label = el.labels?.[0];
  if (!label) return false;
  const view = el.ownerDocument.defaultView!;
  if (hasLayout(el.ownerDocument)) {
    return typeof label.checkVisibility === 'function' ? label.checkVisibility({ visibilityProperty: true }) : label.getClientRects().length > 0;
  }
  for (let node: Element | null = label; node; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

/** Every open shadow root in the document (recursively). Closed roots are, by design, inaccessible. */
export function collectShadowRoots(root: Document | ShadowRoot): ShadowRoot[] {
  const out: ShadowRoot[] = [];
  const visit = (scope: Document | ShadowRoot) => {
    for (const el of Array.from(scope.querySelectorAll('*'))) {
      if (el.shadowRoot) {
        out.push(el.shadowRoot);
        visit(el.shadowRoot);
      }
    }
  };
  visit(root);
  return out;
}
