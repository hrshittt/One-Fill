import { beforeEach, describe, expect, it } from 'vitest';
import { ElementRegistry } from '../../src/content/element-registry';
import { detectFields } from '../../src/content/form-detector';
import { FormFiller } from '../../src/content/form-filler';
import { assessFields, EMPTY_DECISIONS, selectInstructions, summarize, type FieldAssessment, type FillDecisions } from '../../src/core/fill-plan';
import { mapFields } from '../../src/matching/field-mapper';
import type { UserProfile } from '../../src/types/profile';
import { DEFAULT_SETTINGS, type Settings } from '../../src/types/settings';
import { sampleProfile } from '../helpers';

const APPLICATION_FORM = `
<form id="application">
  <h2>Personal Details</h2>
  <label for="fn">First Name *</label><input id="fn" name="candidate_first_name" required>
  <label for="ln">Last Name *</label><input id="ln" name="candidate_last_name">
  <label for="em">Email ID</label><input id="em" type="email" name="email">
  <label for="cem">Confirm Email</label><input id="cem" type="email" name="confirm_email">
  <label for="mob">Mobile No.</label><input id="mob" type="tel" name="mobile_no" maxlength="10">
  <label for="dob">Date of Birth</label><input id="dob" name="dob" placeholder="DD/MM/YYYY">
  <fieldset><legend>Gender</legend>
    <label><input type="radio" name="gender" value="M"> Male</label>
    <label><input type="radio" name="gender" value="F"> Female</label>
  </fieldset>
  <label for="nat">Nationality</label>
  <select id="nat" name="nationality"><option value="">--Select--</option><option>American</option><option>Indian</option></select>
  <label for="fa">Father's Name</label><input id="fa" name="father_name">

  <h2>Address</h2>
  <label for="a1">Address Line 1</label><input id="a1" name="addr1">
  <label for="a2">Address Line 2</label><input id="a2" name="addr2">
  <label for="city">City</label><input id="city" name="city">
  <label for="st">State</label>
  <select id="st" name="state"><option value="">Select State</option><option value="MH">Maharashtra</option><option value="RJ">Rajasthan</option></select>
  <label for="pin">Pincode</label><input id="pin" name="pincode" inputmode="numeric">
  <label for="co">Country</label>
  <select id="co" name="country"><option value="">Select</option><option value="IN">India</option><option value="US">United States</option></select>

  <h2>Academic Details</h2>
  <label for="uni">University / College</label><input id="uni" name="college">
  <label for="deg">Degree</label>
  <select id="deg" name="degree"><option value="">Select</option><option>B.E./B.Tech</option><option>M.Tech</option><option>MBA</option></select>
  <label for="br">Branch</label><input id="br" name="branch">
  <label for="cg">CGPA</label><input id="cg" type="number" step="0.01" name="cgpa">
  <label for="yop">Year of Passing</label>
  <select id="yop" name="yop"><option value="">Year</option><option>2024</option><option>2025</option><option>2026</option></select>
  <label for="reg">Registration No.</label><input id="reg" name="reg_no">
  <label for="p10">10th Percentage</label><input id="p10" name="tenth_pct">
  <label for="p12">12th Percentage</label><input id="p12" name="twelfth_pct">

  <h2>Professional</h2>
  <label for="exp">Total Experience</label>
  <select id="exp" name="experience"><option value="">Select</option><option>Fresher</option><option>0-1 years</option><option>1-3 years</option></select>
  <p>Skills</p>
  <label><input type="checkbox" name="skills" value="ts"> TypeScript</label>
  <label><input type="checkbox" name="skills" value="java"> Java</label>
  <label><input type="checkbox" name="skills" value="py"> Python</label>
  <label for="li">LinkedIn Profile</label><input id="li" type="url" name="linkedin">
  <label for="cl">Cover Letter</label><textarea id="cl" name="cover_letter"></textarea>

  <h2>Identity</h2>
  <label for="pan">PAN Number</label><input id="pan" name="pan">

  <h2>Account</h2>
  <label for="pw">Create Password</label><input id="pw" type="password" name="password">
  <label for="otp">Enter OTP</label><input id="otp" name="otp">
  <label for="appid">Applicant ID</label><input id="appid" name="applicant_id">
  <label><input type="checkbox" name="agree"> I agree to the terms and conditions</label>
</form>`;

