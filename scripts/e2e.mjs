// End-to-end test in a real, isolated headless Chrome.
//
//   npm run test:e2e
//
// Builds dist-e2e/, serves test-pages/, launches Chrome with a throwaway profile, loads the
// extension through the DevTools protocol (Extensions.loadUnpacked — branded Chrome no longer
// honours --load-extension), seeds a sample profile, then drives the real popup against each
// test page and checks the values that end up in the page. Screenshots go to e2e-output/.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestPages, serveTestPages } from './serve-test-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'e2e-output');
const PORT = 5175;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome/Chromium executable.');
  return found;
}

// ── Sample data ──────────────────────────────────────────────────────────────
const PROFILE = {
  personal: { firstName: 'Harshit', middleName: '', lastName: 'Goyal', fullName: '', dateOfBirth: '2003-03-05', placeOfBirth: 'Jaipur', gender: 'male', nationality: 'Indian', maritalStatus: 'single', fatherName: 'Rakesh Goyal', motherName: 'Sunita Goyal' },
  contact: { email: 'harshit@example.com', alternateEmail: '', phoneCountryCode: '+91', phone: '9876512345', alternatePhone: '' },
  address: { line1: '12 MG Road', line2: 'Malviya Nagar', landmark: '', city: 'Jaipur', state: 'Rajasthan', country: 'India', postalCode: '302017' },
  education: [
    { id: 'edu_1', level: 'bachelors', institution: 'Manipal University Jaipur', university: '', board: '', degree: 'B.Tech', course: 'Bachelor of Technology', specialization: 'Computer Science and Engineering', enrollmentNumber: 'MUJ2021CS042', rollNumber: '21CS042', registrationNumber: '219301042', cgpa: '8.7', cgpaScale: '10', percentage: '84', startYear: '2021', endYear: '2025', isPrimary: true },
    { id: 'edu_2', level: 'higher-secondary', institution: "St. Xavier's School", university: '', board: 'CBSE', degree: '', course: '', specialization: 'Science (PCM)', enrollmentNumber: '', rollNumber: '1122334', registrationNumber: '', cgpa: '', cgpaScale: '10', percentage: '91.2', startYear: '', endYear: '2021', isPrimary: false },
    { id: 'edu_3', level: 'secondary', institution: "St. Xavier's School", university: '', board: 'CBSE', degree: '', course: '', specialization: '', enrollmentNumber: '', rollNumber: '5566778', registrationNumber: '', cgpa: '', cgpaScale: '10', percentage: '94.6', startYear: '', endYear: '2019', isPrimary: false },
  ],
  professional: {
    currentCompany: 'Acme Labs', jobTitle: 'Software Engineer Intern', experienceYears: 1, employmentStatus: 'student', noticePeriod: '30 days',
    skills: ['TypeScript', 'React', 'Python'], linkedin: 'https://www.linkedin.com/in/harshitgoyal', github: 'https://github.com/harshitgoyal', portfolio: 'https://harshit.dev', links: [],
    resumes: [{ id: 'doc_1', label: 'General', fileName: 'Harshit_Goyal_Resume.pdf', mimeType: 'application/pdf', size: 20, addedAt: 0, isDefault: true }],
    coverLetters: [{ id: 'cl_1', label: 'Default', content: 'Dear Hiring Manager, I would love to join Acme.', isDefault: true }],
  },
  identification: { pan: 'ABCDE1234F', aadhaar: '234567890124', passportNumber: 'N1234567', passportExpiry: '2032-01-01', drivingLicense: '', voterId: '' },
  emergencyContacts: [{ id: 'ec_1', name: 'Rakesh Goyal', relationship: 'Father', phone: '9988776655', email: 'rakesh@example.com' }],
};
const RESUME = { name: 'Harshit_Goyal_Resume.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK' };

