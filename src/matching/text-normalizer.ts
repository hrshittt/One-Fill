/**
 * Text normalisation for field matching.
 *
 * Labels, placeholders and attribute names are turned into a canonical token sequence so that
 * "First Name *", "firstName", "candidate_first_name", "ctl00$cph$txtFirstName" and "fname"
 * all become `first name`. The same function is applied to catalog synonyms, so both sides
 * of every comparison share one vocabulary.
 */

export interface NormalizedText {
  /** Canonical tokens joined by single spaces. */
  text: string;
  tokens: string[];
  /** Tokens joined without spaces — lets "firstname" match "first name". */
  compact: string;
}

export const EMPTY_TEXT: NormalizedText = { text: '', tokens: [], compact: '' };

/** Multi-word phrases rewritten to a single canonical token before tokenisation. Order matters. */
const PHRASES: Array<[RegExp, string]> = [
  // Annotations that describe *where the value comes from*, not what it is: "Name (as per Aadhaar)".
  [/\(?\s*\bas\s+(?:per|in|on|mentioned in|printed on|shown on|appears on|given in|written in)\b[^)]*\)?/g, ' '],
  [/\b(?:dd|mm|yyyy|yy)(?:\s*[/.\- ]\s*(?:dd|mm|mmm|yyyy|yy))+\b/g, ' '],
  [/\bmother\s*tongue\b/g, ' mothertongue '],
  [/\bd\s?o\s?b\b/g, ' dob '],
  [/\bdate\s+(?:of\s+)?birth\b|\bbirth\s*date\b|\bbirthday\b|\bbday\b/g, ' dob '],
  [/\be\s+mail\b/g, ' email '],
  [/\b(?:zip|pin|postal|post)\s*code\b/g, ' postalcode '],
  [/\b(?:class|std|standard|grade)\s*(?:x|10|10th|tenth)\b/g, ' tenth '],
  [/\b(?:class|std|standard|grade)\s*(?:xii|12|12th|twelfth)\b/g, ' twelfth '],
  [/\b(?:higher|senior)\s+secondary\b/g, ' twelfth '],
  [/\bsecondary\s+(?:school|education|exam|examination|certificate)\b/g, ' tenth '],
  [/\b(?:10th|xth|ssc|sslc|matric|matriculation)\b/g, ' tenth '],
  [/\b(?:12th|xiith|hsc|hssc|puc|intermediate|plus\s+two|pre\s+university)\b/g, ' twelfth '],
  [/\bpost\s*graduat(?:e|ion)\b|\bmasters?\b|\bp\s?g\b/g, ' postgrad '],
  [/\bunder\s*graduat(?:e|ion)\b|\bbachelors?\b|\bu\s?g\b/g, ' undergrad '],
  [/\bwhats\s*app\b/g, ' whatsapp '],
  [/\blinked\s+in\b/g, ' linkedin '],
  [/\bgit\s+hub\b/g, ' github '],
  [/\bcurriculum\s+vitae\b|\bc\s?v\b/g, ' resume '],
  [/\bpass(?:ing|ed)?\s*out\b/g, ' passing '],
  [/\bin\s+case\s+of\s+emergency\b/g, ' emergency '],
  [/\bnext\s+of\s+kin\b/g, ' emergency '],
  [/\bone\s+time\s+(?:password|passcode|pin|code)\b/g, ' otp '],
];

