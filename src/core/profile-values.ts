import { EDUCATION_LEVEL_LABELS } from '../matching/dictionaries';
import { callingCodeFor } from '../matching/option-matcher';
import { EDUCATION_LEVEL_QUALIFIERS, type QualifierId } from '../matching/qualifiers';
import type { FieldKey } from '../types/fields';
import type { EducationLevel, EducationRecord, UserProfile } from '../types/profile';
import { ageOn, parseIsoDate } from '../utils/validation';

/**
 * Resolves the value a profile holds for a field key, including derived values
 * (full name from parts, DOB day/month/year, age, joined address, calling code from country).
 */

export type ProfileValue =
  | {
      type: 'text';
      /** Human-readable value used for text inputs. */
      text: string;
      /** Canonical value used for option matching when it differs (e.g. "male" vs "Male"). */
      matchText?: string;
    }
  | { type: 'list'; items: string[] }
  | { type: 'file'; documentId: string; fileName: string };

const text = (value: string | number | null | undefined, matchText?: string): ProfileValue | null => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s ? { type: 'text', text: s, ...(matchText ? { matchText } : {}) } : null;
};

const LEVEL_RANK: Record<EducationLevel, number> = {
  secondary: 1,
  'higher-secondary': 2,
  diploma: 3,
  bachelors: 4,
  masters: 5,
  doctorate: 6,
  other: 0,
};

export function primaryEducation(profile: UserProfile): EducationRecord | undefined {
  return (
    profile.education.find((r) => r.isPrimary) ??
    [...profile.education].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0]
  );
}

/**
 * Picks the education record a field refers to. A level qualifier on the field or its section
 * ("10th", "PG") selects that record; if the user has no such record the result is undefined
 * rather than silently falling back to another degree.
 */
export function educationFor(profile: UserProfile, qualifiers: readonly string[]): EducationRecord | undefined {
  for (const q of qualifiers) {
    const level = EDUCATION_LEVEL_QUALIFIERS[q as QualifierId];
    if (level) return profile.education.find((r) => r.level === level) ?? (level === 'masters' ? profile.education.find((r) => r.level === 'doctorate') : undefined);
  }
  return primaryEducation(profile);
}

const byLevel = (profile: UserProfile, level: EducationLevel) => profile.education.find((r) => r.level === level);

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function fullNameOf(profile: UserProfile): string {
  const p = profile.personal;
  return p.fullName.trim() || [p.firstName, p.middleName, p.lastName].map((s) => s.trim()).filter(Boolean).join(' ');
}