let registry: ElementRegistry;

function plan(html: string, profile: UserProfile = sampleProfile(), settings: Partial<Settings> = {}) {
  document.body.innerHTML = html;
  registry = new ElementRegistry();
  const fields = detectFields(document, registry);
  const matches = mapFields(fields);
  const assessments = assessFields(fields, matches, profile, { settings: { ...DEFAULT_SETTINGS, ...settings }, locale: 'en-IN' });
  return { fields, matches, assessments };
}

async function run(assessments: FieldAssessment[], decisions: FillDecisions = EMPTY_DECISIONS) {
  const byFrame = selectInstructions(assessments, decisions, 'ask');
  const filler = new FormFiller(registry);
  const instructions = (byFrame.get(0) ?? []).map((i) => i.instruction);
  return filler.fill(instructions, { overwrite: false, highlight: false });
}

const value = (selector: string) => (document.querySelector(selector) as HTMLInputElement | HTMLSelectElement).value;
const statusOf = (assessments: FieldAssessment[], name: string) => assessments.find((a) => a.field.name === name)?.status;

describe('job / university application form', () => {
  let assessments: FieldAssessment[];

  beforeEach(async () => {
    ({ assessments } = plan(APPLICATION_FORM));
    await run(assessments);
  });

  it('fills personal details', () => {
    expect(value('#fn')).toBe('Harshit');
    expect(value('#ln')).toBe('Goyal');
    expect(value('#em')).toBe('harshit@example.com');
    expect(value('#cem')).toBe('harshit@example.com');
    expect(value('#mob')).toBe('9876512345');
    expect(value('#dob')).toBe('05/03/2003');
    expect((document.querySelector('input[value=M]') as HTMLInputElement).checked).toBe(true);
    expect(value('#nat')).toBe('Indian');
    expect(value('#fa')).toBe('Rakesh Goyal');
  });

  it('fills the address, including dropdowns', () => {
    expect(value('#a1')).toBe('12 MG Road');
    expect(value('#a2')).toBe('Malviya Nagar');
    expect(value('#city')).toBe('Jaipur');
    expect(value('#st')).toBe('RJ');
    expect(value('#pin')).toBe('302017');
    expect(value('#co')).toBe('IN');
  });

  it('fills academic details from the right education records', () => {
    expect(value('#uni')).toBe('Manipal University Jaipur');
    expect(value('#deg')).toBe('B.E./B.Tech');
    expect(value('#br')).toBe('Computer Science and Engineering');
    expect(value('#cg')).toBe('8.7');
    expect(value('#yop')).toBe('2025');
    expect(value('#p10')).toBe('94.6');
    expect(value('#p12')).toBe('91.2');
  });

  it('fills professional details, checkbox groups and text areas', () => {
    expect(value('#exp')).toBe('1-3 years');
    const skills = [...document.querySelectorAll<HTMLInputElement>('input[name=skills]')].map((b) => b.checked);
    expect(skills).toEqual([true, false, true]);
    expect(value('#li')).toBe('https://www.linkedin.com/in/harshitgoyal');
    expect(value('#cl')).toContain('Dear Hiring Manager');
  });

  it('never fills sensitive, password, OTP or consent fields by default', () => {
    expect(value('#pan')).toBe('');
    expect(statusOf(assessments, 'pan')).toBe('sensitive');
    expect(value('#pw')).toBe('');
    expect(value('#otp')).toBe('');
    expect((document.querySelector('input[name=agree]') as HTMLInputElement).checked).toBe(false);
    expect(statusOf(assessments, 'otp')).toBe('blocked');
    expect(statusOf(assessments, 'agree')).toBe('blocked');
  });

  it('leaves unknown and uncertain fields for review', () => {
    expect(value('#appid')).toBe('');
    expect(statusOf(assessments, 'applicant_id')).toBe('unmatched');
    // "Registration No." is confident here because it sits under "Academic Details".
    expect(value('#reg')).toBe('219301042');
  });

  it('summarises the plan', () => {
    const s = summarize(assessments);
    expect(s.blocked).toBe(2); // OTP + consent (the password input is never even detected)
    expect(s.sensitive).toBe(1);
    expect(s.unmatched).toBe(1);
    expect(s.ready).toBe(27); // every other detected field
    expect(s.review + s.missing + s.prefilled).toBe(0);
  });
});

