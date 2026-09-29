import { describe, expect, it } from 'vitest';
import { CONFIDENCE, mapField, mapFields } from '../../src/matching/field-mapper';
import { fieldSignature } from '../../src/matching/signature';
import type { DetectedField, FieldKey } from '../../src/types/fields';
import { SKIP_FIELD } from '../../src/types/history';
import { makeField, options } from '../helpers';

const byLabel = (label: string, extra: Partial<DetectedField> = {}) => mapField(makeField({ label, ...extra }));
const byName = (name: string, extra: Partial<DetectedField> = {}) => mapField(makeField({ name, ...extra }));

function expectKey(result: ReturnType<typeof mapField>, key: FieldKey | null) {
  expect(result.key, `detected "${result.detectedLabel}" → ${result.key} (${result.confidence})`).toBe(key);
}

describe('label → profile field', () => {
  const cases: Array<[string, FieldKey]> = [
    // First name
    ['First Name', 'personal.firstName'],
    ['First name', 'personal.firstName'],
    ['Given Name', 'personal.firstName'],
    ['First Name *', 'personal.firstName'],
    ['Enter your first name', 'personal.firstName'],
    ['Forename', 'personal.firstName'],
    // Other names
    ['Last Name', 'personal.lastName'],
    ['Surname', 'personal.lastName'],
    ['Family name', 'personal.lastName'],
    ['Middle Name', 'personal.middleName'],
    ['Full Name', 'personal.fullName'],
    ['Name', 'personal.fullName'],
    ['Your name', 'personal.fullName'],
    ["Applicant's Name", 'personal.fullName'],
    ['Name of the Candidate', 'personal.fullName'],
    ['Name (as per Aadhaar)', 'personal.fullName'],
    // Phone
    ['Mobile Number', 'contact.phone'],
    ['Phone', 'contact.phone'],
    ['Contact Number', 'contact.phone'],
    ['Phone No.', 'contact.phone'],
    ['WhatsApp Number', 'contact.phone'],
    ['Telephone', 'contact.phone'],
    ['Alternate Mobile Number', 'contact.alternatePhone'],
    ['Country code', 'contact.phoneCountryCode'],
    // Email
    ['Email', 'contact.email'],
    ['E-mail Address', 'contact.email'],
    ['Email ID', 'contact.email'],
    ['Confirm Email', 'contact.email'],
    ['Alternate Email', 'contact.alternateEmail'],
    // Personal
    ['Date of Birth', 'personal.dateOfBirth'],
    ['DOB', 'personal.dateOfBirth'],
    ['D.O.B', 'personal.dateOfBirth'],
    ['Birth Date', 'personal.dateOfBirth'],
    ['Place of Birth', 'personal.placeOfBirth'],
    ['Gender', 'personal.gender'],
    ['Sex', 'personal.gender'],
    ['Nationality', 'personal.nationality'],
    ['Marital Status', 'personal.maritalStatus'],
    ["Father's Name", 'personal.fatherName'],
    ['Father Name', 'personal.fatherName'],
    ["Father's/Guardian's Name", 'personal.fatherName'],
    ["Mother's Name", 'personal.motherName'],
    ['Age', 'personal.age'],
    // Address
    ['Address Line 1', 'address.line1'],
    ['Street Address', 'address.line1'],
    ['Address Line 2', 'address.line2'],
    ['Apartment, suite, etc.', 'address.line2'],
    ['City', 'address.city'],
    ['Town/City', 'address.city'],
    ['State', 'address.state'],
    ['State / Province', 'address.state'],
    ['Country', 'address.country'],
    ['ZIP Code', 'address.postalCode'],
    ['Pincode', 'address.postalCode'],
    ['PIN Code', 'address.postalCode'],
    ['Postal Code', 'address.postalCode'],
    ['Landmark', 'address.landmark'],
    ['Permanent Address', 'address.full'],
    // Education
    ['College', 'education.university'],
    ['University', 'education.university'],
    ['Institution', 'education.university'],
    ['University Name', 'education.university'],
    ['Name of Institute', 'education.university'],
    ['College Name', 'education.university'],
    ['Degree', 'education.degree'],
    ['Branch', 'education.specialization'],
    ['Specialization', 'education.specialization'],
    ['Major', 'education.specialization'],
    ['Field of Study', 'education.specialization'],
    ['Enrollment No.', 'education.enrollmentNumber'],
    ['Enrolment Number', 'education.enrollmentNumber'],
    ['Roll No', 'education.rollNumber'],
    ['University Registration Number', 'education.registrationNumber'],
    ['CGPA', 'education.cgpa'],
    ['GPA', 'education.cgpa'],
    ['Percentage', 'education.percentage'],
    ['Year of Passing', 'education.graduationYear'],
    ['Graduation Year', 'education.graduationYear'],
    ['Passing Out Year', 'education.graduationYear'],
    ['10th Percentage', 'education.tenthPercentage'],
    ['Class X Marks (%)', 'education.tenthPercentage'],
    ['SSC Percentage', 'education.tenthPercentage'],
    ['12th Percentage', 'education.twelfthPercentage'],
    ['HSC %', 'education.twelfthPercentage'],
    ['Class XII Board', 'education.twelfthBoard'],
    ['10th Passing Year', 'education.tenthYear'],
    ['School Name', 'education.schoolName'],
    ['Highest Qualification', 'education.level'],
    // Professional
    ['Current Company', 'professional.currentCompany'],
    ['Company Name', 'professional.currentCompany'],
    ['Employer', 'professional.currentCompany'],
    ['Job Title', 'professional.jobTitle'],
    ['Current Designation', 'professional.jobTitle'],
    ['Years of Experience', 'professional.experienceYears'],
    ['Total Experience (in years)', 'professional.experienceYears'],
    ['Skills', 'professional.skills'],
    ['Key Skills', 'professional.skills'],
    ['LinkedIn Profile', 'professional.linkedin'],
    ['LinkedIn URL', 'professional.linkedin'],
    ['GitHub', 'professional.github'],
    ['Portfolio', 'professional.portfolio'],
    ['Personal Website', 'professional.portfolio'],
    ['Cover Letter', 'professional.coverLetter'],
    ['Notice Period', 'professional.noticePeriod'],
    // Identification
    ['PAN Number', 'identification.pan'],
    ['PAN Card No.', 'identification.pan'],
    ['Permanent Account Number', 'identification.pan'],
    ['Aadhaar Number', 'identification.aadhaar'],
    ['Aadhar Card No', 'identification.aadhaar'],
    ['Passport Number', 'identification.passportNumber'],
    ['Passport Expiry Date', 'identification.passportExpiry'],
    ['Driving Licence Number', 'identification.drivingLicense'],
    ['Voter ID', 'identification.voterId'],
    // Emergency
    ['Emergency Contact Name', 'emergency.name'],
    ['Emergency Contact Number', 'emergency.phone'],
    ['Emergency Contact Relationship', 'emergency.relationship'],
  ];

  it.each(cases)('"%s" → %s', (label, key) => {
    expectKey(byLabel(label), key);
  });
});