/** Single-token abbreviations and spelling variants. Values may expand to several tokens. */
const TOKEN_MAP: Record<string, string> = {
  fname: 'first name',
  firstname: 'first name',
  givenname: 'given name',
  lname: 'last name',
  lastname: 'last name',
  familyname: 'family name',
  mname: 'middle name',
  middlename: 'middle name',
  fullname: 'full name',
  birthdate: 'dob',
  dateofbirth: 'dob',
  mob: 'mobile',
  mobno: 'mobile number',
  mobileno: 'mobile number',
  mobilenumber: 'mobile number',
  cell: 'mobile',
  cellphone: 'mobile',
  ph: 'phone',
  phn: 'phone',
  tel: 'phone',
  telephone: 'phone',
  phoneno: 'phone number',
  phonenumber: 'phone number',
  contactno: 'contact number',
  contactnumber: 'contact number',
  no: 'number',
  num: 'number',
  nbr: 'number',
  nr: 'number',
  nos: 'number',
  emailid: 'email',
  emailaddress: 'email',
  mail: 'email',
  addr: 'address',
  zip: 'postalcode',
  zipcode: 'postalcode',
  pin: 'postalcode',
  pincode: 'postalcode',
  postcode: 'postalcode',
  cntry: 'country',
  ctry: 'country',
  dist: 'district',
  yr: 'year',
  yrs: 'years',
  yop: 'passing year',
  univ: 'university',
  uni: 'university',
  inst: 'institute',
  clg: 'college',
  coll: 'college',
  qual: 'qualification',
  quali: 'qualification',
  edu: 'education',
  educational: 'education',
  spec: 'specialization',
  specialisation: 'specialization',
  specialization: 'specialization',
  dept: 'department',
  desig: 'designation',
  org: 'organization',
  organisation: 'organization',
  exp: 'experience',
  expr: 'experience',
  yoe: 'years experience',
  pct: 'percentage',
  perc: 'percentage',
  percent: 'percentage',
  gpa: 'cgpa',
  cpi: 'cgpa',
  cgpi: 'cgpa',
  sgpa: 'cgpa',
  licence: 'license',
  dl: 'driving license',
  adhar: 'aadhaar',
  aadhar: 'aadhaar',
  adhaar: 'aadhaar',
  uidai: 'aadhaar',
  enrol: 'enrollment',
  enroll: 'enrollment',
  enrolment: 'enrollment',
  enrolmentno: 'enrollment number',
  enrollmentno: 'enrollment number',
  reg: 'registration',
  regn: 'registration',
  regd: 'registration',
  regno: 'registration number',
  rollno: 'roll number',
  fathers: 'father',
  mothers: 'mother',
  passout: 'passing',
  gender: 'gender',
  linkedinurl: 'linkedin url',
  githuburl: 'github url',
  websiteurl: 'website url',
  portfoliourl: 'portfolio url',
};

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'as', 'per', 'your', 'you', 'my', 'our', 'please',
  'kindly', 'enter', 'provide', 'type', 'here', 'eg', 'example', 'required', 'optional', 'mandatory', 'field',
  'details', 'detail', 'information', 'info', 'and', 'or', 'is', 'are', 'be', 'this', 'with', 'what', 'which',
  'select', 'choose', 'pick', 'i', 'me', 'valid', 'confirm', 'confirmation', 'verify', 'retype', 'reenter', 're',
  'again', 'repeat', 'if', 'any', 'applicable', 'only', 'etc', 'fill', 'write', 'mention', 'specify', 'id', 'do',
  'not', 'we', 'will', 'use', 'can', 'reach',
]);

/**
 * Identifier noise from frameworks and naming conventions (txtName, ddlCountry, ctl00…),
 * plus role nouns ("candidate", "applicant") that don't change what is being asked.
 */
const NOISE = new Set([
  'txt', 'tb', 'ddl', 'drp', 'cmb', 'cbo', 'sel', 'lst', 'rbl', 'rdo', 'rb', 'chk', 'cb', 'inp', 'input', 'fld',
  'frm', 'form', 'ctl', 'ctl00', 'cph', 'val', 'value', 'data', 'candidate', 'candidates', 'applicant',
  'applicants', 'student', 'personal', 'control', 'textbox', 'dropdown', 'ng', 'js', 'el', 'app', 'lbl', 'label',
]);