describe('explicit decisions', () => {
  it('fills a sensitive field only when the user ticks it, and masks its preview', async () => {
    const { assessments } = plan(APPLICATION_FORM);
    const pan = assessments.find((a) => a.field.name === 'pan')!;
    expect(pan.displayValue).toBe('XXXXXX234F');
    await run(assessments, { ...EMPTY_DECISIONS, includeSensitive: new Set([pan.uid]) });
    expect(value('#pan')).toBe('ABCDE1234F');
  });

  it('never fills sensitive fields when the policy is "never"', () => {
    const { assessments } = plan(APPLICATION_FORM, sampleProfile(), { sensitivePolicy: 'never' });
    const pan = assessments.find((a) => a.field.name === 'pan')!;
    const byFrame = selectInstructions(assessments, { ...EMPTY_DECISIONS, includeSensitive: new Set([pan.uid]) }, 'never');
    expect(byFrame.get(0)!.some((i) => i.assessment.uid === pan.uid)).toBe(false);
  });

  it('holds uncertain matches until confirmed', async () => {
    const { assessments } = plan('<label>Registration No. <input name="reg"></label>');
    expect(assessments[0]!.status).toBe('review');
    await run(assessments);
    expect(value('input')).toBe('');
    await run(assessments, { ...EMPTY_DECISIONS, confirmed: new Set([assessments[0]!.uid]) });
    expect(value('input')).toBe('219301042');
  });

  it('with "Show confirmation" off, uncertain matches are filled directly', () => {
    const { assessments } = plan('<label>Registration No. <input name="reg"></label>', sampleProfile(), { confirmUncertain: false });
    expect(assessments[0]!.status).toBe('ready');
  });

  it('does not overwrite values already on the page', () => {
    const { assessments } = plan('<label>First Name <input name="fn" value="Typed"></label>');
    expect(assessments[0]!.status).toBe('prefilled');
  });

  it('applies a user-chosen mapping', () => {
    document.body.innerHTML = '<label>Candidate code <input name="code"></label>';
    registry = new ElementRegistry();
    const fields = detectFields(document, registry);
    const matches = mapFields(fields);
    const uid = `0:${fields[0]!.id}`;
    const [a] = assessFields(fields, matches, sampleProfile(), {
      settings: DEFAULT_SETTINGS,
      keyOverrides: new Map([[uid, 'education.rollNumber']]),
    });
    expect(a!.status).toBe('ready');
    expect(a!.instruction).toMatchObject({ action: 'text', value: '21CS042' });
  });
});

describe('ambiguity that does not matter', () => {
  it('fills a "Country" select with dial-code options without asking, since both readings pick the same option', () => {
    const { assessments } = plan(`
      <label>Country <select name="job_application[phone_country]">
        <option value="">Select…</option><option value="US">United States (+1)</option><option value="CA">Canada (+1)</option>
        <option value="GB">United Kingdom (+44)</option><option value="IN">India (+91)</option><option value="SG">Singapore (+65)</option>
      </select></label>`);
    expect(assessments[0]!.status).toBe('ready');
    expect(assessments[0]!.instruction).toMatchObject({ action: 'select', optionIndex: 4 });
  });

  it('still asks when the readings would fill different values', () => {
    const { assessments } = plan('<label>School <input name="school"></label>');
    expect(assessments[0]!.status).toBe('review');
  });
});

