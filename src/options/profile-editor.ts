import { createCoverLetter, createEducationRecord, createEmergencyContact, createProfileLink, ensureSinglePrimary } from '../core/profile-factory';
import { CALLING_CODES, COUNTRIES, DEGREES, DEMONYMS, EDUCATION_LEVEL_LABELS, INDIAN_STATES, US_STATES } from '../matching/dictionaries';
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, readFileAsDataUrl, saveDocument } from '../storage/document-storage';
import type { EducationLevel, EducationRecord, UserProfile } from '../types/profile';
import { h, type Child } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { toast } from '../ui/theme';
import { createId } from '../utils/ids';
import type { ValidationProblem } from '../utils/validation';
import { getPath, setPath } from './paths';
import { validatePath } from './profile-validation';

/**
 * The profile editor: one scrolling page of section cards bound to a draft profile.
 * Scalar fields update the draft in place on input; structural edits (adding/removing records)
 * ask the host to re-render.
 */

export interface EditorContext {
  draft: UserProfile;
  errors: Map<string, ValidationProblem>;
  markDirty(): void;
  rerender(focusPath?: string): void;
  /** Track uploaded files so an unsaved upload can be cleaned up on discard. */
  onDocumentAdded(id: string): void;
}

type Width = 'full' | 'half' | 'third' | 'two-thirds';

interface FieldSpec {
  path: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'url' | 'select' | 'textarea';
  placeholder?: string;
  hint?: string;
  options?: ReadonlyArray<readonly [string, string]>;
  datalist?: string;
  autocomplete?: string;
  width?: Width;
  sensitive?: boolean;
  inputMode?: string;
  transform?: 'upper' | 'url' | 'number';
}

export const PROFILE_SECTIONS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'personal', label: 'Personal', icon: 'user' },
  { id: 'contact', label: 'Contact', icon: 'mail' },
  { id: 'address', label: 'Address', icon: 'mapPin' },
  { id: 'education', label: 'Education', icon: 'graduation' },
  { id: 'professional', label: 'Professional', icon: 'briefcase' },
  { id: 'identification', label: 'Identification', icon: 'idCard' },
  { id: 'emergency', label: 'Emergency contacts', icon: 'heartPulse' },
];

const GENDER_OPTIONS = [['', 'Select…'], ['male', 'Male'], ['female', 'Female'], ['non-binary', 'Non-binary'], ['other', 'Other'], ['prefer-not-to-say', 'Prefer not to say']] as const;
const MARITAL_OPTIONS = [['', 'Select…'], ['single', 'Single'], ['married', 'Married'], ['divorced', 'Divorced'], ['widowed', 'Widowed'], ['separated', 'Separated']] as const;
const EMPLOYMENT_OPTIONS = [['', 'Select…'], ['employed', 'Employed'], ['self-employed', 'Self-employed'], ['freelancer', 'Freelancer'], ['student', 'Student'], ['unemployed', 'Not currently employed']] as const;
const LEVEL_OPTIONS = (Object.entries(EDUCATION_LEVEL_LABELS) as Array<[EducationLevel, string]>).map(([v, l]) => [v, l] as const);

// ── Datalists (shared suggestions for free-text inputs) ────────────────────────

export function datalists(): HTMLElement {
  const list = (id: string, values: string[]) => h('datalist', { id }, values.map((v) => h('option', { value: v })));
  const countries = COUNTRIES.map((c) => c[0]!);
  return h(
    'div',
    { attrs: { hidden: true } },
    list('dl-countries', countries),
    list('dl-nationalities', [...Object.values(DEMONYMS).map((d) => d[0]!), ...countries]),
    list('dl-states', [...INDIAN_STATES.map((s) => s[0]!), ...US_STATES.map((s) => s[0]!)]),
    list('dl-degrees', DEGREES.map((d) => d[0]!)),
    list('dl-boards', ['CBSE', 'ICSE', 'ISC', 'State Board', 'IB', 'IGCSE', 'NIOS']),
    list('dl-streams', ['Science (PCM)', 'Science (PCB)', 'Commerce', 'Arts / Humanities']),
    list('dl-relationships', ['Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Guardian', 'Friend', 'Relative']),
    list('dl-notice', ['Immediate', '15 days', '30 days', '60 days', '90 days']),
  );
}

