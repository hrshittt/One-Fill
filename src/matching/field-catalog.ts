import type { FieldKey } from '../types/fields';
import type { QualifierId } from './qualifiers';
import { normalizeText, type NormalizedText } from './text-normalizer';

/**
 * The field catalog: everything the matcher knows about each mappable profile value.
 *
 * Synonyms are written in plain English and normalised with the same pipeline as page text,
 * so "Date of Birth", "DOB" and "birthday" all collapse to the token `dob` on both sides.
 * A synonym can carry a weight (0–1) when it is only a weak indicator (e.g. "district" → city).
 */

export type ProfileSection =
  | 'personal'
  | 'contact'
  | 'address'
  | 'education'
  | 'professional'
  | 'identification'
  | 'emergency';

export type ValueType =
  | 'name'
  | 'text'
  | 'email'
  | 'phone'
  | 'date'
  | 'number'
  | 'year'
  | 'url'
  | 'enum'
  | 'longtext'
  | 'list'
  | 'file'
  | 'id';

export type OptionSet =
  | 'gender'
  | 'marital'
  | 'country'
  | 'nationality'
  | 'state'
  | 'callingCode'
  | 'month'
  | 'educationLevel'
  | 'degree'
  | 'employment'
  | 'numeric';

type Synonym = string | readonly [string, number];

export interface FieldDefinition {
  key: FieldKey;
  label: string;
  section: ProfileSection;
  valueType: ValueType;
  synonyms: readonly Synonym[];
  /** At least one of these qualifiers must be on the label or in the section context. */
  requires?: readonly QualifierId[];
  /** Qualifiers that are expected and do not penalise (they are stripped before phrase matching). */
  allows?: readonly QualifierId[];
  /** Tokens that make this key very unlikely when present on the field's own label. */
  exclude?: readonly string[];
  /** Tokens that match on their own once qualifiers are stripped ("Father" → father's name). */
  aloneTokens?: readonly string[];
  /** Reliability multiplier for labels that are inherently ambiguous (e.g. "Registration number"). */
  prior?: number;
  /** Tokens (label or section) that confirm the ambiguous reading and lift `prior` to 1. */
  boost?: readonly string[];
  /** Never filled without explicit confirmation. */
  sensitive?: boolean;
  optionSet?: OptionSet;
}

/** Words that mean a "name" field is about something other than a person. */
const NOT_A_PERSON = [
  'company', 'college', 'university', 'institute', 'institution', 'school', 'bank', 'branch', 'course', 'project',
  'event', 'team', 'product', 'file', 'account', 'card', 'business', 'organization', 'board', 'hospital', 'pet',
  'city', 'country', 'state', 'street', 'village', 'district', 'degree', 'program', 'programme', 'job', 'position',
  'role', 'domain', 'host', 'brand', 'device', 'group', 'club', 'department', 'designation', 'exam', 'subject',
  'certificate', 'award', 'publication', 'employer', 'place', 'plan', 'package', 'website', 'site', 'page', 'channel',
  'holder', 'owner', 'firm', 'store', 'shop', 'building', 'society', 'apartment', 'hostel', 'area', 'locality',
  'town', 'examination', 'test', 'centre', 'center', 'venue', 'award', 'scholarship', 'title', 'occupation',
];

const ACADEMIC = [
  'university', 'college', 'institute', 'institution', 'academic', 'academics', 'education', 'school', 'exam',
  'examination', 'semester', 'course', 'enrollment', 'admission', 'degree', 'undergrad', 'postgrad', 'tenth',
  'twelfth', 'board', 'marks', 'result', 'qualification',
];

const EDU_ALL: readonly QualifierId[] = ['undergrad', 'postgrad', 'diploma', 'tenth', 'twelfth'];
const EDU_HIGHER: readonly QualifierId[] = ['undergrad', 'postgrad', 'diploma'];

