import type { UserProfile } from '../types/profile';
import { validators, type ValidationProblem, type ValidatorName } from '../utils/validation';
import { getPath, pathPattern } from './paths';

/** Which validator applies to which profile path (array indexes written as "*"). */
export const VALIDATORS: Record<string, ValidatorName> = {
  'personal.firstName': 'name',
  'personal.middleName': 'name',
  'personal.lastName': 'name',
  'personal.fatherName': 'name',
  'personal.motherName': 'name',
  'personal.dateOfBirth': 'dateOfBirth',
  'contact.email': 'email',
  'contact.alternateEmail': 'email',
  'contact.phone': 'phone',
  'contact.alternatePhone': 'phone',
  'contact.phoneCountryCode': 'countryCode',
  'address.postalCode': 'postalCode',
  'professional.linkedin': 'url',
  'professional.github': 'url',
  'professional.portfolio': 'url',
  'professional.experienceYears': 'experience',
  'professional.links.*.url': 'url',
  'identification.pan': 'pan',
  'identification.aadhaar': 'aadhaar',
  'identification.passportNumber': 'passport',
  'identification.voterId': 'voterId',
  'identification.drivingLicense': 'drivingLicense',
  'education.*.cgpa': 'cgpa',
  'education.*.percentage': 'percentage',
  'education.*.startYear': 'year',
  'education.*.endYear': 'year',
  'emergencyContacts.*.name': 'name',
  'emergencyContacts.*.phone': 'phone',
  'emergencyContacts.*.email': 'email',
};

export function validatePath(profile: UserProfile, path: string): ValidationProblem | null {
  const name = VALIDATORS[pathPattern(path)];
  if (!name) return null;
  const raw = getPath(profile, path);
  const value = raw === null || raw === undefined ? '' : String(raw).trim();
  return validators[name](value);
}

/** Validates every known path in the profile. */
export function validateProfile(profile: UserProfile): Map<string, ValidationProblem> {
  const problems = new Map<string, ValidationProblem>();
  const check = (path: string) => {
    const problem = validatePath(profile, path);
    if (problem) problems.set(path, problem);
  };
  for (const pattern of Object.keys(VALIDATORS)) {
    if (!pattern.includes('*')) {
      check(pattern);
      continue;
    }
    const [listPath, field] = pattern.split('.*.') as [string, string];
    const list = getPath(profile, listPath);
    if (Array.isArray(list)) list.forEach((_, i) => check(`${listPath}.${i}.${field}`));
  }
  return problems;
}