describe('name/id attributes (Level 2)', () => {
  const cases: Array<[string, FieldKey]> = [
    ['fname', 'personal.firstName'],
    ['first_name', 'personal.firstName'],
    ['firstName', 'personal.firstName'],
    ['given-name', 'personal.firstName'],
    ['candidate_first_name', 'personal.firstName'],
    ['applicant[first_name]', 'personal.firstName'],
    ['ctl00$ContentPlaceHolder1$txtFirstName', 'personal.firstName'],
    ['lname', 'personal.lastName'],
    ['surname', 'personal.lastName'],
    ['applicantName', 'personal.fullName'],
    ['mobile_no', 'contact.phone'],
    ['mobileNumber', 'contact.phone'],
    ['phone', 'contact.phone'],
    ['emailAddress', 'contact.email'],
    ['email_id', 'contact.email'],
    ['dob', 'personal.dateOfBirth'],
    ['address1', 'address.line1'],
    ['address_line_2', 'address.line2'],
    ['zip', 'address.postalCode'],
    ['pincode', 'address.postalCode'],
    ['txtCity', 'address.city'],
    ['ddlState', 'address.state'],
    ['PANNumber', 'identification.pan'],
    ['aadhar_no', 'identification.aadhaar'],
    ['linkedin_url', 'professional.linkedin'],
    ['tenthPercentage', 'education.tenthPercentage'],
    ['percentage_12th', 'education.twelfthPercentage'],
    ['cgpa', 'education.cgpa'],
  ];

  it.each(cases)('name="%s" → %s', (name, key) => {
    expectKey(byName(name), key);
  });

  it('uses Angular formcontrolname / automation attributes', () => {
    expectKey(mapField(makeField({ attrHints: 'lastName' })), 'personal.lastName');
    expectKey(mapField(makeField({ attrHints: 'legalNameSection_firstName' })), 'personal.firstName');
  });

  it('does not let identifier noise veto a good label (found by the e2e suite)', () => {
    // "job" (from job_application[...]) and "host" (from id="host-name") are exclusion words,
    // but only human-readable text should be able to veto a match.
    expectKey(mapField(makeField({ label: 'Location (City)', name: 'job_application[location]' })), 'address.city');
    expectKey(mapField(makeField({ label: 'Website', name: 'job_application[answers][website]', kind: 'url' })), 'professional.portfolio');
    expectKey(mapField(makeField({ label: 'Your name', htmlId: 'host-name' })), 'personal.fullName');
    expectKey(mapField(makeField({ label: "Candidate's Name", htmlId: 'ctl00_ContentPlaceHolder1_txtCandidateName' })), 'personal.fullName');
  });

  it('ignores generated ids', () => {
    const result = mapField(makeField({ htmlId: 'mat-input-3', placeholder: 'City' }));
    expectKey(result, 'address.city');
  });
});