describe('formatting and edge cases', () => {
  it('uses the international phone format when the placeholder asks for it', () => {
    const { assessments } = plan('<label>Phone <input name="p" placeholder="+91 98765 43210"></label>');
    expect(assessments[0]!.instruction).toMatchObject({ value: '+91 9876512345' });
  });

  it('uses the national number when a separate country-code field exists', () => {
    const { assessments } = plan(`
      <form>
        <label>Country code <select name="cc"><option>+1</option><option>+44</option><option>+91</option></select></label>
        <label>Phone <input name="p" placeholder="+91 98765 43210"></label>
      </form>`);
    expect(assessments.find((a) => a.field.name === 'cc')!.instruction).toMatchObject({ action: 'select', optionIndex: 2 });
    expect(assessments.find((a) => a.field.name === 'p')!.instruction).toMatchObject({ value: '9876512345' });
  });

  it('formats dates from the placeholder or the field type', () => {
    const { assessments } = plan(`
      <label>DOB <input name="a" placeholder="MM/DD/YYYY"></label>
      <label>Birth date <input name="b" type="date"></label>
      <label>Date of birth <input name="c" placeholder="YYYY-MM-DD"></label>`);
    const byName = (n: string) => assessments.find((a) => a.field.name === n)!.instruction;
    expect(byName('a')).toMatchObject({ value: '03/05/2003' });
    expect(byName('b')).toMatchObject({ value: '2003-03-05' });
    expect(byName('c')).toMatchObject({ value: '2003-03-05' });
  });

  it('fills split date-of-birth dropdowns', () => {
    const days = Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('');
    const { assessments } = plan(`
      <label>Date of Birth</label>
      <select name="dob_day"><option value="">DD</option>${days}</select>
      <select name="dob_month"><option value="">MM</option><option>Jan</option><option>Feb</option><option>Mar</option></select>
      <select name="dob_year"><option value="">YYYY</option><option>2002</option><option>2003</option></select>`);
    const keys = assessments.map((a) => a.key);
    expect(keys).toEqual(['personal.dobDay', 'personal.dobMonth', 'personal.dobYear']);
    expect(assessments.every((a) => a.instruction)).toBe(true);
  });

  it('flags values that are too long for the field', () => {
    const { assessments } = plan('<label>City <input name="c" maxlength="3"></label>');
    expect(assessments[0]!.status).toBe('review');
    expect(assessments[0]!.note).toMatch(/longer/);
  });

  it('explains when no dropdown option matches', () => {
    const { assessments } = plan('<label>Country <select name="c"><option>Select</option><option>France</option><option>Spain</option></select></label>');
    expect(assessments[0]!.status).toBe('review');
    expect(assessments[0]!.note).toMatch(/No option matches/);
  });

  it('marks fields the profile has no value for as missing', () => {
    const profile = sampleProfile();
    profile.professional.github = '';
    const { assessments } = plan('<label>GitHub <input name="gh"></label>', profile);
    expect(assessments[0]!.status).toBe('missing');
  });

  it('uses the post-graduation record only when it exists', () => {
    const { assessments } = plan('<h3>Post Graduation Details</h3><label>CGPA <input name="pg_cgpa"></label>');
    expect(assessments[0]!.status).toBe('missing');
  });

  it('prepares a resume upload for file inputs', () => {
    const { assessments } = plan('<label>Upload Resume <input type="file" name="resume"></label>');
    expect(assessments[0]!.status).toBe('ready');
    expect(assessments[0]!.documentId).toBe('doc_1');
    expect(assessments[0]!.displayValue).toContain('Harshit_Goyal_Resume.pdf');
  });

  it('masks phone and date previews', () => {
    const { assessments } = plan('<label>Mobile <input name="m"></label><label>DOB <input name="d"></label>');
    expect(assessments[0]!.displayValue).toBe('+91 XXXXX 12345');
    expect(assessments[1]!.displayValue).toBe('••/••/2003');
  });
});