// ── Field rendering ────────────────────────────────────────────────────────────

function coerce(raw: string, spec: FieldSpec): unknown {
  if (spec.transform === 'number') {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

function field(ctx: EditorContext, spec: FieldSpec): HTMLElement {
  const id = `f-${spec.path}`;
  const errorId = `${id}-error`;
  const raw = getPath(ctx.draft, spec.path);
  const value = raw === null || raw === undefined ? '' : String(raw);
  const problem = ctx.errors.get(spec.path);

  const common = {
    id,
    class: [spec.type === 'select' ? 'select' : spec.type === 'textarea' ? 'textarea' : 'input', problem?.level === 'error' && 'invalid', spec.sensitive && 'masked'],
    attrs: {
      'aria-describedby': problem || spec.hint ? errorId : null,
      'aria-invalid': problem?.level === 'error' ? 'true' : null,
      autocomplete: spec.autocomplete ?? 'off',
      spellcheck: spec.sensitive ? 'false' : null,
      inputmode: spec.inputMode ?? null,
      list: spec.datalist ?? null,
      'data-path': spec.path,
    },
  };

  let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (spec.type === 'select') {
    control = h('select', common, (spec.options ?? []).map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  } else if (spec.type === 'textarea') {
    control = h('textarea', { ...common, value, placeholder: spec.placeholder ?? '', rows: 6 });
  } else {
    control = h('input', {
      ...common,
      type: spec.type === 'url' ? 'url' : spec.type === 'number' ? 'number' : spec.type === 'date' ? 'date' : spec.type ?? 'text',
      value,
      placeholder: spec.placeholder ?? '',
      step: spec.type === 'number' ? 'any' : undefined,
    });
  }

  const message = h('div', { id: errorId, class: ['field-message', problem?.level] }, problem?.message ?? spec.hint ?? '');
  const showProblem = (p: ValidationProblem | null) => {
    if (p) ctx.errors.set(spec.path, p);
    else ctx.errors.delete(spec.path);
    control.classList.toggle('invalid', p?.level === 'error');
    control.setAttribute('aria-invalid', String(p?.level === 'error'));
    message.textContent = p?.message ?? spec.hint ?? '';
    message.className = ['field-message', p?.level ?? ''].join(' ').trim();
  };

  control.addEventListener(spec.type === 'select' ? 'change' : 'input', () => {
    setPath(ctx.draft, spec.path, coerce(control.value, spec));
    ctx.markDirty();
    if (ctx.errors.has(spec.path)) showProblem(validatePath(ctx.draft, spec.path));
  });
  control.addEventListener('blur', () => {
    let v = control.value.trim();
    if (spec.transform === 'upper') v = v.toUpperCase();
    if (spec.transform === 'url' && v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) v = `https://${v}`;
    if (v !== control.value && spec.type !== 'select') {
      control.value = v;
      setPath(ctx.draft, spec.path, coerce(v, spec));
      ctx.markDirty();
    }
    showProblem(validatePath(ctx.draft, spec.path));
  });

  let input: Child = control;
  if (spec.sensitive) {
    const reveal = h('button', { class: 'reveal', type: 'button', attrs: { 'aria-label': `Show ${spec.label}`, 'aria-pressed': 'false' } }, icon('eye', 16));
    reveal.addEventListener('click', () => {
      const masked = control.classList.toggle('masked');
      reveal.setAttribute('aria-pressed', String(!masked));
      reveal.replaceChildren(icon(masked ? 'eye' : 'eyeOff', 16));
    });
    input = h('div', { class: 'input-wrap' }, control, reveal);
  }

  return h('div', { class: ['field', `w-${spec.width ?? 'full'}`] }, h('label', { class: 'field-label', htmlFor: id }, spec.label), input, message);
}

function grid(...children: Child[]): HTMLElement {
  return h('div', { class: 'grid' }, ...children);
}

function sectionCard(id: string, iconName: IconName, title: string, description: string, ...body: Child[]): HTMLElement {
  return h(
    'section',
    { class: 'card section', id: `section-${id}`, attrs: { 'aria-labelledby': `title-${id}` } },
    h(
      'header',
      { class: 'section-head' },
      h('div', { class: 'section-icon' }, icon(iconName, 19)),
      h('div', null, h('h2', { id: `title-${id}` }, title), h('p', { class: 'muted' }, description)),
    ),
    h('div', { class: 'section-body' }, ...body),
  );
}

function removeButton(label: string, onClick: () => void): HTMLElement {
  return h('button', { class: 'icon-btn danger-hover', type: 'button', attrs: { 'aria-label': label, title: label }, on: { click: onClick } }, icon('trash', 16));
}

function addButton(label: string, onClick: () => void): HTMLElement {
  return h('button', { class: 'btn btn-secondary btn-sm', type: 'button', on: { click: onClick } }, icon('plus', 15), label);
}

// ── Sections ───────────────────────────────────────────────────────────────────

function personalSection(ctx: EditorContext): HTMLElement {
  return sectionCard(
    'personal',
    'user',
    'Personal information',
    'Your name and basic details, as they appear on official documents.',
    grid(
      field(ctx, { path: 'personal.firstName', label: 'First name', width: 'third', autocomplete: 'given-name' }),
      field(ctx, { path: 'personal.middleName', label: 'Middle name', width: 'third', autocomplete: 'additional-name' }),
      field(ctx, { path: 'personal.lastName', label: 'Last name', width: 'third', autocomplete: 'family-name' }),
      field(ctx, { path: 'personal.fullName', label: 'Full name (optional)', hint: 'Leave empty to use first, middle and last name.' }),
      field(ctx, { path: 'personal.dateOfBirth', label: 'Date of birth', type: 'date', width: 'third', autocomplete: 'bday' }),
      field(ctx, { path: 'personal.gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS, width: 'third' }),
      field(ctx, { path: 'personal.maritalStatus', label: 'Marital status', type: 'select', options: MARITAL_OPTIONS, width: 'third' }),
      field(ctx, { path: 'personal.nationality', label: 'Nationality', datalist: 'dl-nationalities', placeholder: 'Indian', width: 'half' }),
      field(ctx, { path: 'personal.placeOfBirth', label: 'Place of birth', width: 'half' }),
      field(ctx, { path: 'personal.fatherName', label: "Father's name", width: 'half' }),
      field(ctx, { path: 'personal.motherName', label: "Mother's name", width: 'half' }),
    ),
  );
}

function callingCodeOptions(): Array<readonly [string, string]> {
  const seen = new Set<string>();
  const list: Array<readonly [string, string]> = [['', 'Code']];
  for (const [country, code] of Object.entries(CALLING_CODES).sort((a, b) => a[0].localeCompare(b[0]))) {
    const key = `${code}|${country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push([code, `${code} ${country}`]);
  }
  return list;
}

function contactSection(ctx: EditorContext): HTMLElement {
  const codeSelect = field(ctx, { path: 'contact.phoneCountryCode', label: 'Code', type: 'select', options: callingCodeOptions(), width: 'third' });
  // A saved code that isn't in the list still shows up.
  const select = codeSelect.querySelector('select')!;
  const current = ctx.draft.contact.phoneCountryCode;
  if (current && !Array.from(select.options).some((o) => o.value === current)) select.append(h('option', { value: current, selected: true }, current));

  return sectionCard(
    'contact',
    'mail',
    'Contact information',
    'How forms can reach you.',
    grid(
      field(ctx, { path: 'contact.email', label: 'Email', type: 'email', width: 'half', autocomplete: 'email', placeholder: 'you@example.com' }),
      field(ctx, { path: 'contact.alternateEmail', label: 'Alternate email', type: 'email', width: 'half' }),
      h('div', { class: 'field w-half phone-group' }, codeSelect, field(ctx, { path: 'contact.phone', label: 'Phone number', type: 'tel', width: 'two-thirds', autocomplete: 'tel-national', inputMode: 'tel', placeholder: '98765 43210' })),
      field(ctx, { path: 'contact.alternatePhone', label: 'Alternate phone', type: 'tel', width: 'half', inputMode: 'tel' }),
    ),
  );
}

function addressSection(ctx: EditorContext): HTMLElement {
  return sectionCard(
    'address',
    'mapPin',
    'Address',
    'Your current / permanent address.',
    grid(
      field(ctx, { path: 'address.line1', label: 'Address line 1', placeholder: 'House / flat no., building, street', autocomplete: 'address-line1' }),
      field(ctx, { path: 'address.line2', label: 'Address line 2', placeholder: 'Area, locality, sector', autocomplete: 'address-line2' }),
      field(ctx, { path: 'address.landmark', label: 'Landmark', width: 'half' }),
      field(ctx, { path: 'address.city', label: 'City', width: 'half', autocomplete: 'address-level2' }),
      field(ctx, { path: 'address.state', label: 'State / Province', datalist: 'dl-states', width: 'third', autocomplete: 'address-level1' }),
      field(ctx, { path: 'address.postalCode', label: 'ZIP / Postal code', width: 'third', autocomplete: 'postal-code', inputMode: 'numeric' }),
      field(ctx, { path: 'address.country', label: 'Country', datalist: 'dl-countries', width: 'third', autocomplete: 'country-name' }),
    ),
  );
}

const SCHOOL_LEVELS: EducationLevel[] = ['secondary', 'higher-secondary'];

function educationCard(ctx: EditorContext, record: EducationRecord, index: number): HTMLElement {
  const base = `education.${index}`;
  const isSchool = SCHOOL_LEVELS.includes(record.level);
  const levelSelect = h(
    'select',
    {
      class: 'select select-inline',
      attrs: { 'aria-label': 'Education level' },
      on: {
        change: (e: Event) => {
          record.level = (e.target as HTMLSelectElement).value as EducationLevel;
          ensureSinglePrimary(ctx.draft.education);
          ctx.markDirty();
          ctx.rerender();
        },
      },
    },
    LEVEL_OPTIONS.map(([v, l]) => h('option', { value: v, selected: v === record.level }, l)),
  );

  const primary = h(
    'label',
    { class: 'primary-toggle', attrs: { title: 'Used for generic questions like “University” or “Degree”' } },
    h('input', {
      type: 'radio',
      name: 'edu-primary',
      checked: record.isPrimary,
      on: {
        change: () => {
          ctx.draft.education.forEach((r) => (r.isPrimary = r === record));
          ctx.markDirty();
          ctx.rerender();
        },
      },
    }),
    h('span', null, 'Primary'),
  );

  const fields = isSchool
    ? [
        field(ctx, { path: `${base}.institution`, label: 'School name', width: 'two-thirds' }),
        field(ctx, { path: `${base}.board`, label: 'Board', datalist: 'dl-boards', width: 'third' }),
        record.level === 'higher-secondary' ? field(ctx, { path: `${base}.specialization`, label: 'Stream', datalist: 'dl-streams', width: 'third' }) : null,
        field(ctx, { path: `${base}.rollNumber`, label: 'Roll number', width: 'third' }),
        field(ctx, { path: `${base}.percentage`, label: 'Percentage', width: 'third', inputMode: 'decimal', placeholder: '92.4' }),
        field(ctx, { path: `${base}.cgpa`, label: 'CGPA (if graded)', width: 'third', inputMode: 'decimal' }),
        field(ctx, { path: `${base}.endYear`, label: 'Passing year', width: 'third', inputMode: 'numeric', placeholder: '2021' }),
      ]
    : [
        field(ctx, { path: `${base}.institution`, label: 'University / College', width: 'two-thirds', placeholder: 'Manipal University Jaipur' }),
        field(ctx, { path: `${base}.degree`, label: 'Degree', datalist: 'dl-degrees', width: 'third', placeholder: 'B.Tech' }),
        field(ctx, { path: `${base}.course`, label: 'Course', width: 'half', placeholder: 'Bachelor of Technology' }),
        field(ctx, { path: `${base}.specialization`, label: 'Branch / Specialization', width: 'half', placeholder: 'Computer Science' }),
        field(ctx, { path: `${base}.university`, label: 'Affiliating university (optional)', width: 'full' }),
        field(ctx, { path: `${base}.enrollmentNumber`, label: 'Enrollment number', width: 'third' }),
        field(ctx, { path: `${base}.rollNumber`, label: 'Roll number', width: 'third' }),
        field(ctx, { path: `${base}.registrationNumber`, label: 'Registration number', width: 'third' }),
        field(ctx, { path: `${base}.cgpa`, label: 'CGPA', width: 'third', inputMode: 'decimal', placeholder: '8.7' }),
        field(ctx, { path: `${base}.percentage`, label: 'Percentage', width: 'third', inputMode: 'decimal' }),
        field(ctx, { path: `${base}.cgpaScale`, label: 'CGPA scale', type: 'select', options: [['10', 'Out of 10'], ['4', 'Out of 4'], ['5', 'Out of 5']], width: 'third' }),
        field(ctx, { path: `${base}.startYear`, label: 'Start year', width: 'half', inputMode: 'numeric', placeholder: '2021' }),
        field(ctx, { path: `${base}.endYear`, label: 'Graduation year', width: 'half', inputMode: 'numeric', placeholder: '2025' }),
      ];

  return h(
    'article',
    { class: 'record', attrs: { 'aria-label': EDUCATION_LEVEL_LABELS[record.level] ?? 'Education' } },
    h(
      'div',
      { class: 'record-head' },
      levelSelect,
      isSchool ? null : primary,
      h('span', { class: 'spacer' }),
      removeButton('Remove this education', () => {
        ctx.draft.education.splice(index, 1);
        ensureSinglePrimary(ctx.draft.education);
        ctx.markDirty();
        ctx.rerender();
      }),
    ),
    grid(...fields),
  );
}

function educationSection(ctx: EditorContext): HTMLElement {
  const add = (level: EducationLevel) => {
    const record = createEducationRecord(level);
    ctx.draft.education.push(record);
    ensureSinglePrimary(ctx.draft.education);
    ctx.markDirty();
    ctx.rerender(`education.${ctx.draft.education.length - 1}.institution`);
  };
  const quick: Array<[EducationLevel, string]> = [
    ['bachelors', "Bachelor's"],
    ['masters', "Master's"],
    ['higher-secondary', '12th'],
    ['secondary', '10th'],
    ['diploma', 'Diploma'],
    ['doctorate', 'Doctorate'],
  ];
  return sectionCard(
    'education',
    'graduation',
    'Education',
    'Add each qualification once. The primary one answers generic questions like “University” or “CGPA”.',
    ctx.draft.education.length === 0
      ? h('div', { class: 'inline-empty' }, icon('graduation', 20), h('span', null, 'No education added yet.'))
      : ctx.draft.education.map((r, i) => educationCard(ctx, r, i)),
    h('div', { class: 'add-row', id: 'add-education' }, h('span', { class: 'muted small' }, 'Add:'), quick.map(([level, label]) => addButton(label, () => add(level)))),
  );
}

function skillsField(ctx: EditorContext): HTMLElement {
  const skills = ctx.draft.professional.skills;
  const input = h('input', {
    class: 'tag-input',
    id: 'f-professional.skills',
    placeholder: skills.length ? 'Add another…' : 'Type a skill and press Enter',
    attrs: { 'aria-label': 'Add a skill', autocomplete: 'off' },
  });
  const commit = () => {
    const parts = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    let added = false;
    for (const part of parts) {
      if (!skills.some((s) => s.toLowerCase() === part.toLowerCase()) && skills.length < 100) {
        skills.push(part.slice(0, 60));
        added = true;
      }
    }
    input.value = '';
    if (added) {
      ctx.markDirty();
      ctx.rerender('professional.skills');
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !input.value && skills.length) {
      skills.pop();
      ctx.markDirty();
      ctx.rerender('professional.skills');
    }
  });
  input.addEventListener('blur', () => input.value.trim() && commit());

  return h(
    'div',
    { class: 'field w-full' },
    h('label', { class: 'field-label', htmlFor: 'f-professional.skills' }, 'Skills'),
    h(
      'div',
      { class: 'tags', on: { click: () => input.focus() } },
      skills.map((skill, i) =>
        h(
          'span',
          { class: 'tag' },
          skill,
          h(
            'button',
            {
              type: 'button',
              attrs: { 'aria-label': `Remove ${skill}` },
              on: {
                click: () => {
                  skills.splice(i, 1);
                  ctx.markDirty();
                  ctx.rerender('professional.skills');
                },
              },
            },
            icon('x', 12),
          ),
        ),
      ),
      input,
    ),
    h('div', { class: 'field-message' }, 'Separate with Enter or commas. Used for skills fields and skill checklists.'),
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function resumesBlock(ctx: EditorContext): HTMLElement {
  const resumes = ctx.draft.professional.resumes;
  const picker = h('input', { type: 'file', class: 'sr-only', attrs: { accept: '.pdf,.doc,.docx,.txt,.rtf', 'aria-label': 'Upload resume' } });
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) return toast(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`, 'error', 4000);
    if (file.type && !ACCEPTED_DOCUMENT_TYPES.includes(file.type)) return toast('Please upload a PDF, Word or text file.', 'error');
    if (resumes.length >= 5) return toast('You can keep up to 5 resumes.', 'error');
    try {
      const id = createId('doc');
      await saveDocument(id, { name: file.name, type: file.type, dataUrl: await readFileAsDataUrl(file) });
      ctx.onDocumentAdded(id);
      resumes.push({
        id,
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        addedAt: Date.now(),
        isDefault: resumes.length === 0,
      });
      ctx.markDirty();
      ctx.rerender();
    } catch {
      toast('Couldn’t read that file.', 'error');
    }
  });

  return h(
    'div',
    { class: 'subsection', id: 'f-professional.resumes' },
    h('div', { class: 'subsection-head' }, h('h3', null, 'Resumes'), h('span', { class: 'muted small' }, 'Attached to “Upload resume” fields. Stored only on this device.')),
    resumes.length === 0
      ? h('div', { class: 'inline-empty' }, icon('file', 20), h('span', null, 'No resume yet — PDF or Word, up to 2 MB.'))
      : h(
          'ul',
          { class: 'file-list' },
          resumes.map((r, i) =>
            h(
              'li',
              { class: 'file-row' },
              h('div', { class: 'file-icon' }, icon('file', 18)),
              h(
                'div',
                { class: 'file-main' },
                h('input', {
                  class: 'input input-bare',
                  value: r.label,
                  attrs: { 'aria-label': 'Resume name' },
                  on: {
                    input: (e: Event) => {
                      r.label = (e.target as HTMLInputElement).value.slice(0, 60);
                      ctx.markDirty();
                    },
                  },
                }),
                h('span', { class: 'subtle small' }, `${r.fileName} · ${formatBytes(r.size)}`),
              ),
              h(
                'label',
                { class: 'primary-toggle' },
                h('input', {
                  type: 'radio',
                  name: 'resume-default',
                  checked: r.isDefault,
                  on: {
                    change: () => {
                      resumes.forEach((x) => (x.isDefault = x === r));
                      ctx.markDirty();
                    },
                  },
                }),
                h('span', null, 'Default'),
              ),
              removeButton('Remove resume', () => {
                resumes.splice(i, 1);
                if (resumes.length && !resumes.some((x) => x.isDefault)) resumes[0]!.isDefault = true;
                ctx.markDirty();
                ctx.rerender();
              }),
            ),
          ),
        ),
    h('div', { class: 'add-row' }, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', on: { click: () => picker.click() } }, icon('upload', 15), 'Upload resume'), picker),
  );
}

function coverLettersBlock(ctx: EditorContext): HTMLElement {
  const letters = ctx.draft.professional.coverLetters;
  return h(
    'div',
    { class: 'subsection', id: 'f-professional.coverLetters' },
    h('div', { class: 'subsection-head' }, h('h3', null, 'Cover letters'), h('span', { class: 'muted small' }, 'The default one fills “Cover letter” text boxes.')),
    letters.map((letter, i) =>
      h(
        'article',
        { class: 'record' },
        h(
          'div',
          { class: 'record-head' },
          h('input', {
            class: 'input input-bare record-title',
            value: letter.label,
            attrs: { 'aria-label': 'Cover letter name' },
            on: {
              input: (e: Event) => {
                letter.label = (e.target as HTMLInputElement).value.slice(0, 60);
                ctx.markDirty();
              },
            },
          }),
          h(
            'label',
            { class: 'primary-toggle' },
            h('input', {
              type: 'radio',
              name: 'cover-default',
              checked: letter.isDefault,
              on: {
                change: () => {
                  letters.forEach((l) => (l.isDefault = l === letter));
                  ctx.markDirty();
                },
              },
            }),
            h('span', null, 'Default'),
          ),
          removeButton('Remove cover letter', () => {
            letters.splice(i, 1);
            if (letters.length && !letters.some((l) => l.isDefault)) letters[0]!.isDefault = true;
            ctx.markDirty();
            ctx.rerender();
          }),
        ),
        field(ctx, { path: `professional.coverLetters.${i}.content`, label: 'Letter', type: 'textarea', placeholder: 'Dear Hiring Manager, …' }),
      ),
    ),
    h(
      'div',
      { class: 'add-row' },
      addButton('Add cover letter', () => {
        letters.push(createCoverLetter(letters.length === 0));
        ctx.markDirty();
        ctx.rerender(`professional.coverLetters.${letters.length - 1}.content`);
      }),
    ),
  );
}

function linksBlock(ctx: EditorContext): HTMLElement {
  const links = ctx.draft.professional.links;
  return h(
    'div',
    { class: 'subsection' },
    h('div', { class: 'subsection-head' }, h('h3', null, 'Other profiles'), h('span', { class: 'muted small' }, 'LeetCode, Behance, Kaggle, Stack Overflow…')),
    links.map((link, i) =>
      h(
        'div',
        { class: 'link-row' },
        field(ctx, { path: `professional.links.${i}.label`, label: 'Name', width: 'third', placeholder: 'LeetCode' }),
        field(ctx, { path: `professional.links.${i}.url`, label: 'URL', type: 'url', width: 'two-thirds', transform: 'url', placeholder: 'https://' }),
        removeButton('Remove link', () => {
          links.splice(i, 1);
          ctx.markDirty();
          ctx.rerender();
        }),
      ),
    ),
    h(
      'div',
      { class: 'add-row' },
      addButton('Add profile link', () => {
        links.push(createProfileLink());
        ctx.markDirty();
        ctx.rerender(`professional.links.${links.length - 1}.label`);
      }),
    ),
  );
}

function professionalSection(ctx: EditorContext): HTMLElement {
  return sectionCard(
    'professional',
    'briefcase',
    'Professional',
    'Work details, links and documents for job applications.',
    grid(
      field(ctx, { path: 'professional.currentCompany', label: 'Current company', width: 'half', autocomplete: 'organization' }),
      field(ctx, { path: 'professional.jobTitle', label: 'Job title', width: 'half', autocomplete: 'organization-title' }),
      field(ctx, { path: 'professional.experienceYears', label: 'Years of experience', type: 'number', width: 'third', transform: 'number', inputMode: 'decimal' }),
      field(ctx, { path: 'professional.employmentStatus', label: 'Employment status', type: 'select', options: EMPLOYMENT_OPTIONS, width: 'third' }),
      field(ctx, { path: 'professional.noticePeriod', label: 'Notice period', datalist: 'dl-notice', width: 'third' }),
      skillsField(ctx),
      field(ctx, { path: 'professional.linkedin', label: 'LinkedIn', type: 'url', width: 'half', transform: 'url', placeholder: 'https://linkedin.com/in/you' }),
      field(ctx, { path: 'professional.github', label: 'GitHub', type: 'url', width: 'half', transform: 'url', placeholder: 'https://github.com/you' }),
      field(ctx, { path: 'professional.portfolio', label: 'Portfolio / Website', type: 'url', transform: 'url', placeholder: 'https://' }),
    ),
    linksBlock(ctx),
    resumesBlock(ctx),
    coverLettersBlock(ctx),
  );
}

function identificationSection(ctx: EditorContext): HTMLElement {
  const sensitive = (path: string, label: string, width: Width, extra: Partial<FieldSpec> = {}) =>
    field(ctx, { path, label, width, sensitive: true, transform: 'upper', ...extra });
  return sectionCard(
    'identification',
    'idCard',
    'Identification',
    'Government IDs are sensitive. They are hidden by default and never filled without your explicit confirmation.',
    h(
      'div',
      { class: 'notice notice-sensitive' },
      icon('lock', 17),
      h('span', null, 'Stored only on this device. One-Fill always asks before filling these, and they’re excluded from exports unless you opt in.'),
    ),
    grid(
      sensitive('identification.pan', 'PAN', 'half', { placeholder: 'ABCDE1234F' }),
      sensitive('identification.aadhaar', 'Aadhaar', 'half', { placeholder: '1234 5678 9012', inputMode: 'numeric', transform: undefined }),
      sensitive('identification.passportNumber', 'Passport number', 'half'),
      field(ctx, { path: 'identification.passportExpiry', label: 'Passport expiry', type: 'date', width: 'half' }),
      sensitive('identification.drivingLicense', 'Driving licence', 'half'),
      sensitive('identification.voterId', 'Voter ID', 'half'),
    ),
  );
}

function emergencySection(ctx: EditorContext): HTMLElement {
  const contacts = ctx.draft.emergencyContacts;
  return sectionCard(
    'emergency',
    'heartPulse',
    'Emergency contacts',
    'The first contact is used when a form asks for an emergency contact.',
    contacts.length === 0 ? h('div', { class: 'inline-empty' }, icon('heartPulse', 20), h('span', null, 'No emergency contact yet.')) : null,
    contacts.map((c, i) =>
      h(
        'article',
        { class: 'record' },
        h(
          'div',
          { class: 'record-head' },
          h('strong', null, c.name || `Contact ${i + 1}`),
          i === 0 ? h('span', { class: 'chip chip-primary' }, 'Primary') : null,
          h('span', { class: 'spacer' }),
          i > 0
            ? h(
                'button',
                {
                  class: 'btn btn-ghost btn-sm',
                  type: 'button',
                  on: {
                    click: () => {
                      contacts.splice(i, 1);
                      contacts.unshift(c);
                      ctx.markDirty();
                      ctx.rerender();
                    },
                  },
                },
                'Make primary',
              )
            : null,
          removeButton('Remove contact', () => {
            contacts.splice(i, 1);
            ctx.markDirty();
            ctx.rerender();
          }),
        ),
        grid(
          field(ctx, { path: `emergencyContacts.${i}.name`, label: 'Name', width: 'half' }),
          field(ctx, { path: `emergencyContacts.${i}.relationship`, label: 'Relationship', datalist: 'dl-relationships', width: 'half' }),
          field(ctx, { path: `emergencyContacts.${i}.phone`, label: 'Phone', type: 'tel', width: 'half', inputMode: 'tel' }),
          field(ctx, { path: `emergencyContacts.${i}.email`, label: 'Email', type: 'email', width: 'half' }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'add-row', id: 'add-emergency' },
      addButton('Add emergency contact', () => {
        contacts.push(createEmergencyContact());
        ctx.markDirty();
        ctx.rerender(`emergencyContacts.${contacts.length - 1}.name`);
      }),
    ),
  );
}

export function renderProfileEditor(ctx: EditorContext): HTMLElement {
  return h(
    'div',
    { class: 'editor' },
    datalists(),
    personalSection(ctx),
    contactSection(ctx),
    addressSection(ctx),
    educationSection(ctx),
    professionalSection(ctx),
    identificationSection(ctx),
    emergencySection(ctx),
  );
}
