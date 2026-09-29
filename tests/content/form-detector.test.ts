import { beforeEach, describe, expect, it } from 'vitest';
import { ElementRegistry } from '../../src/content/element-registry';
import { detectFields } from '../../src/content/form-detector';
import { mapFields } from '../../src/matching/field-mapper';
import type { DetectedField } from '../../src/types/fields';

let registry: ElementRegistry;

function scan(html?: string, doc: Document = document): DetectedField[] {
  if (html !== undefined) doc.body.innerHTML = html;
  return detectFields(doc, registry);
}

const byName = (fields: DetectedField[], name: string) => fields.find((f) => f.name === name);

beforeEach(() => {
  registry = new ElementRegistry();
  document.body.innerHTML = '';
});

describe('label extraction', () => {
  it('reads <label for>, wrapping labels, aria-label, aria-labelledby and placeholders', () => {
    const fields = scan(`
      <form>
        <label for="a">First Name <span>*</span></label><input id="a" name="a">
        <label>Last name <input name="b"></label>
        <input name="c" aria-label="Email address">
        <span id="phone-label">Mobile Number</span><input name="d" aria-labelledby="phone-label">
        <input name="e" placeholder="City">
      </form>`);
    expect(byName(fields, 'a')!.label).toBe('First Name *');
    expect(byName(fields, 'b')!.label).toBe('Last name');
    expect(byName(fields, 'c')!.ariaLabel).toBe('Email address');
    expect(byName(fields, 'd')!.label).toBe('Mobile Number');
    expect(byName(fields, 'e')!.placeholder).toBe('City');
  });

  it('does not include option text of a select in its wrapping label', () => {
    const [field] = scan(`<label>Country <select name="country"><option>India</option><option>Nepal</option></select></label>`);
    expect(field!.label).toBe('Country');
    expect(field!.options.map((o) => o.text)).toEqual(['India', 'Nepal']);
  });

  it('uses text placed next to the control when there is no label', () => {
    const fields = scan(`
      <table>
        <tr><td>Father's Name</td><td><input name="x1"></td></tr>
        <tr><td>Pincode</td><td><input name="x2"></td></tr>
      </table>
      <div><span>Date of Birth</span><input name="x3"></div>
      <p>Nationality: <input name="x4"></p>`);
    // In two-column tables the previous cell is the label itself.
    expect(byName(fields, 'x1')!.label).toBe("Father's Name");
    expect(byName(fields, 'x2')!.label).toBe('Pincode');
    expect(byName(fields, 'x3')!.nearbyText).toBe('Date of Birth');
    expect(byName(fields, 'x4')!.nearbyText).toBe('Nationality:');
  });

  it('never borrows the previous field’s label', () => {
    const fields = scan(`
      <div class="row"><label>First name</label><input name="first"></div>
      <div class="row"><input name="mystery"></div>`);
    expect(byName(fields, 'mystery')!.nearbyText).toBe('');
  });

  it('captures section headings and fieldset legends as context', () => {
    const fields = scan(`
      <form>
        <h2>Personal details</h2>
        <div><label for="n1">Name</label><input id="n1" name="n1"></div>
        <h2>Emergency Contact</h2>
        <div><label for="n2">Name</label><input id="n2" name="n2"></div>
        <fieldset><legend>Class X details</legend><label>Percentage <input name="p10"></label></fieldset>
      </form>`);
    expect(byName(fields, 'n1')!.sectionText).toBe('Personal details');
    expect(byName(fields, 'n2')!.sectionText).toBe('Emergency Contact');
    expect(byName(fields, 'p10')!.sectionText).toBe('Class X details');
  });

  it('collects Angular / automation attribute hints', () => {
    const [field] = scan(`<input formcontrolname="lastName" data-automation-id="legalNameSection_lastName">`);
    expect(field!.attrHints).toContain('lastName');
    expect(field!.attrHints).toContain('legalNameSection_lastName');
  });
});

