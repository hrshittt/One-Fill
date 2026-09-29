import { describe, expect, it } from 'vitest';
import { computeCompleteness } from '../../src/core/completeness';
import { formatDateForField, formatPhoneForField, formatUrlForField } from '../../src/core/formatters';
import { createEmptyProfile } from '../../src/core/profile-factory';
import { educationFor, fullNameOf, resolveProfileValue } from '../../src/core/profile-values';
import { normalizeIdentifier, normalizeText } from '../../src/matching/text-normalizer';
import { isRestrictedUrl, hostnameOf } from '../../src/utils/domain';
import { redact } from '../../src/utils/logger';
import { maskAadhaar, maskDate, maskEmail, maskPhone, maskValue } from '../../src/utils/mask';
import { validators, verhoeffValid } from '../../src/utils/validation';
import { makeField, sampleProfile } from '../helpers';

describe('masking', () => {
  it('masks Aadhaar as XXXX XXXX 1234', () => {
    expect(maskAadhaar('234567890124')).toBe('XXXX XXXX 0124');
    expect(maskAadhaar('2345 6789 0124')).toBe('XXXX XXXX 0124');
  });

  it('masks phones keeping the country code and last 5 digits', () => {
    expect(maskPhone('9876512345', '+91')).toBe('+91 XXXXX 12345');
    expect(maskPhone('98765 12345')).toBe('XXXXX 12345');
  });

  it('masks generic IDs keeping separators and the last 4 characters', () => {
    expect(maskValue('ABCDE1234F')).toBe('XXXXXX234F');
    expect(maskValue('RJ14 20210012345')).toBe('XXXX XXXXXXX2345');
    expect(maskValue('AB')).toBe('XB');
  });

  it('masks emails and dates', () => {
    expect(maskEmail('harshit@gmail.com')).toBe('h••••••@gmail.com');
    expect(maskDate('2003-03-05')).toBe('••/••/2003');
  });
});

describe('logger redaction', () => {
  it('never prints values that look personal', () => {
    expect(redact('harshit@example.com')).toBe('<string:19>');
    expect(redact('9876512345')).toBe('<string:10>');
    expect(redact({ pan: 'ABCDE1234F' })).toBe('<object:1 keys>');
    expect(redact('ready')).toBe('ready');
  });
});

describe('validation', () => {
  it('validates emails, phones and URLs', () => {
    expect(validators.email('a@b.co')).toBeNull();
    expect(validators.email('not-an-email')?.level).toBe('error');
    expect(validators.phone('+91 98765 43210')).toBeNull();
    expect(validators.phone('12ab')?.level).toBe('error');
    expect(validators.url('https://github.com/x')).toBeNull();
    expect(validators.url('javascript:alert(1)')?.level).toBe('error');
  });

  it('validates Indian IDs', () => {
    expect(validators.pan('ABCDE1234F')).toBeNull();
    expect(validators.pan('ABCD1234F')?.level).toBe('error');
    expect(validators.aadhaar('234567890124')).toBeNull();
    expect(validators.aadhaar('123456789012')?.level).toBe('error');
    expect(validators.aadhaar('234567890123')?.level).toBe('warning');
    expect(verhoeffValid('234567890124')).toBe(true);
  });

  it('validates dates and ranges', () => {
    expect(validators.dateOfBirth('2003-03-05')).toBeNull();
    expect(validators.dateOfBirth('2999-01-01')?.level).toBe('error');
    expect(validators.dateOfBirth('2003-02-30')?.level).toBe('error');
    expect(validators.cgpa('11')?.level).toBe('error');
    expect(validators.percentage('84.5')).toBeNull();
    expect(validators.year('25')?.level).toBe('error');
  });

  it('treats empty values as valid (every field is optional)', () => {
    for (const validate of Object.values(validators)) expect(validate('')).toBeNull();
  });
});

describe('formatters', () => {
  const field = (extra = {}) => makeField(extra);

  it('formats dates for text fields using the placeholder', () => {
    expect(formatDateForField('2003-03-05', field({ placeholder: 'dd-mm-yyyy' }))).toBe('05-03-2003');
    expect(formatDateForField('2003-03-05', field({ placeholder: 'DD MMM YYYY' }))).toBe('05 Mar 2003');
    expect(formatDateForField('2003-03-05', field({ placeholder: 'dd.mm.yy' }))).toBe('05.03.03');
    expect(formatDateForField('2003-03-05', field(), 'en-US')).toBe('03/05/2003');
    expect(formatDateForField('2003-03-05', field(), 'en-IN')).toBe('05/03/2003');
    expect(formatDateForField('2003-03-05', field({ kind: 'month' }))).toBe('2003-03');
  });

  it('formats phones', () => {
    expect(formatPhoneForField('98765 12345', '+91', field(), false)).toBe('9876512345');
    expect(formatPhoneForField('9876512345', '+91', field({ placeholder: '+1 555 123 4567' }), false)).toBe('+91 9876512345');
    expect(formatPhoneForField('919876512345', '+91', field(), false)).toBe('9876512345');
    expect(formatPhoneForField('9876512345', '+91', field({ label: 'Phone (with country code)' }), true)).toBe('9876512345');
  });

  it('formats URLs and extracts handles', () => {
    expect(formatUrlForField('github.com/me', field({ kind: 'url' }))).toBe('https://github.com/me');
    expect(formatUrlForField('https://github.com/me', field({ label: 'GitHub username' }))).toBe('me');
    expect(formatUrlForField('https://www.linkedin.com/in/me/', field({ label: 'LinkedIn ID' }))).toBe('me');
  });
});

