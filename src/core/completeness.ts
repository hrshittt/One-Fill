import type { ProfileSection } from '../matching/field-catalog';
import type { UserProfile } from '../types/profile';
import { primaryEducation } from './profile-values';

/**
 * Profile completeness: a checklist of the details forms ask for most often.
 * `priority` orders the "Complete your profile" suggestions (higher first).
 */

export interface CompletenessItem {
  id: string;
  /** Call-to-action label, e.g. "Add phone number". */
  label: string;
  section: ProfileSection;
  /** Element id in the profile editor to focus when the suggestion is clicked. */
  target: string;
  priority: number;
  done: boolean;
}

export interface Completeness {
  percent: number;
  completed: number;
  total: number;
  items: CompletenessItem[];
  /** Missing items, most useful first. */
  suggestions: CompletenessItem[];
}

type Check = Omit<CompletenessItem, 'done'> & { test: (p: UserProfile) => boolean };

const has = (s: string | null | undefined) => typeof s === 'string' && s.trim().length > 0;
const higherEd = (p: UserProfile) => primaryEducation(p);

const CHECKS: Check[] = [
  { id: 'firstName', label: 'Add your first name', section: 'personal', target: 'personal.firstName', priority: 100, test: (p) => has(p.personal.firstName) },
  { id: 'lastName', label: 'Add your last name', section: 'personal', target: 'personal.lastName', priority: 95, test: (p) => has(p.personal.lastName) },
  { id: 'dob', label: 'Add date of birth', section: 'personal', target: 'personal.dateOfBirth', priority: 80, test: (p) => has(p.personal.dateOfBirth) },
  { id: 'gender', label: 'Add gender', section: 'personal', target: 'personal.gender', priority: 60, test: (p) => has(p.personal.gender) },
  { id: 'nationality', label: 'Add nationality', section: 'personal', target: 'personal.nationality', priority: 50, test: (p) => has(p.personal.nationality) },
  { id: 'marital', label: 'Add marital status', section: 'personal', target: 'personal.maritalStatus', priority: 20, test: (p) => has(p.personal.maritalStatus) },
  { id: 'father', label: "Add father's name", section: 'personal', target: 'personal.fatherName', priority: 40, test: (p) => has(p.personal.fatherName) },
  { id: 'mother', label: "Add mother's name", section: 'personal', target: 'personal.motherName', priority: 35, test: (p) => has(p.personal.motherName) },

  { id: 'email', label: 'Add email address', section: 'contact', target: 'contact.email', priority: 98, test: (p) => has(p.contact.email) },
  { id: 'phone', label: 'Add phone number', section: 'contact', target: 'contact.phone', priority: 97, test: (p) => has(p.contact.phone) },
  { id: 'altPhone', label: 'Add alternate phone', section: 'contact', target: 'contact.alternatePhone', priority: 15, test: (p) => has(p.contact.alternatePhone) },

  { id: 'line1', label: 'Add street address', section: 'address', target: 'address.line1', priority: 70, test: (p) => has(p.address.line1) },
  { id: 'city', label: 'Add city', section: 'address', target: 'address.city', priority: 75, test: (p) => has(p.address.city) },
  { id: 'state', label: 'Add state', section: 'address', target: 'address.state', priority: 72, test: (p) => has(p.address.state) },
  { id: 'country', label: 'Add country', section: 'address', target: 'address.country', priority: 74, test: (p) => has(p.address.country) },
  { id: 'postal', label: 'Add ZIP / postal code', section: 'address', target: 'address.postalCode', priority: 71, test: (p) => has(p.address.postalCode) },

  { id: 'university', label: 'Add university', section: 'education', target: 'education', priority: 90, test: (p) => has(higherEd(p)?.institution) },
  { id: 'degree', label: 'Add degree', section: 'education', target: 'education', priority: 85, test: (p) => has(higherEd(p)?.degree) },
  { id: 'branch', label: 'Add branch / specialization', section: 'education', target: 'education', priority: 65, test: (p) => has(higherEd(p)?.specialization) },
  { id: 'gradYear', label: 'Add graduation year', section: 'education', target: 'education', priority: 68, test: (p) => has(higherEd(p)?.endYear) },
  { id: 'score', label: 'Add CGPA or percentage', section: 'education', target: 'education', priority: 62, test: (p) => has(higherEd(p)?.cgpa) || has(higherEd(p)?.percentage) },
  { id: 'studentIds', label: 'Add enrollment / roll number', section: 'education', target: 'education', priority: 30, test: (p) => { const e = higherEd(p); return has(e?.enrollmentNumber) || has(e?.rollNumber) || has(e?.registrationNumber); } },
  { id: 'tenth', label: 'Add 10th details', section: 'education', target: 'education', priority: 45, test: (p) => p.education.some((e) => e.level === 'secondary' && (has(e.percentage) || has(e.cgpa))) },
  { id: 'twelfth', label: 'Add 12th details', section: 'education', target: 'education', priority: 44, test: (p) => p.education.some((e) => e.level === 'higher-secondary' && (has(e.percentage) || has(e.cgpa))) },

  { id: 'company', label: 'Add current company or status', section: 'professional', target: 'professional.currentCompany', priority: 55, test: (p) => has(p.professional.currentCompany) || ['student', 'unemployed'].includes(p.professional.employmentStatus) },
  { id: 'title', label: 'Add job title', section: 'professional', target: 'professional.jobTitle', priority: 50, test: (p) => has(p.professional.jobTitle) || p.professional.employmentStatus === 'student' },
  { id: 'experience', label: 'Add years of experience', section: 'professional', target: 'professional.experienceYears', priority: 48, test: (p) => p.professional.experienceYears !== null },
  { id: 'skills', label: 'Add skills', section: 'professional', target: 'professional.skills', priority: 66, test: (p) => p.professional.skills.length > 0 },
  { id: 'linkedin', label: 'Add LinkedIn', section: 'professional', target: 'professional.linkedin', priority: 88, test: (p) => has(p.professional.linkedin) },
  { id: 'github', label: 'Add GitHub', section: 'professional', target: 'professional.github', priority: 42, test: (p) => has(p.professional.github) },
  { id: 'portfolio', label: 'Add portfolio / website', section: 'professional', target: 'professional.portfolio', priority: 25, test: (p) => has(p.professional.portfolio) || p.professional.links.some((l) => has(l.url)) },
  { id: 'resume', label: 'Add resume', section: 'professional', target: 'professional.resumes', priority: 87, test: (p) => p.professional.resumes.length > 0 },
  { id: 'cover', label: 'Add a cover letter', section: 'professional', target: 'professional.coverLetters', priority: 22, test: (p) => p.professional.coverLetters.some((c) => has(c.content)) },

  { id: 'id', label: 'Add an ID (PAN, Aadhaar, passport…)', section: 'identification', target: 'identification.pan', priority: 28, test: (p) => Object.values(p.identification).some(has) },
  { id: 'emergency', label: 'Add an emergency contact', section: 'emergency', target: 'emergency', priority: 38, test: (p) => p.emergencyContacts.some((c) => has(c.name) && has(c.phone)) },
];

export function computeCompleteness(profile: UserProfile): Completeness {
  const items = CHECKS.map(({ test, ...item }) => ({ ...item, done: test(profile) }));
  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  return {
    percent: Math.round((completed / total) * 100),
    completed,
    total,
    items,
    suggestions: items.filter((i) => !i.done).sort((a, b) => b.priority - a.priority),
  };
}