// ── Minimal CDP client over --remote-debugging-pipe ──────────────────────────
class CDP {
  constructor(writable, readable) {
    this.seq = 0;
    this.pending = new Map();
    this.writable = writable;
    let buffer = '';
    readable.setEncoding('utf8');
    readable.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\0')) >= 0) {
        const msg = JSON.parse(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
        const waiter = msg.id && this.pending.get(msg.id);
        if (!waiter) continue;
        this.pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`));
        else waiter.resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    this.writable.write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + '\0');
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
    });
  }
}

let cdp;

async function evaluate(sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function attach(targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  return sessionId;
}

async function openPage(url, { width = 1280, height = 900, newWindow = false } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url, newWindow });
  const sessionId = await attach(targetId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  // Screenshots default to light mode regardless of the OS theme; dark variants opt in.
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  const page = {
    targetId,
    sessionId,
    eval: (expression) => evaluate(sessionId, expression),
    close: () => cdp.send('Target.closeTarget', { targetId }),
  };
  await waitFor(page, 'document.readyState === "complete"');
  return page;
}

async function waitFor(page, expression, timeout = 15_000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try {
      if (await page.eval(`Boolean(${expression})`)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}${lastError ? ` (${lastError.message})` : ''}`);
}

async function screenshot(page, name, fullPage = false) {
  const params = { format: 'png' };
  if (fullPage) {
    const { cssContentSize } = await cdp.send('Page.getLayoutMetrics', {}, page.sessionId);
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 };
  }
  const { data } = await cdp.send('Page.captureScreenshot', params, page.sessionId);
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

async function setDarkMode(page, dark) {
  await cdp.send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] },
    page.sessionId,
  );
}

const COLLECT_VALUES = `(() => {
  const out = {};
  const visit = (root, prefix) => {
    for (const el of root.querySelectorAll('input, select, textarea')) {
      const key = prefix + (el.name || el.id);
      if (el.type === 'radio') { if (el.checked) out[key] = el.value; else if (!(key in out)) out[key] = null; }
      else if (el.type === 'checkbox') out[key + (el.value && el.value !== 'on' ? ':' + el.value : '')] = el.checked;
      else if (el.type === 'file') out[key] = el.files.length ? el.files[0].name : '';
      else out[key] = el.value;
    }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot, prefix + 'shadow:');
    for (const frame of root.querySelectorAll('iframe')) { try { visit(frame.contentDocument, prefix + 'frame:'); } catch {} }
  };
  visit(document, '');
  return out;
})()`;

// ── Assertions ───────────────────────────────────────────────────────────────
const results = [];
function check(suite, label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ suite, label, ok, actual, expected: String(expected) });
}

// ── Main ─────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
console.log('[e2e] building extension (dist-e2e) and test pages…');
execFileSync(process.execPath, ['scripts/build.mjs', '--e2e'], { cwd: root, stdio: 'inherit' });
await buildTestPages();
const server = await serveTestPages(PORT);

