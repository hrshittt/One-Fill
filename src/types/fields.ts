/**
 * Types shared between the content script (detection/filling), the matching engine
 * and the extension UI. Everything here must stay JSON-serialisable because it crosses
 * the content-script ⇄ extension boundary.
 */

/** Every profile value a web form field can be mapped to. */
export type FieldKey =
  // Personal
  | 'personal.firstName'
  | 'personal.middleName'
  | 'personal.lastName'
  | 'personal.fullName'
  | 'personal.dateOfBirth'
  | 'personal.dobDay'
  | 'personal.dobMonth'
  | 'personal.dobYear'
  | 'personal.age'
  | 'personal.placeOfBirth'
  | 'personal.gender'
  | 'personal.nationality'
  | 'personal.maritalStatus'
  | 'personal.fatherName'
  | 'personal.motherName'
  // Contact
  | 'contact.email'
  | 'contact.alternateEmail'
  | 'contact.phone'
  | 'contact.phoneCountryCode'
  | 'contact.alternatePhone'
  // Address
  | 'address.full'
  | 'address.line1'
  | 'address.line2'
  | 'address.landmark'
  | 'address.city'
  | 'address.state'
  | 'address.country'
  | 'address.postalCode'
  // Education (generic keys resolve against the primary record, or the record implied by context)
  | 'education.level'
  | 'education.university'
  | 'education.affiliatedUniversity'
  | 'education.degree'
  | 'education.course'
  | 'education.specialization'
  | 'education.enrollmentNumber'
  | 'education.rollNumber'
  | 'education.registrationNumber'
  | 'education.cgpa'
  | 'education.percentage'
  | 'education.startYear'
  | 'education.graduationYear'
  | 'education.tenthPercentage'
  | 'education.tenthBoard'
  | 'education.tenthYear'
  | 'education.tenthSchool'
  | 'education.twelfthPercentage'
  | 'education.twelfthBoard'
  | 'education.twelfthYear'
  | 'education.twelfthSchool'
  | 'education.schoolName'
  // Professional
  | 'professional.currentCompany'
  | 'professional.jobTitle'
  | 'professional.experienceYears'
  | 'professional.employmentStatus'
  | 'professional.noticePeriod'
  | 'professional.skills'
  | 'professional.linkedin'
  | 'professional.github'
  | 'professional.portfolio'
  | 'professional.resume'
  | 'professional.coverLetter'
  // Identification (sensitive)
  | 'identification.pan'
  | 'identification.aadhaar'
  | 'identification.passportNumber'
  | 'identification.passportExpiry'
  | 'identification.drivingLicense'
  | 'identification.voterId'
  // Emergency contact
  | 'emergency.name'
  | 'emergency.relationship'
  | 'emergency.phone'
  | 'emergency.email';

export type ControlKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'month'
  | 'url'
  | 'textarea'
  | 'select'
  | 'radio-group'
  | 'checkbox'
  | 'checkbox-group'
  | 'file';

export interface FieldOption {
  /** Registry id of the radio/checkbox element, or the option index (as string) for <select>. */
  id: string;
  text: string;
  value: string;
  disabled: boolean;
}

/**
 * A form control as seen by the detector. Deliberately contains NO current values from the page —
 * only whether the field is already filled — so page data never flows back into the extension.
 */
export interface DetectedField {
  /** Registry id, unique within its frame. */
  id: string;
  /** Frame the field lives in (assigned by the extension after collecting results). */
  frameId: number;
  kind: ControlKind;
  tag: 'input' | 'select' | 'textarea';
  inputType: string;
  name: string;
  htmlId: string;
  autocomplete: string;
  placeholder: string;
  ariaLabel: string;
  title: string;
  /** Best explicit label: <label for>, wrapping <label>, aria-labelledby, or group legend for radios. */
  label: string;
  /** Text immediately preceding the field in the layout (table cells, sibling spans…). */
  nearbyText: string;
  /** Nearest section heading / fieldset legend — used as context for disambiguation. */
  sectionText: string;
  /** Framework/testing attributes that often carry semantic names (formcontrolname, data-automation-id…). */
  attrHints: string;
  maxLength: number | null;
  pattern: string;
  inputMode: string;
  required: boolean;
  multiple: boolean;
  accept: string;
  options: FieldOption[];
  hasValue: boolean;
  /** Index of the containing <form>, or -1 when the control is not inside a form. */
  formIndex: number;
  /** Document order of the field within its frame. */
  order: number;
}

export type MatchSource =
  | 'user' // the user confirmed/overrode this mapping on this site
  | 'autocomplete' // Level 1: HTML autocomplete semantics
  | 'name' // Level 2: known field names / exact label phrases
  | 'keyword' // Level 3: keyword matching
  | 'fuzzy' // Level 4: fuzzy string similarity
  | 'context' // Level 5: surrounding labels / section context / option sets
  | 'resolver'; // external resolver (e.g. a future LLM fallback)

export type BlockReason =
  | 'password'
  | 'otp'
  | 'captcha'
  | 'payment'
  | 'consent'
  | 'search'
  | 'account';

export interface MatchCandidate {
  key: FieldKey;
  confidence: number;
  source: MatchSource;
}

export interface FieldMatch {
  fieldId: string;
  frameId: number;
  /** Human-readable label for the field as detected on the page. */
  detectedLabel: string;
  key: FieldKey | null;
  confidence: number;
  source: MatchSource | null;
  /** Alternative interpretations, best first (includes the chosen key). */
  candidates: MatchCandidate[];
  /** Qualifiers found on the field or its section (e.g. "tenth", "postgrad") — used to pick records. */
  qualifiers: string[];
  /** Set when a field must never be auto-filled (passwords, OTPs, payment data, consent boxes…). */
  blocked: BlockReason | null;
}

/** Serializable description of a file to attach to an <input type=file>. */
export interface FilePayload {
  name: string;
  type: string;
  dataUrl: string;
}

export type FillInstruction =
  | { fieldId: string; action: 'text'; value: string }
  | { fieldId: string; action: 'select'; optionIndex: number }
  | { fieldId: string; action: 'radio'; optionId: string }
  | { fieldId: string; action: 'checkbox'; checked: boolean }
  | { fieldId: string; action: 'checkbox-group'; checkIds: string[] }
  | { fieldId: string; action: 'file'; file: FilePayload };

export interface FillOutcome {
  fieldId: string;
  ok: boolean;
  /** Short machine-readable reason for failures (never contains the value). */
  reason?: 'not-found' | 'disabled' | 'readonly' | 'rejected' | 'unsupported' | 'error';
}

export interface FrameFillReport {
  filled: number;
  outcomes: FillOutcome[];
}

/** Result of scanning one frame. */
export interface FrameScan {
  frameId: number;
  url: string;
  hostname: string;
  title: string;
  isTop: boolean;
  fields: DetectedField[];
}
