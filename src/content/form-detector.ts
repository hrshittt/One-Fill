import type { ControlKind, DetectedField, FieldOption } from '../types/fields';
import {
  collapse,
  collectShadowRoots,
  getAttributeHints,
  getDescription,
  getLabelText,
  getNearbyText,
  getSectionText,
  getTableRowLabel,
  isVisible,
  textOf,
  type FormControl,
} from './dom-utils';
import type { ElementRegistry } from './element-registry';

/**
 * Finds fillable controls in a document (including open shadow roots) and describes them.
 * Radio buttons sharing a name become one "radio-group" field; checkboxes sharing a name
 * become a "checkbox-group". Hidden, disabled, read-only, password and honeypot fields are skipped.
 *
 * Descriptors never include the current values typed into the page — only whether a value exists.
 */

const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color', 'time', 'week', 'datetime-local',
]);
const MAX_FIELDS = 500;
const MAX_OPTIONS = 1000;
const CONTROL_SELECTOR = 'input, select, textarea';

const INPUT_KINDS: Record<string, ControlKind> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  number: 'number',
  date: 'date',
  month: 'month',
  url: 'url',
  file: 'file',
};

export function detectFields(doc: Document, registry: ElementRegistry): DetectedField[] {
  const view = doc.defaultView;
  // Invisible frames (tracking pixels, hidden auth iframes) have nothing for the user to fill.
  if (view && view !== view.top && (view.innerWidth < 2 || view.innerHeight < 2)) return [];

  const roots: Array<Document | ShadowRoot> = [doc, ...collectShadowRoots(doc)];
  const controls = roots.flatMap((root) => Array.from(root.querySelectorAll<FormControl>(CONTROL_SELECTOR)));
  const forms = Array.from(doc.forms);
  const formIndexOf = (el: FormControl) => {
    const form = el.form ?? el.closest('form');
    return form ? forms.indexOf(form) : -1;
  };

  // Checkbox names used more than once in the same form form a group ("skills[]").
  const checkboxNameCounts = new Map<string, number>();
  for (const el of controls) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.name) {
      const key = `${formIndexOf(el)}|${el.name}`;
      checkboxNameCounts.set(key, (checkboxNameCounts.get(key) ?? 0) + 1);
    }
  }

  const fields: DetectedField[] = [];
  const groups = new Map<string, { field: DetectedField; members: HTMLInputElement[] }>();
  let order = 0;

  for (const el of controls) {
    if (fields.length >= MAX_FIELDS) break;
    if (!isCandidate(el)) continue;
    const formIndex = formIndexOf(el);

    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      const isRadio = el.type === 'radio';
      const groupName = el.name || groupContainerKey(el, registry);
      const grouped = isRadio || (el.name !== '' && (checkboxNameCounts.get(`${formIndex}|${el.name}`) ?? 0) > 1);
      if (grouped && groupName) {
        const key = `${isRadio ? 'r' : 'c'}|${formIndex}|${groupName}`;
        let group = groups.get(key);
        if (!group) {
          const field = describe(el, isRadio ? 'radio-group' : 'checkbox-group', registry, formIndex, order++);
          group = { field, members: [] };
          groups.set(key, group);
          fields.push(field);
        }
        group.members.push(el);
        group.field.options.push(toggleOption(el, registry));
        group.field.hasValue ||= el.checked;
        continue;
      }
      if (!isRadio) fields.push(describe(el, 'checkbox', registry, formIndex, order++));
      continue;
    }

    const kind = kindOf(el);
    fields.push(describe(el, kind, registry, formIndex, order++));
  }

  // Group labels are computed once all members are known.
  for (const { field, members } of groups.values()) {
    const groupLabel = toggleGroupLabel(members);
    if (groupLabel) field.label = groupLabel;
    else if (field.kind === 'radio-group') field.label = '';
    field.nearbyText = field.label ? '' : collapse(getNearbyText(commonAncestor(members) ?? members[0]!), 80);
    field.sectionText = getSectionText(commonAncestor(members) ?? members[0]!, field.label);
  }
  return fields;
}

function isCandidate(el: FormControl): boolean {
  if (el instanceof HTMLInputElement && EXCLUDED_INPUT_TYPES.has(el.type)) return false;
  if (el.disabled) return false;
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.readOnly) return false;
  const isToggle = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file');
  if (!isToggle && el.closest('[aria-hidden="true"]')) return false;
  return isVisible(el);
}

function kindOf(el: FormControl): ControlKind {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  return INPUT_KINDS[el.type] ?? 'text';
}