describe('profile values', () => {
  it('derives full name, DOB parts and age', () => {
    const p = sampleProfile();
    expect(fullNameOf(p)).toBe('Harshit Goyal');
    const at = new Date('2026-09-28T00:00:00Z');
    expect(resolveProfileValue(p, 'personal.dobDay')).toEqual({ type: 'text', text: '05' });
    expect(resolveProfileValue(p, 'personal.dobMonth')).toEqual({ type: 'text', text: '03' });
    expect(resolveProfileValue(p, 'personal.age', [], at)).toEqual({ type: 'text', text: '23' });
    expect(resolveProfileValue(p, 'address.full')).toEqual({ type: 'text', text: '12 MG Road, Malviya Nagar, Near City Mall, Jaipur, Rajasthan 302017, India' });
  });

  it('picks education records by qualifier', () => {
    const p = sampleProfile();
    expect(educationFor(p, [])!.level).toBe('bachelors');
    expect(educationFor(p, ['twelfth'])!.level).toBe('higher-secondary');
    expect(educationFor(p, ['postgrad'])).toBeUndefined();
    expect(resolveProfileValue(p, 'education.rollNumber', ['twelfth'])).toEqual({ type: 'text', text: '1122334' });
  });

  it('falls back to a calling code derived from the country', () => {
    const p = sampleProfile();
    p.contact.phoneCountryCode = '';
    expect(resolveProfileValue(p, 'contact.phoneCountryCode')).toEqual({ type: 'text', text: '+91' });
  });

  it('returns null for empty values', () => {
    expect(resolveProfileValue(createEmptyProfile(), 'personal.firstName')).toBeNull();
    expect(resolveProfileValue(createEmptyProfile(), 'professional.skills')).toBeNull();
  });
});

describe('completeness', () => {
  it('scores an empty and a full profile', () => {
    const empty = computeCompleteness(createEmptyProfile());
    expect(empty.percent).toBe(0);
    expect(empty.suggestions[0]!.label).toBe('Add your first name');
    const full = computeCompleteness(sampleProfile());
    expect(full.percent).toBeGreaterThanOrEqual(90);
    expect(full.completed).toBeLessThanOrEqual(full.total);
  });

  it('suggests the most useful missing details first', () => {
    const p = sampleProfile();
    p.contact.phone = '';
    p.professional.linkedin = '';
    p.personal.maritalStatus = '';
    const labels = computeCompleteness(p).suggestions.map((s) => s.label);
    expect(labels.indexOf('Add phone number')).toBeLessThan(labels.indexOf('Add marital status'));
    expect(labels).toContain('Add LinkedIn');
  });
});

describe('text normalisation', () => {
  it('canonicalises common variants', () => {
    expect(normalizeText('Date of Birth (DD/MM/YYYY) *').text).toBe('dob');
    expect(normalizeText('E-mail ID').text).toBe('email');
    expect(normalizeText('Pin Code').text).toBe('postalcode');
    expect(normalizeText("Father's Name").text).toBe('father name');
    expect(normalizeText('Class XII Percentage').text).toBe('twelfth percentage');
    expect(normalizeText('Contact No.').text).toBe('contact number');
    expect(normalizeIdentifier('ctl00$ContentPlaceHolder1$txtMobileNo').text).toBe('mobile number');
    expect(normalizeIdentifier('applicant[address][city]').text).toBe('address city');
    expect(normalizeIdentifier('mat-input-7').text).toBe('');
  });

  it('strips ASP.NET container prefixes from ids (found by the e2e suite)', () => {
    expect(normalizeIdentifier('ctl00_ContentPlaceHolder1_txtCandidateName').text).toBe('name');
    expect(normalizeIdentifier('ctl00$MainContent$txtFatherName').text).toBe('father name');
  });

  it('reads bare 10/12 next to school words as Class X/XII', () => {
    expect(normalizeIdentifier('ctl00$cph$txt10Board').text).toBe('tenth board');
    expect(normalizeIdentifier('percentage_12').text).toBe('percentage twelfth');
    expect(normalizeIdentifier('address_line_2').text).toBe('address line 2');
  });
});

describe('domains', () => {
  it('recognises pages extensions cannot script', () => {
    expect(isRestrictedUrl('chrome://settings')).toBe(true);
    expect(isRestrictedUrl('https://chromewebstore.google.com/detail/x')).toBe(true);
    expect(isRestrictedUrl('https://example.com/apply')).toBe(false);
    expect(hostnameOf('https://www.example.com/a?b=c')).toBe('example.com');
    expect(hostnameOf('chrome://newtab')).toBe('');
  });
});
