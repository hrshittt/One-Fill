import { createEducationRecord, createEmergencyContact, createEmptyProfile } from '../src/core/profile-factory';
import type { DetectedField, FieldOption } from '../src/types/fields';
import type { UserProfile } from '../src/types/profile';

let counter = 0;

/** A detected-field descriptor with sensible defaults; override only what a test cares about. */
export function makeField(overrides: Partial<DetectedField> = {}): DetectedField {
  counter++;
  return {
    id: `t${counter}`,
    frameId: 0,
    kind: 'text',
    tag: 'input',
    inputType: 'text',
    name: '',
    htmlId: '',
    autocomplete: '',
    placeholder: '',
    ariaLabel: '',
    title: '',
    label: '',
    nearbyText: '',
    sectionText: '',
    attrHints: '',
    maxLength: null,
    pattern: '',
    inputMode: '',
    required: false,
    multiple: false,
    accept: '',
    options: [],
    hasValue: false,
    formIndex: 0,
    order: counter,
    ...overrides,
  };
}

export function options(...texts: string[]): FieldOption[] {
  return texts.map((text, i) => ({ id: String(i), text, value: text.toLowerCase(), disabled: false }));
}

/** A realistic, fully populated profile used across tests. */
export function sampleProfile(): UserProfile {
  const p = createEmptyProfile();
  p.personal = {
    firstName: 'Harshit',
    middleName: '',
    lastName: 'Goyal',
    fullName: '',
    dateOfBirth: '2003-03-05',
    placeOfBirth: 'Jaipur',
    gender: 'male',
    nationality: 'Indian',
    maritalStatus: 'single',
    fatherName: 'Rakesh Goyal',
    motherName: 'Sunita Goyal',
  };
  p.contact = { email: 'harshit@example.com', alternateEmail: 'hg.alt@example.com', phoneCountryCode: '+91', phone: '9876512345', alternatePhone: '9123456780' };
  p.address = { line1: '12 MG Road', line2: 'Malviya Nagar', landmark: 'Near City Mall', city: 'Jaipur', state: 'Rajasthan', country: 'India', postalCode: '302017' };

  const btech = createEducationRecord('bachelors', true);
  Object.assign(btech, {
    institution: 'Manipal University Jaipur',
    degree: 'B.Tech',
    course: 'Bachelor of Technology',
    specialization: 'Computer Science and Engineering',
    enrollmentNumber: 'MUJ2021CS042',
    rollNumber: '21CS042',
    registrationNumber: '219301042',
    cgpa: '8.7',
    percentage: '84',
    startYear: '2021',
    endYear: '2025',
  });
  const twelfth = createEducationRecord('higher-secondary');
  Object.assign(twelfth, { institution: 'St. Xavier’s School', board: 'CBSE', percentage: '91.2', endYear: '2021', rollNumber: '1122334' });
  const tenth = createEducationRecord('secondary');
  Object.assign(tenth, { institution: 'St. Xavier’s School', board: 'CBSE', percentage: '94.6', endYear: '2019' });
  p.education = [btech, twelfth, tenth];

  p.professional.currentCompany = 'Acme Labs';
  p.professional.jobTitle = 'Software Engineer Intern';
  p.professional.experienceYears = 1;
  p.professional.employmentStatus = 'student';
  p.professional.skills = ['TypeScript', 'React', 'Python'];
  p.professional.linkedin = 'https://www.linkedin.com/in/harshitgoyal';
  p.professional.github = 'https://github.com/harshitgoyal';
  p.professional.portfolio = 'https://harshit.dev';
  p.professional.resumes = [{ id: 'doc_1', label: 'General', fileName: 'Harshit_Goyal_Resume.pdf', mimeType: 'application/pdf', size: 1000, addedAt: 0, isDefault: true }];
  p.professional.coverLetters = [{ id: 'cl_1', label: 'Default', content: 'Dear Hiring Manager, …', isDefault: true }];

  p.identification = { pan: 'ABCDE1234F', aadhaar: '234567890124', passportNumber: 'N1234567', passportExpiry: '2032-01-01', drivingLicense: 'RJ14 20210012345', voterId: 'ABC1234567' };

  const ec = createEmergencyContact();
  Object.assign(ec, { name: 'Rakesh Goyal', relationship: 'Father', phone: '9988776655', email: 'rakesh@example.com' });
  p.emergencyContacts = [ec];
  return p;
}
