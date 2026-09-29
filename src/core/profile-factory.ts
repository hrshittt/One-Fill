import type {
  CoverLetter,
  EducationLevel,
  EducationRecord,
  EmergencyContact,
  ProfileLink,
  ProfileMeta,
  ResumeDocument,
  StoredProfile,
  UserProfile,
} from '../types/profile';
import { createId } from '../utils/ids';

export function createEmptyProfile(): UserProfile {
  return {
    personal: {
      firstName: '',
      middleName: '',
      lastName: '',
      fullName: '',
      dateOfBirth: '',
      placeOfBirth: '',
      gender: '',
      nationality: '',
      maritalStatus: '',
      fatherName: '',
      motherName: '',
    },
    contact: { email: '', alternateEmail: '', phoneCountryCode: '', phone: '', alternatePhone: '' },
    address: { line1: '', line2: '', landmark: '', city: '', state: '', country: '', postalCode: '' },
    education: [],
    professional: {
      currentCompany: '',
      jobTitle: '',
      experienceYears: null,
      employmentStatus: '',
      noticePeriod: '',
      skills: [],
      linkedin: '',
      github: '',
      portfolio: '',
      links: [],
      resumes: [],
      coverLetters: [],
    },
    identification: { pan: '', aadhaar: '', passportNumber: '', passportExpiry: '', drivingLicense: '', voterId: '' },
    emergencyContacts: [],
  };
}

export function createEducationRecord(level: EducationLevel = 'bachelors', isPrimary = false): EducationRecord {
  return {
    id: createId('edu'),
    level,
    institution: '',
    university: '',
    board: '',
    degree: '',
    course: '',
    specialization: '',
    enrollmentNumber: '',
    rollNumber: '',
    registrationNumber: '',
    cgpa: '',
    cgpaScale: '10',
    percentage: '',
    startYear: '',
    endYear: '',
    isPrimary,
  };
}

export function createEmergencyContact(): EmergencyContact {
  return { id: createId('ec'), name: '', relationship: '', phone: '', email: '' };
}

export function createProfileLink(): ProfileLink {
  return { id: createId('link'), label: '', url: '' };
}

export function createCoverLetter(isDefault = false): CoverLetter {
  return { id: createId('cl'), label: 'Cover letter', content: '', isDefault };
}

export function createProfileMeta(name = 'Personal', emoji = '👤'): ProfileMeta {
  const now = Date.now();
  return { id: createId('profile'), name, emoji, createdAt: now, updatedAt: now };
}

export function createStoredProfile(name?: string, emoji?: string): StoredProfile {
  return { meta: createProfileMeta(name, emoji), data: createEmptyProfile() };
}

// ---------------------------------------------------------------------------
// Sanitisation — rebuilds a profile from untrusted input (imports, older schema versions),
// keeping only known keys, coercing types and capping lengths.
// ---------------------------------------------------------------------------

const MAX_TEXT = 500;
const MAX_LONG_TEXT = 20_000;
const MAX_LIST = 50;

const EDUCATION_LEVELS: readonly EducationLevel[] = [
  'secondary',
  'higher-secondary',
  'diploma',
  'bachelors',
  'masters',
  'doctorate',
  'other',
];

function str(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' ? String(value) : '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, MAX_LIST).map(obj) : [];
}

function pickStrings<T extends object>(template: T, source: Record<string, unknown>): T {
  const out = { ...template } as Record<string, unknown>;
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') out[key] = str(source[key]);
  }
  return out as T;
}

export function sanitizeProfile(input: unknown): UserProfile {
  const src = obj(input);
  const base = createEmptyProfile();

  const personal = pickStrings(base.personal, obj(src.personal));
  personal.gender = oneOf(personal.gender, ['', 'male', 'female', 'non-binary', 'other', 'prefer-not-to-say'], '');
  personal.maritalStatus = oneOf(personal.maritalStatus, ['', 'single', 'married', 'divorced', 'widowed', 'separated'], '');

  const profSrc = obj(src.professional);
  const professional = pickStrings(base.professional, profSrc);
  professional.employmentStatus = oneOf(
    professional.employmentStatus,
    ['', 'employed', 'self-employed', 'unemployed', 'student', 'freelancer'],
    '',
  );
  const exp = Number(profSrc.experienceYears);
  professional.experienceYears =
    profSrc.experienceYears === null || profSrc.experienceYears === '' || !Number.isFinite(exp) ? null : Math.max(0, Math.min(exp, 60));
  professional.skills = Array.isArray(profSrc.skills)
    ? profSrc.skills.slice(0, 100).map((s) => str(s, 60).trim()).filter(Boolean)
    : [];
  professional.links = list(profSrc.links).map((l) => ({ id: str(l.id) || createId('link'), label: str(l.label, 60), url: str(l.url) }));
  professional.resumes = list(profSrc.resumes).map(
    (r): ResumeDocument => ({
      id: str(r.id) || createId('doc'),
      label: str(r.label, 80),
      fileName: str(r.fileName, 200),
      mimeType: str(r.mimeType, 100),
      size: Number.isFinite(Number(r.size)) ? Number(r.size) : 0,
      addedAt: Number.isFinite(Number(r.addedAt)) ? Number(r.addedAt) : Date.now(),
      isDefault: r.isDefault === true,
    }),
  );
  professional.coverLetters = list(profSrc.coverLetters).map(
    (c): CoverLetter => ({
      id: str(c.id) || createId('cl'),
      label: str(c.label, 80),
      content: str(c.content, MAX_LONG_TEXT),
      isDefault: c.isDefault === true,
    }),
  );

  const education = list(src.education).map((e) => {
    const record = pickStrings(createEducationRecord(), e);
    record.id = str(e.id) || createId('edu');
    record.level = oneOf(e.level, EDUCATION_LEVELS, 'other');
    record.isPrimary = e.isPrimary === true;
    return record;
  });
  ensureSinglePrimary(education);

  const emergencyContacts = list(src.emergencyContacts).map((c) => {
    const contact = pickStrings(createEmergencyContact(), c);
    contact.id = str(c.id) || createId('ec');
    return contact;
  });

  return {
    personal,
    contact: pickStrings(base.contact, obj(src.contact)),
    address: pickStrings(base.address, obj(src.address)),
    education,
    professional,
    identification: pickStrings(base.identification, obj(src.identification)),
    emergencyContacts,
  };
}

/** Exactly one higher-education record should be primary (the first bachelor's-or-above by default). */
export function ensureSinglePrimary(records: EducationRecord[]): void {
  const primaries = records.filter((r) => r.isPrimary);
  if (primaries.length === 1) return;
  records.forEach((r) => (r.isPrimary = false));
  const preferred =
    records.find((r) => ['masters', 'bachelors', 'doctorate', 'diploma'].includes(r.level)) ?? records[0];
  if (preferred) preferred.isPrimary = true;
}

export function sanitizeMeta(input: unknown): ProfileMeta {
  const src = obj(input);
  const fallback = createProfileMeta();
  return {
    id: str(src.id, 80) || fallback.id,
    name: str(src.name, 40).trim() || fallback.name,
    emoji: str(src.emoji, 8) || fallback.emoji,
    createdAt: Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : fallback.createdAt,
    updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : fallback.updatedAt,
  };
}