/**
 * "contact" is filler in "Emergency contact" or "Contact email", but meaningful in
 * "Contact number" / "Contact name", so it is kept only before those nouns.
 */
const KEEP_CONTACT_BEFORE = new Set(['number', 'name', 'person', 'phone', 'mobile', 'email']);

export function normalizeText(raw: string | null | undefined): NormalizedText {
  if (!raw) return EMPTY_TEXT;
  let s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Split camelCase / PascalCase / letter→digit boundaries before lower-casing.
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\w)['’]s\b/g, '$1')
    .toLowerCase()
    .replace(/%/g, ' percentage ')
    .replace(/#/g, ' number ')
    .replace(/\+\s?2\b/g, ' twelfth ');

  s = s.replace(/[^a-z0-9()]+/g, ' ');
  for (const [pattern, replacement] of PHRASES) s = s.replace(pattern, replacement);
  s = s.replace(/[()]/g, ' ');

  const tokens: string[] = [];
  const rawTokens = s.split(/\s+/).filter(Boolean);
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i]!;
    if (token === 'contact') {
      const next = rawTokens[i + 1] ?? '';
      const nextWord = (TOKEN_MAP[next] ?? next).split(' ')[0]!;
      if (KEEP_CONTACT_BEFORE.has(nextWord)) tokens.push(token);
      continue;
    }
    const mapped = TOKEN_MAP[token] ?? token;
    for (const part of mapped.split(' ')) {
      if (STOPWORDS.has(part) || NOISE.has(part)) continue;
      if (tokens[tokens.length - 1] === part) continue;
      tokens.push(part);
    }
  }
  // Bare "10"/"12" next to school words ("txt10Board", "percentage_12") mean Class X / XII.
  if (tokens.some((t) => SCHOOL_CONTEXT.has(t))) {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === '10') tokens[i] = 'tenth';
      else if (tokens[i] === '12') tokens[i] = 'twelfth';
    }
  }
  return { text: tokens.join(' '), tokens, compact: tokens.join('') };
}

const SCHOOL_CONTEXT = new Set(['board', 'percentage', 'marks', 'school', 'passing', 'roll', 'cgpa', 'result', 'class', 'std', 'grade', 'aggregate']);

/**
 * Normalises HTML identifiers (name/id attributes). ASP.NET / JSF style hierarchical names
 * ("ctl00$ContentPlaceHolder1$txtFirstName", "form:j_idt12:firstName") keep only the last segment;
 * bracket notation ("applicant[address][city]") keeps all segments because nesting carries meaning.
 */
export function normalizeIdentifier(raw: string | null | undefined): NormalizedText {
  if (!raw) return EMPTY_TEXT;
  // ASP.NET WebForms container prefixes: "ctl00_ContentPlaceHolder1_txtName" → "txtName".
  let s = raw.replace(/(?:^|[_$])(?:ctl\d+|ContentPlaceHolder\d*|PlaceHolder\d*|MainContent|BodyContent)(?=[_$]|$)/gi, '$').replace(/^[_$]+/, '');
  if (/[$:]/.test(s)) s = s.split(/[$:]/).filter(Boolean).pop() ?? s;
  // Generated ids ("j_idt12", "mat-input-3", "react-select-2-input", GUID-like) carry no meaning.
  if (/^(?:j_idt\d+|mat-input-\d+|react-select-\d+-input|:r\w+:|[0-9a-f-]{16,})$/i.test(s)) return EMPTY_TEXT;
  s = s.replace(/\[(\d+)\]/g, ' ').replace(/[[\]._-]+/g, ' ');
  return normalizeText(s);
}

export function tokensToText(tokens: string[]): NormalizedText {
  return { text: tokens.join(' '), tokens, compact: tokens.join('') };
}

/** True when `needle` appears as a contiguous run inside `haystack`. */
export function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Lower-cased, accent-free, punctuation-free text for comparing option values ("Male" vs "male "). */
export function simplify(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}