export function resolveProfileValue(
  profile: UserProfile,
  key: FieldKey,
  qualifiers: readonly string[] = [],
  today: Date = new Date(),
): ProfileValue | null {
  const { personal: p, contact: c, address: a, professional: pro, identification: id } = profile;
  const dob = parseIsoDate(p.dateOfBirth);
  const edu = () => educationFor(profile, qualifiers);
  const emergency = profile.emergencyContacts[0];

  switch (key) {
    case 'personal.firstName': return text(p.firstName);
    case 'personal.middleName': return text(p.middleName);
    case 'personal.lastName': return text(p.lastName);
    case 'personal.fullName': return text(fullNameOf(profile));
    case 'personal.dateOfBirth': return dob ? text(p.dateOfBirth) : null;
    case 'personal.dobDay': return dob ? text(String(dob.getUTCDate()).padStart(2, '0')) : null;
    case 'personal.dobMonth': return dob ? text(String(dob.getUTCMonth() + 1).padStart(2, '0')) : null;
    case 'personal.dobYear': return dob ? text(String(dob.getUTCFullYear())) : null;
    case 'personal.age': return dob ? text(String(ageOn(dob, today))) : null;
    case 'personal.placeOfBirth': return text(p.placeOfBirth);
    case 'personal.gender': return p.gender ? text(titleCase(p.gender), p.gender) : null;
    case 'personal.nationality': return text(p.nationality);
    case 'personal.maritalStatus': return p.maritalStatus ? text(titleCase(p.maritalStatus), p.maritalStatus) : null;
    case 'personal.fatherName': return text(p.fatherName);
    case 'personal.motherName': return text(p.motherName);

    case 'contact.email': return text(c.email);
    case 'contact.alternateEmail': return text(c.alternateEmail);
    case 'contact.phone': return text(c.phone);
    case 'contact.phoneCountryCode': return text(c.phoneCountryCode || callingCodeFor(a.country) || '');
    case 'contact.alternatePhone': return text(c.alternatePhone);

    case 'address.full': {
      const cityLine = [a.city, [a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return text([a.line1, a.line2, a.landmark, cityLine, a.country].map((s) => s.trim()).filter(Boolean).join(', '));
    }
    case 'address.line1': return text(a.line1);
    case 'address.line2': return text(a.line2);
    case 'address.landmark': return text(a.landmark);
    case 'address.city': return text(a.city);
    case 'address.state': return text(a.state);
    case 'address.country': return text(a.country);
    case 'address.postalCode': return text(a.postalCode);

    case 'education.level': {
      const highest = [...profile.education].sort((x, y) => LEVEL_RANK[y.level] - LEVEL_RANK[x.level])[0];
      return highest ? text(EDUCATION_LEVEL_LABELS[highest.level] ?? highest.level, highest.level) : null;
    }
    case 'education.university': return text(edu()?.institution);
    case 'education.affiliatedUniversity': return text(edu()?.university || edu()?.institution);
    case 'education.degree': return text(edu()?.degree);
    case 'education.course': return text(edu()?.course || edu()?.degree);
    case 'education.specialization': return text(edu()?.specialization);
    case 'education.enrollmentNumber': return text(edu()?.enrollmentNumber);
    case 'education.rollNumber': return text(edu()?.rollNumber);
    case 'education.registrationNumber': return text(edu()?.registrationNumber);
    case 'education.cgpa': return text(edu()?.cgpa);
    case 'education.percentage': return text(edu()?.percentage);
    case 'education.startYear': return text(edu()?.startYear);
    case 'education.graduationYear': return text(edu()?.endYear);
    case 'education.tenthPercentage': return text(byLevel(profile, 'secondary')?.percentage || byLevel(profile, 'secondary')?.cgpa);
    case 'education.tenthBoard': return text(byLevel(profile, 'secondary')?.board || byLevel(profile, 'secondary')?.university);
    case 'education.tenthYear': return text(byLevel(profile, 'secondary')?.endYear);
    case 'education.tenthSchool': return text(byLevel(profile, 'secondary')?.institution);
    case 'education.twelfthPercentage': return text(byLevel(profile, 'higher-secondary')?.percentage || byLevel(profile, 'higher-secondary')?.cgpa);
    case 'education.twelfthBoard': return text(byLevel(profile, 'higher-secondary')?.board || byLevel(profile, 'higher-secondary')?.university);
    case 'education.twelfthYear': return text(byLevel(profile, 'higher-secondary')?.endYear);
    case 'education.twelfthSchool': return text(byLevel(profile, 'higher-secondary')?.institution);
    case 'education.schoolName':
      return text(byLevel(profile, 'higher-secondary')?.institution || byLevel(profile, 'secondary')?.institution);

    case 'professional.currentCompany': return text(pro.currentCompany);
    case 'professional.jobTitle': return text(pro.jobTitle);
    case 'professional.experienceYears': return pro.experienceYears === null ? null : text(String(pro.experienceYears));
    case 'professional.employmentStatus':
      return pro.employmentStatus ? text(titleCase(pro.employmentStatus), pro.employmentStatus) : null;
    case 'professional.noticePeriod': return text(pro.noticePeriod);
    case 'professional.skills': return pro.skills.length ? { type: 'list', items: [...pro.skills] } : null;
    case 'professional.linkedin': return text(pro.linkedin);
    case 'professional.github': return text(pro.github);
    case 'professional.portfolio': return text(pro.portfolio);
    case 'professional.resume': {
      const resume = pro.resumes.find((r) => r.isDefault) ?? pro.resumes[0];
      return resume ? { type: 'file', documentId: resume.id, fileName: resume.fileName } : null;
    }
    case 'professional.coverLetter': {
      const letter = pro.coverLetters.find((l) => l.isDefault) ?? pro.coverLetters[0];
      return text(letter?.content);
    }

    case 'identification.pan': return text(id.pan.toUpperCase());
    case 'identification.aadhaar': return text(id.aadhaar);
    case 'identification.passportNumber': return text(id.passportNumber.toUpperCase());
    case 'identification.passportExpiry': return parseIsoDate(id.passportExpiry) ? text(id.passportExpiry) : null;
    case 'identification.drivingLicense': return text(id.drivingLicense.toUpperCase());
    case 'identification.voterId': return text(id.voterId.toUpperCase());

    case 'emergency.name': return text(emergency?.name);
    case 'emergency.relationship': return text(emergency?.relationship);
    case 'emergency.phone': return text(emergency?.phone);
    case 'emergency.email': return text(emergency?.email);
  }
}
