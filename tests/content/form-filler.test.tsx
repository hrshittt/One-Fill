import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h as vh, nextTick, ref, vModelCheckbox, vModelRadio, vModelSelect, vModelText, withDirectives } from 'vue';
import { ElementRegistry } from '../../src/content/element-registry';
import { detectFields } from '../../src/content/form-detector';
import { FormFiller, setTextValue } from '../../src/content/form-filler';
import type { DetectedField, FillInstruction } from '../../src/types/fields';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let registry: ElementRegistry;
let filler: FormFiller;
const OPTIONS = { overwrite: false, highlight: false };

beforeEach(() => {
  registry = new ElementRegistry();
  filler = new FormFiller(registry);
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

function scan(): DetectedField[] {
  return detectFields(document, registry);
}

function idOf(fields: DetectedField[], name: string): string {
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`no field ${name}`);
  return field.id;
}

describe('plain DOM controls', () => {
  it('sets text values and fires focus → input → change → blur', async () => {
    document.body.innerHTML = '<input name="first">';
    const input = document.querySelector('input')!;
    const events: string[] = [];
    for (const type of ['focus', 'input', 'change', 'blur']) input.addEventListener(type, () => events.push(type));

    const report = await filler.fill([{ fieldId: idOf(scan(), 'first'), action: 'text', value: 'Harshit' }], OPTIONS);
    expect(report.filled).toBe(1);
    expect(input.value).toBe('Harshit');
    expect(events).toEqual(['focus', 'input', 'change', 'blur']);
  });

  it('input and change events bubble so delegated listeners see them', async () => {
    document.body.innerHTML = '<form><input name="city"></form>';
    const seen: string[] = [];
    document.querySelector('form')!.addEventListener('input', () => seen.push('input'));
    document.querySelector('form')!.addEventListener('change', () => seen.push('change'));
    await filler.fill([{ fieldId: idOf(scan(), 'city'), action: 'text', value: 'Jaipur' }], OPTIONS);
    expect(seen).toEqual(['input', 'change']);
  });

  it('selects an option by index', async () => {
    document.body.innerHTML = '<select name="country"><option value="">Select</option><option value="IN">India</option><option value="NP">Nepal</option></select>';
    const select = document.querySelector('select')!;
    const onChange = vi.fn();
    select.addEventListener('change', onChange);
    await filler.fill([{ fieldId: idOf(scan(), 'country'), action: 'select', optionIndex: 1 }], OPTIONS);
    expect(select.value).toBe('IN');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('checks the right radio button with a real click', async () => {
    document.body.innerHTML = `
      <label><input type="radio" name="gender" value="m"> Male</label>
      <label><input type="radio" name="gender" value="f"> Female</label>`;
    const [group] = scan();
    const female = group!.options[1]!;
    const onClick = vi.fn();
    document.querySelectorAll('input')[1]!.addEventListener('click', onClick);
    await filler.fill([{ fieldId: group!.id, action: 'radio', optionId: female.id }], OPTIONS);
    const radios = document.querySelectorAll('input');
    expect(radios[1]!.checked).toBe(true);
    expect(radios[0]!.checked).toBe(false);
    expect(onClick).toHaveBeenCalled();
  });

  it('ticks matching boxes in a checkbox group without unticking others', async () => {
    document.body.innerHTML = `
      <label><input type="checkbox" name="skills" value="js" checked> JavaScript</label>
      <label><input type="checkbox" name="skills" value="py"> Python</label>
      <label><input type="checkbox" name="skills" value="go"> Go</label>`;
    const [group] = scan();
    await filler.fill([{ fieldId: group!.id, action: 'checkbox-group', checkIds: [group!.options[1]!.id] }], OPTIONS);
    const boxes = document.querySelectorAll('input');
    expect([...boxes].map((b) => b.checked)).toEqual([true, true, false]);
  });

  it('fills textareas and date inputs', async () => {
    document.body.innerHTML = '<textarea name="cover"></textarea><input type="date" name="dob">';
    const fields = scan();
    await filler.fill(
      [
        { fieldId: idOf(fields, 'cover'), action: 'text', value: 'Dear team,\nHello.' },
        { fieldId: idOf(fields, 'dob'), action: 'text', value: '2003-03-05' },
      ],
      OPTIONS,
    );
    expect(document.querySelector('textarea')!.value).toBe('Dear team,\nHello.');
    expect((document.querySelector('input[type=date]') as HTMLInputElement).value).toBe('2003-03-05');
  });

  it('does not overwrite values typed after the scan unless allowed', async () => {
    document.body.innerHTML = '<input name="first">';
    const id = idOf(scan(), 'first');
    document.querySelector('input')!.value = 'Typed by user';
    const report = await filler.fill([{ fieldId: id, action: 'text', value: 'Harshit' }], OPTIONS);
    expect(report.filled).toBe(0);
    expect(document.querySelector('input')!.value).toBe('Typed by user');
  });

  it('reports disabled, read-only and missing elements', async () => {
    document.body.innerHTML = '<input name="a"><input name="b">';
    const fields = scan();
    const [a, b] = document.querySelectorAll('input');
    a!.disabled = true;
    b!.readOnly = true;
    const report = await filler.fill(
      [
        { fieldId: idOf(fields, 'a'), action: 'text', value: 'x' },
        { fieldId: idOf(fields, 'b'), action: 'text', value: 'x' },
        { fieldId: 'f999', action: 'text', value: 'x' },
      ],
      OPTIONS,
    );
    expect(report.outcomes.map((o) => o.reason)).toEqual(['disabled', 'readonly', 'not-found']);
  });

  it('accepts values reformatted by input masks', () => {
    document.body.innerHTML = '<input name="phone">';
    const input = document.querySelector('input')!;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      input.value = digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
    });
    expect(setTextValue(input, '9876512345')).toBe(true);
    expect(input.value).toBe('98765 12345');
  });

  it('reports a failure when a page rejects the value', () => {
    document.body.innerHTML = '<input name="locked">';
    const input = document.querySelector('input')!;
    input.addEventListener('input', () => (input.value = ''));
    expect(setTextValue(input, 'anything')).toBe(false);
  });

  it('undo restores the previous values', async () => {
    document.body.innerHTML = `
      <input name="first">
      <select name="state"><option>Select</option><option>Rajasthan</option></select>
      <label><input type="radio" name="g" value="m"> Male</label><label><input type="radio" name="g" value="f"> Female</label>`;
    const fields = scan();
    const radioGroup = fields.find((f) => f.kind === 'radio-group')!;
    await filler.fill(
      [
        { fieldId: idOf(fields, 'first'), action: 'text', value: 'Harshit' },
        { fieldId: idOf(fields, 'state'), action: 'select', optionIndex: 1 },
        { fieldId: radioGroup.id, action: 'radio', optionId: radioGroup.options[0]!.id },
      ],
      OPTIONS,
    );
    expect(filler.undo()).toBe(3);
    expect((document.querySelector('input[name=first]') as HTMLInputElement).value).toBe('');
    expect(document.querySelector('select')!.selectedIndex).toBe(0);
    expect((document.querySelector('input[value=m]') as HTMLInputElement).checked).toBe(false);
  });

  it('finds a re-rendered element by its signature', async () => {
    document.body.innerHTML = '<div id="wrap"><label for="x">Email</label><input id="x" name="email"></div>';
    const fields = scan();
    const relocatingFiller = new FormFiller(registry, (id) => {
      const replacement = detectFields(document, registry).find((f) => f.id !== id && f.name === 'email');
      return replacement ? registry.get(replacement.id) : null;
    });
    // Simulate a framework replacing the node.
    document.getElementById('wrap')!.innerHTML = '<label for="x">Email</label><input id="x" name="email">';
    const report = await relocatingFiller.fill([{ fieldId: idOf(fields, 'email'), action: 'text', value: 'a@b.co' }], OPTIONS);
    expect(report.filled).toBe(1);
    expect(document.querySelector('input')!.value).toBe('a@b.co');
  });

  it('fails gracefully for file inputs where DataTransfer is unavailable', async () => {
    document.body.innerHTML = '<input type="file" name="resume">';
    const instruction: FillInstruction = {
      fieldId: idOf(scan(), 'resume'),
      action: 'file',
      file: { name: 'cv.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' },
    };
    const report = await filler.fill([instruction], OPTIONS);
    // jsdom has no DataTransfer; in Chrome the file is attached. Either way nothing throws.
    expect(report.outcomes).toHaveLength(1);
  });
});

describe('React controlled inputs', () => {
  function ReactForm({ onState }: { onState: (s: Record<string, unknown>) => void }) {
    const [name, setName] = useState('');
    const [country, setCountry] = useState('');
    const [agree, setAgree] = useState(false);
    const [gender, setGender] = useState('');
    onState({ name, country, agree, gender });
    return (
      <form>
        <label>
          Full name <input name="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Country
          <select name="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select</option>
            <option value="IN">India</option>
          </select>
        </label>
        <label>
          <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Newsletter
        </label>
        <label>
          <input type="radio" name="gender" value="male" checked={gender === 'male'} onChange={(e) => setGender(e.target.value)} /> Male
        </label>
        <label>
          <input type="radio" name="gender" value="female" checked={gender === 'female'} onChange={(e) => setGender(e.target.value)} /> Female
        </label>
      </form>
    );
  }

  it('updates React state for text, select, checkbox and radio', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let latest: Record<string, unknown> = {};
    const root = createRoot(container);
    await act(async () => root.render(<ReactForm onState={(s) => (latest = s)} />));

    const fields = scan();
    const radio = fields.find((f) => f.kind === 'radio-group')!;
    const checkbox = fields.find((f) => f.kind === 'checkbox')!;
    await act(async () => {
      await filler.fill(
        [
          { fieldId: idOf(fields, 'name'), action: 'text', value: 'Harshit Goyal' },
          { fieldId: idOf(fields, 'country'), action: 'select', optionIndex: 1 },
          { fieldId: checkbox.id, action: 'checkbox', checked: true },
          { fieldId: radio.id, action: 'radio', optionId: radio.options[1]!.id },
        ],
        OPTIONS,
      );
    });

    expect(latest).toEqual({ name: 'Harshit Goyal', country: 'IN', agree: true, gender: 'female' });
    // React re-rendered with the new state and kept the DOM in sync.
    expect((container.querySelector('input[name=name]') as HTMLInputElement).value).toBe('Harshit Goyal');
    await act(async () => root.unmount());
  });

  it('plain `el.value = x` does NOT update React state (why the filler uses the native setter)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let latest: Record<string, unknown> = {};
    const root = createRoot(container);
    await act(async () => root.render(<ReactForm onState={(s) => (latest = s)} />));
    const input = container.querySelector('input[name=name]') as HTMLInputElement;
    await act(async () => {
      input.value = 'Naive';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(latest.name).toBe('');
    await act(async () => root.unmount());
  });
});

describe('Vue v-model', () => {
  it('updates Vue state for text, select, checkbox and radio', async () => {
    const state = { name: ref(''), city: ref(''), subscribe: ref(false), gender: ref('') };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = createApp({
      setup() {
        return () =>
          vh('form', [
            vh('label', ['Full name ', withDirectives(vh('input', { name: 'name', 'onUpdate:modelValue': (v: string) => (state.name.value = v) }), [[vModelText, state.name.value]])]),
            vh('label', [
              'City ',
              withDirectives(
                vh('select', { name: 'city', 'onUpdate:modelValue': (v: string) => (state.city.value = v) }, [vh('option', { value: '' }, 'Select'), vh('option', { value: 'jaipur' }, 'Jaipur')]),
                [[vModelSelect, state.city.value]],
              ),
            ]),
            vh('label', [withDirectives(vh('input', { type: 'checkbox', name: 'sub', 'onUpdate:modelValue': (v: boolean) => (state.subscribe.value = v) }), [[vModelCheckbox, state.subscribe.value]]), ' Updates']),
            vh('label', [withDirectives(vh('input', { type: 'radio', name: 'g', value: 'm', 'onUpdate:modelValue': (v: string) => (state.gender.value = v) }), [[vModelRadio, state.gender.value]]), ' Male']),
            vh('label', [withDirectives(vh('input', { type: 'radio', name: 'g', value: 'f', 'onUpdate:modelValue': (v: string) => (state.gender.value = v) }), [[vModelRadio, state.gender.value]]), ' Female']),
          ]);
      },
    });
    app.mount(container);
    await nextTick();

    const fields = scan();
    const radio = fields.find((f) => f.kind === 'radio-group')!;
    const checkbox = fields.find((f) => f.kind === 'checkbox')!;
    await filler.fill(
      [
        { fieldId: idOf(fields, 'name'), action: 'text', value: 'Harshit' },
        { fieldId: idOf(fields, 'city'), action: 'select', optionIndex: 1 },
        { fieldId: checkbox.id, action: 'checkbox', checked: true },
        { fieldId: radio.id, action: 'radio', optionId: radio.options[0]!.id },
      ],
      OPTIONS,
    );
    await nextTick();
    expect(state.name.value).toBe('Harshit');
    expect(state.city.value).toBe('jaipur');
    expect(state.subscribe.value).toBe(true);
    expect(state.gender.value).toBe('m');
    app.unmount();
  });
});

describe('Angular-style forms', () => {
  it('fires the events DefaultValueAccessor listens to (input for value, blur for touched)', async () => {
    // Angular's DefaultValueAccessor binds (input) → onChange(value) and (blur) → onTouched().
    document.body.innerHTML = '<input formcontrolname="email" name="email">';
    const input = document.querySelector('input')!;
    const control = { value: '', touched: false, dirty: false };
    input.addEventListener('input', (e) => {
      control.value = (e.target as HTMLInputElement).value;
      control.dirty = true;
    });
    input.addEventListener('blur', () => (control.touched = true));
    await filler.fill([{ fieldId: idOf(scan(), 'email'), action: 'text', value: 'harshit@example.com' }], OPTIONS);
    expect(control).toEqual({ value: 'harshit@example.com', touched: true, dirty: true });
  });
});