export const FIELD_DEFINITIONS: readonly FieldDefinition[] = [
  // ── Personal ────────────────────────────────────────────────────────────────
  {
    key: 'personal.firstName', label: 'First name', section: 'personal', valueType: 'name',
    synonyms: ['first name', 'given name', 'forename', 'first', 'fore name', 'name first', 'christian name', ['first given name', 0.95]],
    exclude: NOT_A_PERSON,
  },
  {
    key: 'personal.middleName', label: 'Middle name', section: 'personal', valueType: 'name',
    synonyms: ['middle name', 'middle initial', 'middle', 'additional name', 'name middle'],
    exclude: NOT_A_PERSON,
  },
  {
    key: 'personal.lastName', label: 'Last name', section: 'personal', valueType: 'name',
    synonyms: ['last name', 'surname', 'family name', 'last', 'sur name', 'name last', ['family', 0.8]],
    exclude: NOT_A_PERSON,
  },
  {
    key: 'personal.fullName', label: 'Full name', section: 'personal', valueType: 'name',
    synonyms: ['name', 'full name', 'complete name', 'legal name', 'name full', 'full legal name', 'name in full', 'person name', 'employee name', 'your name'],
    exclude: [...NOT_A_PERSON, 'first', 'last', 'middle', 'surname', 'given', 'family', 'initial', 'initials', 'maiden'],
  },
  {
    key: 'personal.dateOfBirth', label: 'Date of birth', section: 'personal', valueType: 'date',
    synonyms: ['dob', 'birth'],
    exclude: ['place', 'city', 'country', 'state', 'town', 'day', 'month', 'year', 'certificate', 'proof', 'time', 'district'],
  },
  {
    key: 'personal.dobDay', label: 'Birth day (DD)', section: 'personal', valueType: 'number',
    synonyms: ['day', 'dd', 'date'], requires: ['dob'], optionSet: 'numeric',
  },
  {
    key: 'personal.dobMonth', label: 'Birth month (MM)', section: 'personal', valueType: 'enum',
    synonyms: ['month', 'mm', 'mon'], requires: ['dob'], optionSet: 'month',
  },
  {
    key: 'personal.dobYear', label: 'Birth year (YYYY)', section: 'personal', valueType: 'year',
    synonyms: ['year', 'yyyy', 'yy'], requires: ['dob'], optionSet: 'numeric',
  },
  {
    key: 'personal.age', label: 'Age', section: 'personal', valueType: 'number',
    synonyms: ['age', 'age years', 'current age'],
    exclude: ['limit', 'group', 'range', 'proof', 'relaxation', 'category'],
    optionSet: 'numeric',
  },
  {
    key: 'personal.placeOfBirth', label: 'Place of birth', section: 'personal', valueType: 'text',
    synonyms: ['place birth', 'birth place', 'birthplace', 'city birth', 'town birth', ['country birth', 0.8]],
  },
  {
    key: 'personal.gender', label: 'Gender', section: 'personal', valueType: 'enum',
    synonyms: ['gender', 'sex', 'gender identity'], optionSet: 'gender',
  },
  {
    key: 'personal.nationality', label: 'Nationality', section: 'personal', valueType: 'enum',
    synonyms: ['nationality', 'citizenship', 'citizen', 'country citizenship'],
    exclude: ['dual', 'proof'], optionSet: 'nationality',
  },
  {
    key: 'personal.maritalStatus', label: 'Marital status', section: 'personal', valueType: 'enum',
    synonyms: ['marital status', 'marital', 'married', 'relationship status', 'civil status'], optionSet: 'marital',
  },
  {
    key: 'personal.fatherName', label: "Father's name", section: 'personal', valueType: 'name',
    synonyms: ['name', 'full name', 'guardian name'], requires: ['father'], allows: ['guardian'], aloneTokens: ['father'],
    exclude: ['occupation', 'profession', 'income', 'first', 'last', 'middle', 'designation'],
  },
  {
    key: 'personal.motherName', label: "Mother's name", section: 'personal', valueType: 'name',
    synonyms: ['name', 'full name', 'maiden name'], requires: ['mother'], aloneTokens: ['mother'],
    exclude: ['occupation', 'profession', 'income', 'first', 'last', 'middle', 'designation', 'mothertongue'],
  },

  // ── Contact ─────────────────────────────────────────────────────────────────
  {
    key: 'contact.email', label: 'Email', section: 'contact', valueType: 'email',
    synonyms: ['email', 'email address', 'mail', 'primary email'],
  },
  {
    key: 'contact.alternateEmail', label: 'Alternate email', section: 'contact', valueType: 'email',
    synonyms: ['email', 'email address'], requires: ['alternate'],
  },
  {
    key: 'contact.phone', label: 'Phone number', section: 'contact', valueType: 'phone',
    synonyms: [
      'phone', 'mobile', 'phone number', 'mobile number', 'contact number', 'whatsapp', 'whatsapp number', 'mobile phone',
      'contact phone', 'primary phone', 'primary mobile', 'phone mobile', 'mobile phone number', ['contact', 0.75],
    ],
    exclude: ['code', 'extension', 'ext', 'country', 'otp', 'verification', 'isd', 'std', 'dial'],
  },
  {
    key: 'contact.phoneCountryCode', label: 'Phone country code', section: 'contact', valueType: 'enum',
    synonyms: ['country code', 'dial code', 'isd code', 'isd', 'calling code', 'phone code', 'country calling code', 'mobile code', 'phone country code', 'phone country'],
    optionSet: 'callingCode',
  },
  {
    key: 'contact.alternatePhone', label: 'Alternate phone', section: 'contact', valueType: 'phone',
    synonyms: ['phone', 'mobile', 'phone number', 'mobile number', 'contact number'],
    requires: ['alternate'], aloneTokens: ['landline'], exclude: ['code', 'extension', 'ext'],
  },

  // ── Address ─────────────────────────────────────────────────────────────────
  {
    key: 'address.full', label: 'Full address', section: 'address', valueType: 'longtext',
    synonyms: ['address', 'full address', 'complete address', 'address details', 'residential address'],
    allows: ['addressType'],
    exclude: ['line', '1', '2', '3', 'email', 'web', 'ip', 'city', 'state', 'country', 'postalcode', 'landmark', 'proof', 'street', 'mac', 'wallet'],
  },
  {
    key: 'address.line1', label: 'Address line 1', section: 'address', valueType: 'text',
    synonyms: [
      'address line 1', 'address 1', 'line 1', 'street', 'street address', 'street address 1', 'address line one',
      'house number', 'flat number', 'house', 'flat', 'building', 'door number', 'house flat number', 'street name',
      'flat house number building', 'address street', ['premise', 0.8],
    ],
    allows: ['addressType'], exclude: ['2', '3', 'email', 'city', 'state', 'country', 'two', 'three'],
  },
  {
    key: 'address.line2', label: 'Address line 2', section: 'address', valueType: 'text',
    synonyms: [
      'address line 2', 'address 2', 'line 2', 'street address 2', 'apartment', 'apt', 'suite', 'unit', 'apartment suite',
      'locality', 'area', 'area locality', 'address line two', 'sector', 'colony', 'street 2', ['road', 0.8],
    ],
    allows: ['addressType'], exclude: ['1', '3', 'email', 'code'],
  },
  {
    key: 'address.landmark', label: 'Landmark', section: 'address', valueType: 'text',
    synonyms: ['landmark', 'nearby landmark', 'near', 'address line 3', 'address 3', 'line 3'], allows: ['addressType'],
  },
  {
    key: 'address.city', label: 'City', section: 'address', valueType: 'text',
    synonyms: ['city', 'town', 'city town', 'town city', 'city village', 'village', 'municipality', ['district', 0.78], ['city district', 0.85], ['location', 0.6]],
    allows: ['addressType'], exclude: ['birth', 'college', 'university', 'school', 'preferred', 'job'],
  },
  {
    key: 'address.state', label: 'State', section: 'address', valueType: 'enum',
    synonyms: ['state', 'province', 'region', 'state province', 'state region', 'state ut', 'union territory', 'state union territory', ['county', 0.7]],
    allows: ['addressType'], exclude: ['birth', 'marital', 'employment', 'college', 'university', 'status'], optionSet: 'state',
  },
  {
    key: 'address.country', label: 'Country', section: 'address', valueType: 'enum',
    synonyms: ['country', 'country region', 'nation', 'country residence', 'residence country'],
    allows: ['addressType'], exclude: ['code', 'birth', 'citizenship', 'dial', 'phone', 'mobile', 'calling', 'issue', 'issuing', 'isd'],
    optionSet: 'country',
  },
  {
    key: 'address.postalCode', label: 'ZIP / Postal code', section: 'address', valueType: 'text',
    synonyms: ['postalcode', 'postal', 'postal index number'], allows: ['addressType'],
  },

  // ── Education ───────────────────────────────────────────────────────────────
  {
    key: 'education.level', label: 'Highest qualification', section: 'education', valueType: 'enum',
    synonyms: [
      'highest qualification', 'education level', 'level education', 'highest education', 'qualification level',
      'education qualification', 'highest degree', 'current education', ['education', 0.8], ['qualification', 0.72],
    ],
    allows: EDU_HIGHER, optionSet: 'educationLevel',
  },
  {
    key: 'education.university', label: 'University / College', section: 'education', valueType: 'text',
    synonyms: [
      'university', 'college', 'institute', 'institution', 'university name', 'college name', 'institute name',
      'institution name', 'name university', 'name college', 'name institute', 'name institution', 'university college',
      'college university', 'university institute', 'college institute', 'alma mater', 'education institution',
      'school university', ['school', 0.9],
    ],
    allows: EDU_HIGHER,
    exclude: [
      'number', 'roll', 'registration', 'enrollment', 'year', 'percentage', 'cgpa', 'city', 'state', 'address', 'code',
      'email', 'website', 'location', 'country', 'affiliated', 'affiliating', 'board', 'type', 'category', 'rank', 'phone', 'postalcode',
    ],
  },
  {
    key: 'education.affiliatedUniversity', label: 'Affiliating university', section: 'education', valueType: 'text',
    synonyms: ['affiliated university', 'affiliating university', 'university affiliated', 'affiliation', 'affiliated'],
    allows: EDU_HIGHER,
  },
  {
    key: 'education.degree', label: 'Degree', section: 'education', valueType: 'enum',
    synonyms: ['degree', 'degree name', 'name degree', 'degree program', 'degree type', 'degree course', ['program', 0.85], ['programme', 0.85], ['qualification', 0.75]],
    allows: EDU_HIGHER, exclude: ['year', 'percentage', 'cgpa', 'university', 'college', 'certificate', 'level', 'highest'],
    optionSet: 'degree',
  },
  {
    key: 'education.course', label: 'Course', section: 'education', valueType: 'text',
    synonyms: ['course', 'course name', 'name course', 'program name', 'programme name', 'course study', 'course program'],
    allows: EDU_ALL, exclude: ['code', 'duration', 'fee', 'fees', 'year', 'type', 'mode'],
  },
  {
    key: 'education.specialization', label: 'Branch / Specialization', section: 'education', valueType: 'text',
    synonyms: [
      'specialization', 'branch', 'major', 'stream', 'discipline', 'study', 'department', 'branch specialization',
      'area specialization', 'concentration', 'major specialization', ['subject', 0.7], ['subjects', 0.7],
    ],
    allows: EDU_ALL, exclude: ['bank', 'ifsc', 'code', 'minor'],
  },
  {
    key: 'education.enrollmentNumber', label: 'Enrollment number', section: 'education', valueType: 'id',
    synonyms: ['enrollment number', 'enrollment', 'enrollment code'], allows: EDU_ALL, prior: 0.9, boost: ACADEMIC,
  },
  {
    key: 'education.rollNumber', label: 'Roll number', section: 'education', valueType: 'id',
    synonyms: ['roll number', 'roll', 'exam roll number', 'board roll number', 'university roll number', ['seat number', 0.8]],
    allows: EDU_ALL, prior: 0.92, boost: ACADEMIC,
  },
  {
    key: 'education.registrationNumber', label: 'Registration number', section: 'education', valueType: 'id',
    synonyms: ['registration number', 'registration', 'university registration number', 'registration code'],
    allows: EDU_ALL, prior: 0.72, boost: ACADEMIC, exclude: ['vehicle', 'company', 'gst', 'business', 'mobile', 'phone', 'email', 'date', 'fee'],
  },
  {
    key: 'education.cgpa', label: 'CGPA', section: 'education', valueType: 'number',
    synonyms: ['cgpa', 'grade point average', 'cumulative grade point average', 'cgpa score', 'grade points', ['grades', 0.6], ['grade', 0.6]],
    allows: EDU_HIGHER,
  },
  {
    key: 'education.percentage', label: 'Percentage', section: 'education', valueType: 'number',
    synonyms: [
      'percentage', 'aggregate', 'aggregate percentage', 'marks', 'percentage marks', 'marks percentage', 'overall percentage',
      'aggregate marks', ['marks obtained', 0.85], ['score', 0.7], ['result', 0.6],
    ],
    allows: EDU_HIGHER, exclude: ['total', 'maximum', 'max', 'out'],
  },
  {
    key: 'education.startYear', label: 'Start year', section: 'education', valueType: 'year',
    synonyms: ['start year', 'year joining', 'joining year', 'admission year', 'year admission', 'from year', 'year start', 'starting year', 'commencement year', 'start date'],
    allows: EDU_HIGHER, optionSet: 'numeric',
  },
  {
    key: 'education.graduationYear', label: 'Graduation year', section: 'education', valueType: 'year',
    synonyms: [
      'graduation year', 'year graduation', 'passing year', 'year passing', 'completion year', 'year completion',
      'graduating year', 'expected graduation', 'expected graduation year', 'grad year', 'end year', 'year end', 'batch',
      'to year', ['graduation date', 0.8], ['year', 0.55],
    ],
    allows: EDU_HIGHER, exclude: ['birth', 'dob', 'start', 'joining', 'admission'], optionSet: 'numeric',
  },
  {
    key: 'education.tenthPercentage', label: '10th percentage', section: 'education', valueType: 'number',
    synonyms: ['percentage', 'marks', 'aggregate', 'marks percentage', 'percentage marks', ['cgpa', 0.85], ['marks obtained', 0.85], ['score', 0.8], ['grade', 0.7], ['result', 0.7]],
    requires: ['tenth'],
  },
  {
    key: 'education.tenthBoard', label: '10th board', section: 'education', valueType: 'text',
    synonyms: ['board', 'board name', 'examination board', 'board education', 'name board', 'board university'],
    requires: ['tenth'],
  },
  {
    key: 'education.tenthYear', label: '10th passing year', section: 'education', valueType: 'year',
    synonyms: ['year', 'passing year', 'year passing', 'completion year', 'year completion'], requires: ['tenth'], optionSet: 'numeric',
  },
  {
    key: 'education.tenthSchool', label: '10th school', section: 'education', valueType: 'text',
    synonyms: ['school', 'school name', 'name school', 'institution', 'institute', 'institution name'], requires: ['tenth'],
  },
  {
    key: 'education.twelfthPercentage', label: '12th percentage', section: 'education', valueType: 'number',
    synonyms: ['percentage', 'marks', 'aggregate', 'marks percentage', 'percentage marks', ['cgpa', 0.85], ['marks obtained', 0.85], ['score', 0.8], ['grade', 0.7], ['result', 0.7]],
    requires: ['twelfth'],
  },
  {
    key: 'education.twelfthBoard', label: '12th board', section: 'education', valueType: 'text',
    synonyms: ['board', 'board name', 'examination board', 'board education', 'name board', 'board university'],
    requires: ['twelfth'],
  },
  {
    key: 'education.twelfthYear', label: '12th passing year', section: 'education', valueType: 'year',
    synonyms: ['year', 'passing year', 'year passing', 'completion year', 'year completion'], requires: ['twelfth'], optionSet: 'numeric',
  },
  {
    key: 'education.twelfthSchool', label: '12th school / college', section: 'education', valueType: 'text',
    synonyms: ['school', 'school name', 'name school', 'institution', 'institute', 'institution name', 'school college', ['college', 0.85]],
    requires: ['twelfth'],
  },
  {
    key: 'education.schoolName', label: 'School name', section: 'education', valueType: 'text',
    synonyms: ['school', 'school name', 'name school', 'high school', 'high school name'], prior: 0.95,
  },

  // ── Professional ────────────────────────────────────────────────────────────
  {
    key: 'professional.currentCompany', label: 'Current company', section: 'professional', valueType: 'text',
    synonyms: [
      'company', 'company name', 'current company', 'employer', 'current employer', 'organization', 'organization name',
      'name organization', 'employer name', 'name company', 'name employer', 'current organization', 'firm',
    ],
    exclude: [
      'address', 'city', 'location', 'website', 'email', 'phone', 'size', 'type', 'industry', 'previous', 'past', 'code',
      'registration', 'number', 'designation', 'role', 'title', 'position', 'sector', 'url', 'domain',
    ],
  },
  {
    key: 'professional.jobTitle', label: 'Job title', section: 'professional', valueType: 'text',
    synonyms: [
      'job title', 'title', 'designation', 'current designation', 'position', 'role', 'current role', 'current position',
      'job role', 'current job title', 'position title', 'job designation', 'current title', ['occupation', 0.8], ['profession', 0.75], ['headline', 0.6],
    ],
    exclude: ['applied', 'applying', 'desired', 'preferred', 'expected', 'target', 'looking', 'interested', 'salutation', 'honorific', 'project', 'thesis', 'paper', 'book', 'course'],
  },
  {
    key: 'professional.experienceYears', label: 'Years of experience', section: 'professional', valueType: 'number',
    synonyms: [
      'experience', 'years experience', 'total experience', 'work experience', 'experience years', 'total years experience',
      'professional experience', 'industry experience', 'total work experience', ['relevant experience', 0.85], ['years', 0.6],
    ],
    exclude: ['month', 'months', 'description', 'summary', 'company', 'title', 'letter', 'certificate', 'details', 'describe'],
    optionSet: 'numeric',
  },
  {
    key: 'professional.employmentStatus', label: 'Employment status', section: 'professional', valueType: 'enum',
    synonyms: ['employment status', 'current status', 'working status', 'work status', 'status employment', 'currently employed', ['employment type', 0.7], ['employment', 0.75]],
    optionSet: 'employment',
  },
  {
    key: 'professional.noticePeriod', label: 'Notice period', section: 'professional', valueType: 'text',
    synonyms: ['notice period', 'notice', 'notice period days', ['joining time', 0.7], ['availability', 0.6], ['available join', 0.7]],
  },
  {
    key: 'professional.skills', label: 'Skills', section: 'professional', valueType: 'list',
    synonyms: ['skills', 'key skills', 'technical skills', 'skill set', 'skillset', 'core skills', 'expertise', 'competencies', 'technologies', 'tech stack', 'primary skills', 'skill'],
    exclude: ['level', 'rating', 'years', 'proficiency'],
  },
  {
    key: 'professional.linkedin', label: 'LinkedIn', section: 'professional', valueType: 'url',
    synonyms: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin profile url', 'linkedin link'],
  },
  {
    key: 'professional.github', label: 'GitHub', section: 'professional', valueType: 'url',
    synonyms: ['github', 'github url', 'github profile', 'github link', 'github username'],
  },
  {
    key: 'professional.portfolio', label: 'Portfolio / Website', section: 'professional', valueType: 'url',
    synonyms: [
      'portfolio', 'portfolio url', 'website', 'personal website', 'website url', 'portfolio website', 'personal site',
      'blog', 'homepage', 'web site', 'portfolio link', ['other website', 0.8], ['url', 0.6], ['link', 0.5],
    ],
    exclude: ['company', 'linkedin', 'github', 'twitter', 'facebook', 'instagram', 'youtube', 'organization', 'employer', 'college', 'university', 'job'],
  },
  {
    key: 'professional.resume', label: 'Resume / CV', section: 'professional', valueType: 'file',
    synonyms: ['resume', 'resume upload', 'upload resume', 'attach resume', 'resume file', 'resume cv', 'attach', ['upload', 0.6], ['file', 0.5], ['document', 0.5]],
    exclude: ['cover', 'photo', 'picture', 'image', 'signature', 'transcript', 'marksheet', 'certificate', 'id', 'proof', 'aadhaar', 'pan', 'passport'],
  },
  {
    key: 'professional.coverLetter', label: 'Cover letter', section: 'professional', valueType: 'longtext',
    synonyms: ['cover letter', 'covering letter', 'motivation letter', 'letter motivation', 'cover note', ['message hiring manager', 0.6], ['why want join', 0.45]],
  },

  // ── Identification (sensitive) ───────────────────────────────────────────────
  {
    key: 'identification.pan', label: 'PAN', section: 'identification', valueType: 'id', sensitive: true,
    synonyms: ['pan', 'pan number', 'pan card', 'pan card number', 'permanent account number', 'income tax pan'],
  },
  {
    key: 'identification.aadhaar', label: 'Aadhaar', section: 'identification', valueType: 'id', sensitive: true,
    synonyms: ['aadhaar', 'aadhaar number', 'aadhaar card', 'aadhaar card number', 'unique identification number', 'uidai number', ['uid number', 0.8], ['uid', 0.75]],
  },
  {
    key: 'identification.passportNumber', label: 'Passport number', section: 'identification', valueType: 'id', sensitive: true,
    synonyms: ['passport', 'passport number'],
    exclude: ['expiry', 'expiration', 'issue', 'issued', 'valid', 'validity', 'place', 'country', 'photo', 'size', 'date', 'type', 'file'],
  },
  {
    key: 'identification.passportExpiry', label: 'Passport expiry', section: 'identification', valueType: 'date', sensitive: true,
    synonyms: ['passport expiry', 'passport expiry date', 'passport valid until', 'passport validity', 'passport expiration', 'passport date expiry', 'expiry date passport', 'passport valid till'],
  },
  {
    key: 'identification.drivingLicense', label: 'Driving licence', section: 'identification', valueType: 'id', sensitive: true,
    synonyms: ['driving license', 'driving license number', 'driver license', 'drivers license', 'driver license number', ['license number', 0.75]],
    exclude: ['expiry', 'issue', 'validity', 'class', 'category', 'date', 'file'],
  },
  {
    key: 'identification.voterId', label: 'Voter ID', section: 'identification', valueType: 'id', sensitive: true,
    synonyms: ['voter', 'voter card', 'voter number', 'epic', 'epic number', 'voter identity card', 'election card', 'electoral card'],
  },

  // ── Emergency contact ───────────────────────────────────────────────────────
  {
    key: 'emergency.name', label: 'Emergency contact name', section: 'emergency', valueType: 'name',
    synonyms: ['name', 'full name', 'contact name', 'contact person', 'person name', 'contact person name'],
    requires: ['emergency'], exclude: ['relationship', 'relation', 'phone', 'mobile', 'email', 'address', 'number'],
  },
  {
    key: 'emergency.relationship', label: 'Emergency contact relationship', section: 'emergency', valueType: 'text',
    synonyms: ['relationship', 'relation', 'relationship applicant', 'relation applicant', 'relationship contact', 'relation contact'],
    requires: ['emergency'],
  },
  {
    key: 'emergency.phone', label: 'Emergency contact phone', section: 'emergency', valueType: 'phone',
    synonyms: ['phone', 'mobile', 'phone number', 'mobile number', 'contact number', ['number', 0.85], ['contact', 0.8]],
    requires: ['emergency'],
  },
  {
    key: 'emergency.email', label: 'Emergency contact email', section: 'emergency', valueType: 'email',
    synonyms: ['email', 'email address'], requires: ['emergency'],
  },
];