function describe(el: FormControl, kind: ControlKind, registry: ElementRegistry, formIndex: number, order: number): DetectedField {
  const isToggleGroup = kind === 'radio-group' || kind === 'checkbox-group';
  const label = isToggleGroup ? '' : getLabelText(el) || getTableRowLabel(el);
  const tag = el.tagName.toLowerCase() as DetectedField['tag'];
  const name = el.getAttribute('name') ?? '';
  const signature = `${tag}|${kind}|${name}|${el.id}|${label}`;
  const input = el instanceof HTMLInputElement ? el : null;
  const maxLength = el instanceof HTMLSelectElement ? -1 : el.maxLength;

  return {
    id: registry.idFor(el, signature),
    frameId: 0,
    kind,
    tag,
    inputType: input?.type ?? tag,
    name,
    htmlId: el.id,
    autocomplete: el.getAttribute('autocomplete') ?? '',
    placeholder: collapse(el.getAttribute('placeholder'), 100),
    ariaLabel: collapse(el.getAttribute('aria-label'), 100),
    title: collapse(el.getAttribute('title') || getDescription(el), 100),
    label,
    nearbyText: label || isToggleGroup ? '' : getNearbyText(el),
    sectionText: isToggleGroup ? '' : getSectionText(el, label),
    attrHints: getAttributeHints(el),
    maxLength: maxLength > 0 ? maxLength : null,
    pattern: input?.pattern ?? '',
    inputMode: el.getAttribute('inputmode') ?? '',
    required: el.required || el.getAttribute('aria-required') === 'true',
    multiple: (el instanceof HTMLSelectElement || input?.type === 'file') && (el as HTMLSelectElement | HTMLInputElement).multiple,
    accept: input?.accept ?? '',
    options: el instanceof HTMLSelectElement ? selectOptions(el) : [],
    hasValue: hasValue(el, kind),
    formIndex,
    order,
  };
}

function selectOptions(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options)
    .slice(0, MAX_OPTIONS)
    .map((o, i) => ({ id: String(i), text: collapse(o.label || o.text, 100), value: o.value.slice(0, 100), disabled: o.disabled }));
}

function hasValue(el: FormControl, kind: ControlKind): boolean {
  // Toggle groups start empty; each member's `checked` state is folded in as it is added.
  if (kind === 'radio-group' || kind === 'checkbox-group') return false;
  if (kind === 'checkbox') return (el as HTMLInputElement).checked;
  if (el instanceof HTMLSelectElement) {
    const selected = el.options[el.selectedIndex];
    if (!selected || el.selectedIndex <= 0) return false;
    return selected.value !== '' && !/^\s*(-+|select|choose|please)/i.test(selected.text);
  }
  if (kind === 'file') return ((el as HTMLInputElement).files?.length ?? 0) > 0;
  return el.value.trim().length > 0;
}

function toggleOption(el: HTMLInputElement, registry: ElementRegistry): FieldOption {
  let text = getLabelText(el) || el.getAttribute('aria-label') || '';
  if (!text) {
    // "<input type=radio> Male" — text right after the control.
    let next = el.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue?.trim()) next = next.nextSibling;
    text = next ? (next.nodeType === Node.TEXT_NODE ? collapse(next.nodeValue, 80) : textOf(next as Element, 80)) : '';
  }
  return { id: registry.idFor(el), text: collapse(text || el.value, 80), value: el.value.slice(0, 100), disabled: el.disabled };
}

function groupContainerKey(el: HTMLInputElement, registry: ElementRegistry): string {
  const container = el.closest('[role="radiogroup"], [role="group"], fieldset');
  return container ? `container:${registry.idFor(container)}` : '';
}

/** The question a radio/checkbox group asks ("Gender", "Skills"). */
function toggleGroupLabel(members: HTMLInputElement[]): string {
  const first = members[0]!;
  const ariaGroup = first.closest('[role="radiogroup"], [role="group"]');
  if (ariaGroup) {
    const name = ariaGroup.getAttribute('aria-label') || getLabelText(ariaGroup as unknown as FormControl);
    if (name) return collapse(name, 100);
  }
  const fieldset = first.closest('fieldset');
  if (fieldset && fieldset.querySelectorAll(CONTROL_SELECTOR).length <= members.length + 1) {
    const legend = fieldset.querySelector(':scope > legend');
    if (legend) return textOf(legend, 100);
  }
  const container = commonAncestor(members);
  // Only read a container's leading text when it holds nothing but this group.
  if (container && members.length > 1 && container.querySelectorAll(CONTROL_SELECTOR).length === members.length) {
    const leading = leadingText(container);
    if (leading) return leading;
  }
  // Otherwise use the text just before the first option ("<p>Skills</p><label><input>…").
  return collapse(getNearbyText(exclusiveWrapper(first)), 100);
}

/** The outermost ancestor of `el` that contains no other form control (usually its <label>). */
function exclusiveWrapper(el: Element): Element {
  let node = el;
  while (node.parentElement && node.parentElement.querySelectorAll(CONTROL_SELECTOR).length === 1 && !node.parentElement.matches('form, body')) {
    node = node.parentElement;
  }
  return node;
}

/** Text inside a group container that comes before the first option ("<div><p>Gender</p><label>…"). */
function leadingText(container: Element): string {
  let text = '';
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += ` ${child.nodeValue ?? ''}`;
      continue;
    }
    if (!(child instanceof Element)) continue;
    if (child.matches(CONTROL_SELECTOR) || child.querySelector(CONTROL_SELECTOR)) break;
    text += ` ${textOf(child, 100)}`;
  }
  return collapse(text, 100);
}

function commonAncestor(elements: Element[]): Element | null {
  if (elements.length === 0) return null;
  let ancestor: Element | null = elements[0]!.parentElement;
  while (ancestor && !elements.every((el) => ancestor!.contains(el))) ancestor = ancestor.parentElement;
  return ancestor;
}