const profileDir = mkdtempSync(path.join(os.tmpdir(), 'onefill-e2e-'));
const chrome = spawn(
  findChrome(),
  [
    '--headless=new',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-sync',
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);
cdp = new CDP(chrome.stdio[3], chrome.stdio[4]);

let exitCode = 0;
try {
  const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: path.join(root, 'dist-e2e') });
  console.log(`[e2e] extension loaded: ${extId}`);

  // Service worker: seed the profile once the extension has initialised storage.
  let worker;
  for (let i = 0; i < 100 && !worker; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
    if (sw) worker = { sessionId: await attach(sw.targetId) };
    else await sleep(100);
  }
  if (!worker) throw new Error('Extension service worker did not start');
  worker.eval = (expression) => evaluate(worker.sessionId, expression);
  await worker.eval(`(async () => {
    for (let i = 0; i < 100 && !(await chrome.storage.local.get('profiles')).profiles; i++) await new Promise((r) => setTimeout(r, 50));
    const { profiles } = await chrome.storage.local.get('profiles');
    await chrome.storage.local.set({ ['profile:' + profiles.activeProfileId]: ${JSON.stringify(PROFILE)}, 'doc:doc_1': ${JSON.stringify(RESUME)} });
  })()`);

  const tabIdFor = (url) => worker.eval(`chrome.tabs.query({}).then((tabs) => tabs.find((t) => t.url === ${JSON.stringify(url)})?.id ?? 0)`);

  /** Opens a test page, opens the popup for it, fills, and returns the page values. */
  async function fillWithPopup(file, name, { beforePopup, review } = {}) {
    const url = `${BASE}/${file}`;
    const page = await openPage(url);
    if (beforePopup) await beforePopup(page);
    const tabId = await tabIdFor(url);
    const popup = await openPage(`chrome-extension://${extId}/popup/popup.html?tabId=${tabId}`, { width: 384, height: 600, newWindow: true });
    await waitFor(popup, `document.querySelector('.summary .btn-primary') || document.querySelector('.state-card')`);
    await screenshot(popup, `${name}-1-popup`);
    if (review) {
      await popup.eval(`document.querySelector('.summary .btn-secondary').click()`);
      await waitFor(popup, `document.querySelector('.review-card, .state-card')`);
      await screenshot(popup, `${name}-2-review`);
      await popup.eval(`document.querySelector('.topbar .icon-btn').click()`);
      await waitFor(popup, `document.querySelector('.summary .btn-primary')`);
    }
    const summary = await popup.eval(`document.querySelector('.summary')?.innerText ?? ''`);
    await popup.eval(`document.querySelector('.summary .btn-primary').click()`);
    await waitFor(popup, `document.querySelector('.banner')`, 30_000);
    await screenshot(popup, `${name}-3-filled`);
    const banner = await popup.eval(`document.querySelector('.banner')?.innerText ?? ''`);
    const values = await page.eval(COLLECT_VALUES);
    await screenshot(page, `${name}-4-page`, true);
    return { page, popup, values, summary, banner };
  }

  // 1. Job application (ATS style)
  {
    const { values: v, page, popup, banner } = await fillWithPopup('job-application.html', 'job', { review: true });
    const s = 'job-application';
    check(s, 'first name', v['job_application[first_name]'], 'Harshit');
    check(s, 'last name', v['job_application[last_name]'], 'Goyal');
    check(s, 'email', v['job_application[email]'], 'harshit@example.com');
    check(s, 'phone country select', v['job_application[phone_country]'], 'IN');
    check(s, 'phone (national)', v['job_application[phone]'], '9876512345');
    check(s, 'city', v['job_application[location]'], 'Jaipur');
    check(s, 'resume attached', v['job_application[resume]'], 'Harshit_Goyal_Resume.pdf');
    check(s, 'cover letter', v['job_application[cover_letter_text]'], /Dear Hiring Manager/);
    check(s, 'linkedin', v['job_application[answers][linkedin]'], 'https://www.linkedin.com/in/harshitgoyal');
    check(s, 'github', v['job_application[answers][github]'], 'https://github.com/harshitgoyal');
    check(s, 'website', v['job_application[answers][website]'], 'https://harshit.dev');
    check(s, 'degree (level fallback)', v['education[degree]'], "Bachelor's Degree");
    check(s, 'discipline', v['education[discipline]'], 'Computer Science and Engineering');
    check(s, 'company', v.current_company, 'Acme Labs');
    check(s, 'title', v.current_title, 'Software Engineer Intern');
    check(s, 'experience bucket', v.years_of_experience, '1-3 years');
    check(s, 'gender (EEO)', v['eeo[gender]'], 'Male');
    check(s, 'ambiguous "School" left for review', v['education[school_name]'], '');
    check(s, 'work authorization untouched', v.work_auth, null);
    check(s, '"how did you hear" untouched', v.referral_source, '');
    check(s, 'consent not ticked', v.gdpr_consent, false);
    check(s, 'banner', banner, /fields? filled/);
    check(s, 'primary action becomes "Done"', await popup.eval(`document.querySelector('.summary .btn-primary').innerText.trim()`), 'Done');
    await setDarkMode(popup, true);
    await screenshot(popup, 'job-5-filled-dark');
    await popup.eval(`document.querySelector('.summary .btn-secondary').click()`);
    await waitFor(popup, `document.querySelector('.review-card')`);
    await screenshot(popup, 'job-6-review-dark');
    await popup.close();
    await page.close();
  }

  // 2. University admission (government portal style)
  {
    const { values: v, page, popup } = await fillWithPopup('university-admission.html', 'university');
    const s = 'university-admission';
    const f = (n) => v[`ctl00$ContentPlaceHolder1$${n}`];
    check(s, "candidate's name → full name", f('txtCandidateName'), 'Harshit Goyal');
    check(s, "father's name", f('txtFatherName'), 'Rakesh Goyal');
    check(s, "mother's name", f('txtMotherName'), 'Sunita Goyal');
    check(s, 'DOB day', f('ddlDobDay'), '5');
    check(s, 'DOB month', f('ddlDobMonth'), 'March');
    check(s, 'DOB year', f('ddlDobYear'), '2003');
    check(s, 'gender radio', f('rblGender'), '1');
    check(s, 'nationality', f('ddlNationality'), 'Indian');
    check(s, 'mobile (maxlength 10)', f('txtMobileNo'), '9876512345');
    check(s, 'email', f('txtEmail'), 'harshit@example.com');
    check(s, 'Aadhaar NOT filled (sensitive)', f('txtAadhaar'), '');
    check(s, 'address textarea', f('txtPermAddress'), /12 MG Road, Malviya Nagar/);
    check(s, 'city', f('txtPermCity'), 'Jaipur');
    check(s, 'state (upper-case options)', f('ddlPermState'), 'RA');
    check(s, 'pincode', f('txtPermPin'), '302017');
    check(s, '10th board', f('txt10Board'), 'CBSE');
    check(s, '10th roll number', f('txt10Roll'), '5566778');
    check(s, '10th year', f('txt10Year'), '2019');
    check(s, '10th percentage', f('txt10Percent'), '94.6');
    check(s, '12th board', f('txt12Board'), 'CBSE');
    check(s, '12th school', f('txt12School'), "St. Xavier's School");
    check(s, '12th year', f('txt12Year'), '2021');
    check(s, '12th percentage', f('txt12Percent'), '91.2');
    check(s, 'emergency name', f('txtEmergName'), 'Rakesh Goyal');
    check(s, 'emergency relation', f('txtEmergRelation'), 'Father');
    check(s, 'emergency phone', f('txtEmergPhone'), '9988776655');
    check(s, 'category untouched', f('ddlCategory'), '--Select--');
    check(s, 'captcha NOT filled', f('txtCaptcha'), '');
    check(s, 'declaration NOT ticked', f('chkDeclaration'), false);
    await popup.close();
    await page.close();
  }

  // 3. React controlled inputs (+ the review flow: "Work email" needs confirmation)
  {
    const { page, popup } = await fillWithPopup('react-form.html', 'react');
    const readState = async () => JSON.parse(await page.eval(`document.getElementById('react-state').textContent`));
    let state = await readState();
    const s = 'react';
    check(s, 'React state: firstName', state.firstName, 'Harshit');
    check(s, 'React state: lastName', state.lastName, 'Goyal');
    check(s, 'React state: phone', state.phone, '9876512345');
    check(s, 'React state: country', state.country, 'in');
    check(s, 'React state: gender', state.gender, 'Male');
    check(s, 'React state: experience', state.experience, '1');
    check(s, 'React state: terms untouched', state.terms, false);
    check(s, '"Work email" waits for confirmation', state.email, '');
    // Confirm it in Review, then fill.
    await popup.eval(`document.querySelector('.summary .btn-secondary').click()`);
    await waitFor(popup, `document.querySelector('.review-card')`);
    await screenshot(popup, 'react-5-review');
    await popup.eval(`document.querySelector('.review-actions .btn-primary').click()`);
    await waitFor(popup, `document.querySelector('.banner')`, 30_000);
    state = await readState();
    check(s, 'after review: React state email', state.email, 'harshit@example.com');
    check(s, 'after review: React live validation ran', await page.eval(`document.querySelector('.ok')?.textContent ?? ''`), /Looks good/);
    await popup.close();
    await page.close();
  }

  // 4. Vue v-model
  {
    const { page, popup } = await fillWithPopup('vue-form.html', 'vue');
    const state = JSON.parse(await page.eval(`document.getElementById('vue-state').textContent`));
    const s = 'vue';
    check(s, 'Vue state: fullName', state.fullName, 'Harshit Goyal');
    check(s, 'Vue state: email', state.email, 'harshit@example.com');
    check(s, 'Vue state: city', state.city, 'Jaipur');
    check(s, 'Vue state: state', state.state, 'Rajasthan');
    check(s, 'Vue state: pincode', state.pincode, '302017');
    check(s, 'Vue state: university', state.university, 'Manipal University Jaipur');
    await popup.close();
    await page.close();
  }

  // 5. Dynamic multi-step form with a cascading dropdown
  {
    const { values: v, page, popup } = await fillWithPopup('dynamic-form.html', 'dynamic', {
      beforePopup: async (p) => waitFor(p, `document.getElementById('em')`),
    });
    const s = 'dynamic';
    check(s, 'step 1: full name', v.fullName, 'Harshit Goyal');
    check(s, 'late field: email', v.email, 'harshit@example.com');
    check(s, 'late field: mobile', v.mobile, '9876512345');
    check(s, 'hidden step 2 not filled yet', v.city, '');
    // Reveal step 2 and fill again from the popup.
    await page.eval(`document.getElementById('next').click()`);
    await popup.eval(`[...document.querySelectorAll('.summary .icon-btn')].pop().click()`);
    await waitFor(popup, `document.querySelector('.summary .btn-primary') && !document.querySelector('.summary .btn-primary').disabled`);
    await popup.eval(`document.querySelector('.summary .btn-primary').click()`);
    await waitFor(popup, `document.querySelector('.banner')`, 30_000);
    const v2 = await page.eval(COLLECT_VALUES);
    check(s, 'step 2: country', v2.country, 'IN');
    check(s, 'step 2: cascading state (second pass)', v2.state, 'Rajasthan');
    check(s, 'step 2: city', v2.city, 'Jaipur');
    await screenshot(page, 'dynamic-5-page-step2', true);
    await popup.close();
    await page.close();
  }

  // 6. Iframe
  {
    const { values: v, page, popup } = await fillWithPopup('iframe-host.html', 'iframe', {
      beforePopup: async (p) => waitFor(p, `document.querySelector('iframe').contentDocument?.getElementById('c-email')`),
    });
    const s = 'iframe';
    check(s, 'top frame: name', v.name, 'Harshit Goyal');
    check(s, 'iframe: email', v['frame:email'], 'harshit@example.com');
    check(s, 'iframe: phone', v['frame:phone'], '9876512345');
    check(s, 'iframe: company', v['frame:company'], 'Acme Labs');
    await popup.close();
    await page.close();
  }

  // 7. Shadow DOM
  {
    const { values: v, page, popup } = await fillWithPopup('shadow-dom.html', 'shadow');
    const s = 'shadow-dom';
    check(s, 'given name', v['shadow:givenName'], 'Harshit');
    check(s, 'family name', v['shadow:familyName'], 'Goyal');
    check(s, 'organization', v['shadow:organization'], 'Acme Labs');
    check(s, 'postal code', v['shadow:postal'], '302017');
    await popup.close();
    await page.close();
  }

  // 8. Edge cases
  {
    const { values: v, page, popup } = await fillWithPopup('edge-cases.html', 'edge');
    const s = 'edge-cases';
    check(s, 'email', v.email, 'harshit@example.com');
    check(s, 'confirm email', v.email_confirm, 'harshit@example.com');
    check(s, 'masked phone accepted', v.phone, '98765 12345');
    check(s, 'date input', v.birthdate, '2003-03-05');
    check(s, 'existing value kept', v.city, 'Typed by me');
    check(s, 'display:none untouched', v.first_name_hidden, '');
    check(s, 'disabled untouched', v.last_name, '');
    check(s, 'read-only untouched', v.middle_name, '');
    check(s, 'off-screen honeypot untouched', v.website_hp, '');
    check(s, 'password untouched', v.password, '');
    check(s, 'OTP untouched', v.otp_code, '');
    check(s, 'card number untouched', v.cardnumber, '');
    check(s, 'bank account untouched', v.bank_account, '');
    check(s, 'newsletter not ticked', v.newsletter, false);
    await popup.close();
    await page.close();
  }

  // 9. Options pages (screenshots, light + dark) and history
  {
    const options = await openPage(`chrome-extension://${extId}/options/options.html`, { width: 1280, height: 900 });
    await waitFor(options, `document.querySelector('.profile-header')`);
    await sleep(300);
    await screenshot(options, 'options-1-profile');
    // The options layout scrolls inside <main>; let it grow so a full-page capture shows everything.
    await options.eval(`(() => { const s = document.createElement('style'); s.id = 'e2e-expand'; s.textContent = '.layout{height:auto}.main{overflow:visible}.sidebar{position:sticky;top:0;height:100vh}'; document.head.append(s); })()`);
    await screenshot(options, 'options-2-profile-full', true);
    await options.eval(`document.getElementById('e2e-expand').remove()`);
    for (const [hash, name] of [['education', 'options-3-education'], ['settings', 'options-4-settings'], ['history', 'options-5-history'], ['data', 'options-6-data'], ['privacy', 'options-7-privacy']]) {
      await options.eval(`location.hash = '${hash}'`);
      await sleep(500);
      await screenshot(options, name);
      if (hash === 'history') {
        const historyText = await options.eval(`document.querySelector('.history-list')?.innerText ?? ''`);
        check('options', 'history recorded the fills', historyText, /Acme Careers[\s\S]*fields filled/);
        check('options', 'history has no field values', historyText.includes('Harshit') || historyText.includes('9876512345'), false);
      }
    }
    await setDarkMode(options, true);
    await options.eval(`location.hash = 'personal'`);
    await sleep(500);
    await screenshot(options, 'options-8-profile-dark');
    await options.close();

    const privacy = await openPage(`chrome-extension://${extId}/privacy/privacy.html`, { width: 1100, height: 900 });
    await screenshot(privacy, 'privacy-page');
    await privacy.close();
  }

  // 10. Popup on a page without a form
  {
    const url = `${BASE}/index.html`;
    const page = await openPage(url);
    const popup = await openPage(`chrome-extension://${extId}/popup/popup.html?tabId=${await tabIdFor(url)}`, { width: 384, height: 600, newWindow: true });
    await waitFor(popup, `document.querySelector('.state-card, .summary .btn-primary')`);
    check('no-form', 'shows the empty state', await popup.eval(`document.querySelector('.state-card h3')?.textContent ?? ''`), 'No form fields found');
    await screenshot(popup, 'noform-popup');
    await popup.close();
    await page.close();
  }
} catch (error) {
  console.error('[e2e] fatal:', error);
  exitCode = 1;
} finally {
  try {
    await cdp.send('Browser.close');
  } catch {
    chrome.kill();
  }
  server.close();
  await sleep(500);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// ── Report ───────────────────────────────────────────────────────────────────
let currentSuite = '';
for (const r of results) {
  if (r.suite !== currentSuite) {
    currentSuite = r.suite;
    console.log(`\n${r.suite}`);
  }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${r.ok ? '' : `\n      expected ${r.expected}\n      actual   ${JSON.stringify(r.actual)}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n[e2e] ${results.length - failed}/${results.length} checks passed · screenshots in ${path.relative(root, OUT)}/`);
process.exit(failed || exitCode ? 1 : 0);