export interface PreparedSynonym {
  norm: NormalizedText;
  weight: number;
}

export interface PreparedDefinition extends FieldDefinition {
  prepared: PreparedSynonym[];
  excludeSet: ReadonlySet<string>;
  boostSet: ReadonlySet<string>;
}

let preparedCache: PreparedDefinition[] | null = null;

/** Catalog with synonyms normalised once and cached. */
export function getPreparedCatalog(): PreparedDefinition[] {
  preparedCache ??= FIELD_DEFINITIONS.map((def) => ({
    ...def,
    prepared: def.synonyms
      .map((s) => (typeof s === 'string' ? { norm: normalizeText(s), weight: 1 } : { norm: normalizeText(s[0]), weight: s[1] }))
      .filter((s) => s.norm.tokens.length > 0),
    excludeSet: new Set(def.exclude ?? []),
    boostSet: new Set(def.boost ?? []),
  }));
  return preparedCache;
}

const BY_KEY = new Map<FieldKey, FieldDefinition>(FIELD_DEFINITIONS.map((d) => [d.key, d]));

export function getFieldDefinition(key: FieldKey): FieldDefinition | undefined {
  return BY_KEY.get(key);
}

export function isSensitiveKey(key: FieldKey | null | undefined): boolean {
  return !!key && BY_KEY.get(key)?.sensitive === true;
}

export function fieldLabel(key: FieldKey): string {
  return BY_KEY.get(key)?.label ?? key;
}

export const SECTION_LABELS: Record<ProfileSection, string> = {
  personal: 'Personal',
  contact: 'Contact',
  address: 'Address',
  education: 'Education',
  professional: 'Professional',
  identification: 'Identification',
  emergency: 'Emergency contact',
};

export function isFieldKey(value: string): value is FieldKey {
  return BY_KEY.has(value as FieldKey);
}
