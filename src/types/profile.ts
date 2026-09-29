/**
 * One-Fill profile data model.
 *
 * Design notes
 * - Every scalar field is a string that defaults to '' (never undefined). This keeps UI binding,
 *   import sanitisation and completeness scoring free of undefined-checks.
 * - Repeatable data (education, emergency contacts, resumes, links…) lives in arrays of records
 *   that each carry a stable `id`, so the UI can reorder/edit them and a record can be marked primary.
 * - Resume *files* are not stored inside the profile. The profile keeps metadata only and the bytes
 *   live under a separate storage key (see storage/document-storage.ts) so reading a profile stays cheap.
 * - Profiles are wrapped in `StoredProfile` (meta + data) so multiple profiles
 *   ("Personal", "Job applications", …) can be supported without changing this shape.
 */

export const SCHEMA_VERSION = 1;

export type Gender = '' | 'male' | 'female' | 'non-binary' | 'other' | 'prefer-not-to-say';
export type MaritalStatus = '' | 'single' | 'married' | 'divorced' | 'widowed' | 'separated';
export type EmploymentStatus =
  | ''
  | 'employed'
  | 'self-employed'
  | 'unemployed'
  | 'student'
  | 'freelancer';

export type EducationLevel =
  | 'secondary' // 10th / SSC / Class X
  | 'higher-secondary' // 12th / HSC / Class XII
  | 'diploma'
  | 'bachelors'
  | 'masters'
  | 'doctorate'
  | 'other';

export interface PersonalInfo {
  firstName: string;
  middleName: string;
  lastName: string;
  /** Optional explicit override. When empty, the full name is derived from first/middle/last. */
  fullName: string;
  /** ISO 8601 date (yyyy-mm-dd). */
  dateOfBirth: string;
  placeOfBirth: string;
  gender: Gender;
  nationality: string;
  maritalStatus: MaritalStatus;
  fatherName: string;
  motherName: string;
}

export interface ContactInfo {
  email: string;
  alternateEmail: string;
  /** E.g. "+91". Stored separately so forms with a split country-code field can be filled. */
  phoneCountryCode: string;
  /** National number without country code, e.g. "9876543210". */
  phone: string;
  alternatePhone: string;
}

export interface Address {
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface EducationRecord {
  id: string;
  level: EducationLevel;
  /** College / University / School name. */
  institution: string;
  /** Affiliating university (for colleges) or board (for schools, e.g. CBSE). */
  university: string;
  board: string;
  degree: string;
  course: string;
  specialization: string;
  enrollmentNumber: string;
  rollNumber: string;
  registrationNumber: string;
  cgpa: string;
  /** Scale the CGPA is measured on, e.g. "10" or "4". */
  cgpaScale: string;
  percentage: string;
  startYear: string;
  /** Graduation / passing year. */
  endYear: string;
  /** The primary record answers generic questions such as "University" or "Degree". */
  isPrimary: boolean;
}

export interface ResumeDocument {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  addedAt: number;
  isDefault: boolean;
}

export interface CoverLetter {
  id: string;
  label: string;
  content: string;
  isDefault: boolean;
}

export interface ProfileLink {
  id: string;
  label: string;
  url: string;
}

export interface ProfessionalInfo {
  currentCompany: string;
  jobTitle: string;
  /** Total years of experience (may be fractional). null when not provided. */
  experienceYears: number | null;
  employmentStatus: EmploymentStatus;
  noticePeriod: string;
  skills: string[];
  linkedin: string;
  github: string;
  portfolio: string;
  /** Additional professional profiles (LeetCode, Behance, Kaggle, …). */
  links: ProfileLink[];
  resumes: ResumeDocument[];
  coverLetters: CoverLetter[];
}

/** Government identifiers. Every field here is treated as SENSITIVE and is never filled silently. */
export interface Identification {
  pan: string;
  aadhaar: string;
  passportNumber: string;
  passportExpiry: string;
  drivingLicense: string;
  voterId: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export interface UserProfile {
  personal: PersonalInfo;
  contact: ContactInfo;
  address: Address;
  education: EducationRecord[];
  professional: ProfessionalInfo;
  identification: Identification;
  emergencyContacts: EmergencyContact[];
}

export interface ProfileMeta {
  id: string;
  /** Display name of the profile, e.g. "Personal" or "Job applications". */
  name: string;
  emoji: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProfile {
  meta: ProfileMeta;
  data: UserProfile;
}

export interface ProfileIndex {
  activeProfileId: string;
  profiles: ProfileMeta[];
}