describe('autocomplete attribute (Level 1)', () => {
  it('maps standard tokens with high confidence', () => {
    const result = mapField(makeField({ autocomplete: 'given-name' }));
    expectKey(result, 'personal.firstName');
    expect(result.source).toBe('autocomplete');
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE.READY);
  });

  it('handles section and shipping modifiers', () => {
    expectKey(mapField(makeField({ autocomplete: 'section-a shipping postal-code' })), 'address.postalCode');
    expectKey(mapField(makeField({ autocomplete: 'tel-national', kind: 'tel' })), 'contact.phone');
  });

  it('agreement between label and autocomplete increases confidence', () => {
    const both = mapField(makeField({ autocomplete: 'email', label: 'Email' }));
    expect(both.confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('disagreement lowers confidence so the user reviews it', () => {
    const result = mapField(makeField({ autocomplete: 'family-name', label: 'First Name' }));
    expect(result.confidence).toBeLessThan(CONFIDENCE.READY);
  });

  it('does not treat autocomplete=new-password on a text field as a password', () => {
    const result = mapField(makeField({ autocomplete: 'new-password', label: 'City' }));
    expectKey(result, 'address.city');
    expect(result.blocked).toBeNull();
  });
});

describe('fuzzy matching (Level 4)', () => {
  it.each([
    ['Frist Name', 'personal.firstName'],
    ['Emial', 'contact.email'],
    ['Adress Line 1', 'address.line1'],
    ['Nationalty', 'personal.nationality'],
  ] as Array<[string, FieldKey]>)('"%s" → %s', (label, key) => {
    const result = byLabel(label);
    expectKey(result, key);
  });
});

describe('context and qualifiers (Level 5)', () => {
  it('a plain "Name" under an Emergency Contact heading is the emergency contact', () => {
    expectKey(byLabel('Name', { sectionText: 'Emergency Contact' }), 'emergency.name');
    expectKey(byLabel('Phone', { sectionText: 'In case of emergency' }), 'emergency.phone');
    expectKey(byLabel('Relationship', { sectionText: 'Emergency contact details' }), 'emergency.relationship');
  });

  it('a plain "Name" under "Father\'s Details" is the father\'s name', () => {
    expectKey(byLabel('Name', { sectionText: "Father's Details" }), 'personal.fatherName');
  });

  it('education level comes from section headings', () => {
    expectKey(byLabel('Percentage', { sectionText: 'Class X Details' }), 'education.tenthPercentage');
    expectKey(byLabel('Board', { sectionText: 'Class XII / Intermediate' }), 'education.twelfthBoard');
    expectKey(byLabel('Year of Passing', { sectionText: 'Secondary School Certificate (10th)' }), 'education.tenthYear');
  });

  it('keeps the post-graduation qualifier for record selection', () => {
    const result = byLabel('CGPA', { sectionText: 'Post Graduation Details' });
    expectKey(result, 'education.cgpa');
    expect(result.qualifiers).toContain('postgrad');
  });

  it('infers gender from radio options even without a label', () => {
    const result = mapField(makeField({ kind: 'radio-group', tag: 'input', inputType: 'radio', options: options('Male', 'Female', 'Other') }));
    expectKey(result, 'personal.gender');
  });

  it('infers country from a long country list', () => {
    const result = mapField(
      makeField({ kind: 'select', tag: 'select', options: options('Select', 'India', 'United States', 'Canada', 'Germany', 'France', 'Japan', 'Brazil', 'Nepal', 'Singapore') }),
    );
    expectKey(result, 'address.country');
  });

  it('nationality label beats the country-list hint', () => {
    const result = mapField(
      makeField({ kind: 'select', tag: 'select', label: 'Nationality', options: options('India', 'United States', 'Canada', 'Germany', 'France', 'Japan', 'Brazil', 'Nepal') }),
    );
    expectKey(result, 'personal.nationality');
  });

  it('type=email with no label is the email', () => {
    expectKey(mapField(makeField({ kind: 'email', inputType: 'email' })), 'contact.email');
  });

  it('a "Title" select with Mr/Ms options is not a job title', () => {
    const result = mapField(makeField({ kind: 'select', tag: 'select', label: 'Title', options: options('Mr', 'Mrs', 'Ms', 'Dr') }));
    expect(result.key).not.toBe('professional.jobTitle');
  });

  it('uses nearby text when there is no label', () => {
    expectKey(mapField(makeField({ nearbyText: 'Pincode:' })), 'address.postalCode');
  });
});

describe('things that must NOT map', () => {
  it.each([
    ["Father's Name", 'personal.fullName'],
    ['Company Name', 'personal.fullName'],
    ['College Name', 'personal.fullName'],
    ['Username', 'personal.fullName'],
    ['Name on card', 'personal.fullName'],
    ['Place of Birth', 'personal.dateOfBirth'],
    ['City of Birth', 'address.city'],
    ['Country Code', 'address.country'],
    ['Emergency Contact Phone', 'contact.phone'],
    ["Mother's Email", 'contact.email'],
    ['Mother Tongue', 'personal.motherName'],
    ['University Roll Number', 'education.university'],
    ['Position Applied For', 'professional.jobTitle'],
  ] as Array<[string, FieldKey]>)('"%s" is not %s', (label, key) => {
    expect(byLabel(label).key).not.toBe(key);
  });

  it('leaves unknown fields unmatched', () => {
    expect(byLabel('Applicant ID').key).toBeNull();
    expect(byLabel('How did you hear about us?').key).toBeNull();
    expect(byLabel('Favourite colour').key).toBeNull();
  });
});

describe('blocked fields', () => {
  it.each([
    [{ inputType: 'password', label: 'Password' }, 'password'],
    [{ label: 'Enter OTP' }, 'otp'],
    [{ label: 'Verification code' }, 'otp'],
    [{ autocomplete: 'one-time-code' }, 'otp'],
    [{ label: 'Enter the captcha' }, 'captcha'],
    [{ label: 'Card Number' }, 'payment'],
    [{ label: 'CVV' }, 'payment'],
    [{ autocomplete: 'cc-number' }, 'payment'],
    [{ label: 'Bank Account Number' }, 'payment'],
    [{ label: 'IFSC Code' }, 'payment'],
    [{ kind: 'checkbox' as const, inputType: 'checkbox', label: 'I agree to the Terms and Conditions' }, 'consent'],
    [{ kind: 'checkbox' as const, inputType: 'checkbox', label: 'Subscribe to our newsletter' }, 'consent'],
    [{ name: 'q' }, 'search'],
  ] as Array<[Partial<DetectedField>, string]>)('%o → blocked as %s', (field, reason) => {
    const result = mapField(makeField(field));
    expect(result.blocked).toBe(reason);
    expect(result.key).toBeNull();
  });

  it('PAN ("Permanent Account Number") is not mistaken for a bank account', () => {
    const result = byLabel('Permanent Account Number (PAN)');
    expect(result.blocked).toBeNull();
    expectKey(result, 'identification.pan');
  });
});

describe('confidence and ambiguity', () => {
  it('an exact label is high confidence', () => {
    expect(byLabel('First Name').confidence).toBeGreaterThanOrEqual(CONFIDENCE.READY);
  });

  it('a bare "Registration No." needs confirmation, with alternatives offered', () => {
    const result = byLabel('Registration No.');
    expectKey(result, 'education.registrationNumber');
    expect(result.confidence).toBeLessThan(CONFIDENCE.READY);
  });

  it('"Registration No." inside an academic section is confident', () => {
    const result = byLabel('Registration No.', { sectionText: 'Academic Details' });
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE.READY);
  });

  it('"CGPA/Percentage" is ambiguous and goes to review', () => {
    const result = byLabel('CGPA / Percentage');
    expect(result.confidence).toBeLessThan(CONFIDENCE.READY);
    const keys = result.candidates.map((c) => c.key);
    expect(keys).toContain('education.cgpa');
    expect(keys).toContain('education.percentage');
  });

  it('"School" is ambiguous between school and university', () => {
    const result = byLabel('School');
    expect(result.confidence).toBeLessThan(CONFIDENCE.READY);
  });

  it('candidates are sorted and include the chosen key', () => {
    const result = byLabel('Mobile Number');
    expect(result.candidates[0]?.key).toBe(result.key);
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1]!.confidence).toBeGreaterThanOrEqual(result.candidates[i]!.confidence);
    }
  });
});