describe('control kinds and grouping', () => {
  it('classifies input types', () => {
    const fields = scan(`
      <input type="email" name="e"><input type="tel" name="t"><input type="number" name="n"><input type="date" name="d">
      <input type="url" name="u"><textarea name="ta"></textarea><select name="s"><option>A</option></select><input type="file" name="f">`);
    expect(fields.map((f) => f.kind)).toEqual(['email', 'tel', 'number', 'date', 'url', 'textarea', 'select', 'file']);
  });

  it('groups radio buttons by name with the question as label', () => {
    const fields = scan(`
      <form>
        <fieldset><legend>Gender</legend>
          <label><input type="radio" name="gender" value="M"> Male</label>
          <label><input type="radio" name="gender" value="F"> Female</label>
          <input type="radio" name="gender" id="o" value="O"><label for="o">Other</label>
        </fieldset>
      </form>`);
    expect(fields).toHaveLength(1);
    const [group] = fields;
    expect(group!.kind).toBe('radio-group');
    expect(group!.label).toBe('Gender');
    expect(group!.options.map((o) => o.text)).toEqual(['Male', 'Female', 'Other']);
  });

  it('finds the question text of a radio group without a fieldset', () => {
    const [group] = scan(`
      <div class="q"><p>Marital Status</p>
        <label><input type="radio" name="ms" value="1">Single</label>
        <label><input type="radio" name="ms" value="2">Married</label>
      </div>`);
    expect(group!.label).toBe('Marital Status');
  });

  it('groups same-name checkboxes and keeps lone checkboxes separate', () => {
    const fields = scan(`
      <p>Skills</p>
      <label><input type="checkbox" name="skills[]" value="js"> JavaScript</label>
      <label><input type="checkbox" name="skills[]" value="py"> Python</label>
      <label><input type="checkbox" name="terms"> I agree to the terms</label>`);
    expect(fields.map((f) => f.kind)).toEqual(['checkbox-group', 'checkbox']);
    expect(fields[0]!.options.map((o) => o.text)).toEqual(['JavaScript', 'Python']);
    expect(fields[1]!.label).toBe('I agree to the terms');
  });
});

describe('fields that are skipped', () => {
  it('skips hidden, invisible, disabled, read-only, password, search and button inputs', () => {
    const fields = scan(`
      <input type="hidden" name="h1">
      <input name="h2" style="display:none">
      <div style="display:none"><input name="h3"></div>
      <div hidden><input name="h4"></div>
      <input name="h5" style="visibility:hidden">
      <input name="d1" disabled>
      <input name="r1" readonly>
      <input type="password" name="p1">
      <input type="search" name="s1">
      <input type="submit" name="b1"><input type="button" name="b2"><input type="reset" name="b3">
      <div aria-hidden="true"><input name="a1"></div>
      <input name="ok">`);
    expect(fields.map((f) => f.name)).toEqual(['ok']);
  });

  it('keeps visually hidden radios whose label is visible (custom radio UIs)', () => {
    const [group] = scan(`
      <label><input type="radio" name="g" value="m" style="display:none"> Male</label>
      <label><input type="radio" name="g" value="f" style="display:none"> Female</label>`);
    expect(group?.kind).toBe('radio-group');
    expect(group?.options).toHaveLength(2);
  });
});

describe('dynamic pages', () => {
  it('finds fields added after the first scan and keeps ids stable', () => {
    const first = scan(`<form id="f"><label>First name <input name="first"></label></form>`);
    const form = document.getElementById('f')!;
    form.insertAdjacentHTML('beforeend', '<label>Last name <input name="last"></label>');
    const second = scan();
    expect(second.map((f) => f.name)).toEqual(['first', 'last']);
    expect(byName(second, 'first')!.id).toBe(byName(first, 'first')!.id);
  });

  it('finds fields inside open shadow roots', () => {
    document.body.innerHTML = '<my-form></my-form>';
    const host = document.querySelector('my-form')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<label for="sx">Email</label><input id="sx" name="shadow-email" type="email">';
    const fields = scan();
    const field = byName(fields, 'shadow-email');
    expect(field).toBeDefined();
    expect(field!.label).toBe('Email');
  });

  it('scans a same-origin iframe document on its own (as the per-frame content script does)', () => {
    document.body.innerHTML = '<iframe id="frame"></iframe>';
    const frameDoc = (document.getElementById('frame') as HTMLIFrameElement).contentDocument!;
    frameDoc.body.innerHTML = '<label>Phone <input name="frame-phone"></label>';
    const fields = detectFields(frameDoc, registry);
    expect(fields.map((f) => f.name)).toEqual(['frame-phone']);
  });

  it('detects duplicate fields (email + confirm email) and maps both', () => {
    const fields = scan(`
      <label>Email <input type="email" name="email"></label>
      <label>Confirm Email <input type="email" name="email_confirm"></label>`);
    const matches = mapFields(fields);
    expect(matches.map((m) => m.key)).toEqual(['contact.email', 'contact.email']);
  });
});

describe('privacy', () => {
  it('reports whether fields have values but never the values themselves', () => {
    const fields = scan(`
      <input name="a" value="secret-typed-value">
      <select name="s"><option value="">Select</option><option value="x" selected>Chosen</option></select>
      <textarea name="t">another-secret</textarea>
      <input name="empty">`);
    expect(byName(fields, 'a')!.hasValue).toBe(true);
    expect(byName(fields, 's')!.hasValue).toBe(true);
    expect(byName(fields, 't')!.hasValue).toBe(true);
    expect(byName(fields, 'empty')!.hasValue).toBe(false);
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain('secret-typed-value');
    expect(serialized).not.toContain('another-secret');
  });

  it('does not add attributes to the page', () => {
    document.body.innerHTML = '<label>Name <input name="n"></label>';
    const before = document.body.innerHTML;
    scan();
    expect(document.body.innerHTML).toBe(before);
  });
});