describe('cross-field context', () => {
  it('"Address" becomes line 1 when the form also has a line 2', () => {
    const f1 = makeField({ label: 'Address' });
    const f2 = makeField({ label: 'Address Line 2' });
    const [m1, m2] = mapFields([f1, f2]);
    expect(m1!.key).toBe('address.line1');
    expect(m2!.key).toBe('address.line2');
  });

  it('a short field right before the phone number is its country code', () => {
    const code = makeField({ label: 'Phone', maxLength: 4, name: 'phone_prefix' });
    const phone = makeField({ label: 'Phone', maxLength: 10 });
    const [m1, m2] = mapFields([code, phone]);
    expect(m1!.key).toBe('contact.phoneCountryCode');
    expect(m2!.key).toBe('contact.phone');
  });
});

describe('user overrides', () => {
  it('a remembered correction wins', () => {
    const field = makeField({ label: 'Registration No.' });
    const result = mapField(field, { overrides: { [fieldSignature(field)]: 'education.rollNumber' } });
    expect(result.key).toBe('education.rollNumber');
    expect(result.source).toBe('user');
    expect(result.confidence).toBe(1);
  });

  it('a remembered "leave empty" skips the field', () => {
    const field = makeField({ label: 'First Name' });
    const result = mapField(field, { overrides: { [fieldSignature(field)]: SKIP_FIELD } });
    expect(result.key).toBeNull();
  });
});

describe('performance', () => {
  it('maps a 100-field form quickly', () => {
    const labels = ['First Name', 'Email', 'Phone', 'City', 'Unknown thing', 'Father Name', '10th Percentage', 'Company'];
    const fields = Array.from({ length: 100 }, (_, i) => makeField({ label: labels[i % labels.length]!, name: `field_${i}` }));
    mapFields(fields); // warm-up (catalog preparation, JIT)
    // Best of three: the suite runs files in parallel, so a single timing is noisy.
    const timings = [0, 1, 2].map(() => {
      const start = performance.now();
      mapFields(fields);
      return performance.now() - start;
    });
    expect(Math.min(...timings)).toBeLessThan(750);
  });
});
