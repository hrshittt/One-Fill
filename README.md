# One-Fill

**Enter your information once. Fill forms everywhere.**

One-Fill is a local-first, privacy-respecting smart autofill extension for Chrome (Manifest V3). You enter your details once — personal, contact, address, education, professional, IDs, emergency contacts — and One-Fill understands what each field on a web form is asking for, matches it to your profile, and fills it. It handles React/Vue/Angular forms, dropdowns, radios, checkboxes, iframes, shadow DOM, and resume uploads.

No backend, no account, no analytics. Your profile never leaves your device.

---

## Quick start

```bash
npm install
npm run build        # typecheck + production build → dist/
npm test             # unit + integration tests (Vitest + jsdom)
npm run test:e2e     # end-to-end tests in real headless Chrome (optional)
```

### Load it into Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the **`dist/`** folder (not the project root).
5. Pin One-Fill from the puzzle-piece menu. The profile page opens on first install — fill in your details and **Save**.
6. Open any form (or the bundled test pages, below) and click the One-Fill icon, or press **Alt+Shift+F**.

To use One-Fill on local `file://` pages, enable **Allow access to file URLs** on the extension's details page.

### Development

```bash
npm run dev          # watch mode: rebuilds dist/ on every change
```

After a rebuild, click the reload icon on the One-Fill card in `chrome://extensions` (and reload the page you're testing).

### Test pages

```bash
npm run serve:test-pages     # http://localhost:5174
```

| Page | What it exercises |
|---|---|
| `job-application.html` | ATS-style form: autocomplete attributes, country/dial-code select, resume upload, EEO dropdowns, consent |
| `university-admission.html` | Government-portal style: ASP.NET names, table layout, split DOB dropdowns, 10th/12th sections, Aadhaar, emergency contact, captcha, declaration |
| `react-form.html` | React 19 controlled inputs with live state display |
| `vue-form.html` | Vue 3 `v-model` with live state display |
| `dynamic-form.html` | Late-rendered fields, hidden multi-step section, cascading country → state dropdown |
| `iframe-host.html` | Form split between the top page and a same-origin iframe |
| `shadow-dom.html` | Form inside a web component's open shadow root |
| `edge-cases.html` | Hidden/disabled/read-only/honeypot fields, password/OTP/card/bank fields, masked input, pre-filled value |

---

## Features

- **Profile manager** — sectioned editor with validation (PAN, Aadhaar Verhoeff checksum, email, phone, URLs, dates, CGPA…), unsaved-changes bar, completeness score with prioritised suggestions, light/dark themes.
- **Multiple profiles** — e.g. *Personal*, *Job applications*, *University*; create, rename, duplicate, delete, switch from the popup.
- **Repeatable records** — multiple education entries (10th, 12th, diploma, bachelor's, master's, doctorate) with a primary record, multiple emergency contacts, resumes (stored locally, attached to upload fields), cover letters and extra profile links.
- **Smart detection** — labels (`for`, wrapping, `aria-labelledby`), placeholders, `aria-label`, `autocomplete`, `name`/`id`, framework attributes (`formcontrolname`, `data-automation-id`…), table-row labels, nearby text, section headings and fieldset legends; radio/checkbox groups; open shadow roots; iframes.
- **Field intelligence** — five-level matching with calibrated confidence (see *Architecture*), qualifier awareness (*Father's name* ≠ your name, *Emergency phone* ≠ your phone, *10th percentage* ≠ graduation percentage), and an ambiguity guard that sends uncertain fields to review.
- **Dropdown intelligence** — Male/M/Man, India/IN/IND/Bharat/Indian, Rajasthan/RJ, 03/March/Mar, B.Tech/Bachelor of Technology/B.E./B.Tech, education levels, dial codes (+1 ties broken by your country), experience ranges ("1–3 years", "5+ years", "Fresher"). Never guesses between near-equal options.
- **Reliable filling** — native value setters + full event sequence for React/Vue/Angular, `execCommand` fallback for masked inputs, verification after each field, a second pass for cascading dropdowns and newly revealed fields, **Undo**.
- **Review UI** — choose what each uncertain field should contain, pick another field, pick a dropdown option manually, or leave it empty; optionally remember the choice per site.
- **Safety** — sensitive IDs require an explicit tick; passwords, OTPs, captchas, payment/bank fields and consent boxes are never filled; existing values aren't overwritten by default; hidden and honeypot fields are ignored.
- **History** — domain, page title, time and field count only. Never values.
- **Import / export** — versioned JSON, IDs excluded unless opted in, optional AES-256-GCM encryption; imports are previewed and sanitised.
- **Optional automation** — page-load detection (badge count) and safe auto-fill (with an in-page confirmation prompt), both opt-in and gated behind an optional permission.

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Store profiles, settings, remembered corrections and history in `chrome.storage.local`. |
| `activeTab` | Access the current tab **only after you click the icon or press the shortcut**. This is how One-Fill reads and fills forms without broad site access. |
| `scripting` | Inject the detector/filler into that tab (`chrome.scripting.executeScript`) and, if you opt in, register the page-load script. |
| `http://*/*`, `https://*/*` — **optional** | Requested at runtime *only* when you enable **Detect forms as pages load** or **Auto-fill safe fields**. Revocable from Settings → Privacy or `chrome://extensions`; turning both features off revokes it automatically. |

Not requested: `tabs`, `history`, `bookmarks`, `cookies`, `downloads`, `webNavigation`, `contextMenus`. Exports are downloaded with a Blob link, so `downloads` isn't needed; frame discovery uses `executeScript` results, so `webNavigation` isn't needed.

---

## Architecture

```
One-Fill/
├── manifest.json               MV3 manifest (version injected from package.json at build)
├── scripts/
│   ├── build.mjs               esbuild bundling + static copy; --watch, --production, --e2e
│   ├── e2e.mjs                 headless-Chrome end-to-end suite over the DevTools protocol
│   ├── generate-icons.mjs      renders the PNG icons (no image deps)
│   └── serve-test-pages.mjs    builds React/Vue test bundles and serves test-pages/
├── assets/icons/               generated icons
├── src/
│   ├── background/service-worker.ts   storage lock-down, page-load script registration,
│   │                                  safe auto-fill gatekeeper, keyboard shortcut, badge
│   ├── content/
│   │   ├── content.ts          entry: exposes the isolated-world API; page-load mode
│   │   ├── form-detector.ts    finds controls, groups radios/checkboxes → DetectedField[]
│   │   ├── dom-utils.ts        labels, nearby text, section headings, visibility, shadow roots
│   │   ├── form-filler.ts      framework-safe setters, verification, undo, highlight
│   │   ├── element-registry.ts id ↔ element map without touching the page DOM
│   │   └── page-ui.ts          in-page toast/prompt in a closed shadow root
│   ├── matching/
│   │   ├── field-catalog.ts    every mappable profile key: synonyms, qualifiers, exclusions
│   │   ├── field-mapper.ts     5-level scoring, ambiguity guard, cross-field rules
│   │   ├── text-normalizer.ts  canonical tokens ("D.O.B" → dob, ctl00$…$txtFName → first name)
│   │   ├── autocomplete-matcher.ts, fuzzy-matcher.ts, qualifiers.ts, blocklist.ts
│   │   ├── option-matcher.ts   dropdown/radio intelligence + option-set detection
│   │   ├── dictionaries.ts     countries, demonyms, dial codes, states, degrees, months…
│   │   ├── signature.ts        value-free field fingerprints for remembered corrections
│   │   └── resolver.ts         plug-in point for an AI fallback (see below)
│   ├── core/
│   │   ├── fill-plan.ts        matches + profile → assessments + fill instructions
│   │   ├── profile-values.ts   derived values (full name, DOB parts, age, record selection)
│   │   ├── formatters.ts       dates by placeholder, national/international phone, URLs
│   │   ├── completeness.ts, import-export.ts, profile-factory.ts (defaults + sanitiser)
│   ├── extension/              tab actions (inject/scan/fill/undo), permissions, page analysis
│   ├── storage/                typed repositories over a swappable key-value store
│   ├── popup/                  popup UI
│   ├── options/                profile editor, settings, history, import/export, privacy
│   ├── privacy/                standalone privacy policy page
│   ├── ui/                     design tokens (theme.css), DOM builder, icons, dialog, toast
│   ├── types/                  profile, fields, settings, history, messages
│   └── utils/                  masking, validation, crypto, redacting logger, ids, domains
├── test-pages/                 manual + e2e test forms
└── tests/                      Vitest suites (jsdom; React/Vue integration)
```

### How a fill works

1. **Popup opens** → `chrome.tabs.query` finds the active tab (activeTab grants access because you clicked).
2. **Inject** `content.js` into all accessible frames (`executeScript({ allFrames: true })`). It installs `globalThis.__oneFill` inside the extension's *isolated world*.
3. **Scan** — one `executeScript` call runs `__oneFill.scan()` in every frame and returns `DetectedField[]` per frame (labels, attributes, context — **never current values**, only `hasValue`).
4. **Map** — `mapFields()` scores each field against the catalog, applies remembered per-site corrections, then any registered resolvers.
5. **Assess** — `assessFields()` resolves profile values, formats them for each field, matches dropdown options and assigns a status: `ready`, `review`, `sensitive`, `missing`, `unmatched`, `prefilled`, `unsupported`, `blocked`.
6. **Fill** — only the chosen instructions (with their specific values) are sent to each frame. A second pass picks up cascading dropdowns and newly revealed fields.

### Matching levels

| Level | Signal | Example |
|---|---|---|
| 1 | HTML `autocomplete` tokens | `autocomplete="given-name"` → first name (0.96; agreement with the label → 0.99; disagreement → review) |
| 2 | Known field names / exact phrases | `fname`, `first_name`, `candidate_first_name`, `ctl00$…$txtFirstName` |
| 3 | Keyword matching | "Please enter your first name here" |
| 4 | Fuzzy matching (Jaro-Winkler + transposition-aware edit distance) | "Frist Name", "Emial", "Adress line 1" |
| 5 | Context | section headings ("Emergency Contact" → *Name* is the contact's name), option sets (Male/Female → gender), input type, neighbouring fields (Address + Address line 2 → line 1; short field before phone → country code) |

Scores combine signal weight (label > placeholder > name > id > nearby text), synonym weight, qualifier rules (required / allowed / penalised), exclusion words (from human-readable text only — identifiers are too noisy to veto), input-type compatibility and priors for inherently ambiguous labels (e.g. a bare *Registration No.* needs confirmation unless the section is academic). Two different interpretations within 0.07 are capped at 0.70 → **review** — unless both would fill exactly the same thing.

Thresholds: **≥ 0.80** ready · **0.45–0.80** review · **< 0.45** unmatched.

### Adding an AI resolver

`src/matching/resolver.ts` defines the extension point:

```ts
registerResolver({
  id: 'my-llm',
  async resolve(requests, catalog) {
    // requests: [{ field: DetectedField, match: FieldMatch }] — descriptors only, no profile values
    // catalog:  [{ key, label, section }]
    return [{ frameId, fieldId, key: 'education.rollNumber', confidence: 0.75 }];
  },
});
```

Only fields the heuristics left unmatched or uncertain are sent. Resolver suggestions are capped below the *ready* threshold, so they always go through user review. The contract never exposes profile values to a resolver.

---

## Security & privacy model

- **Local-first.** All data lives in `chrome.storage.local`. No network requests, no analytics, no remote code. Extension pages use a strict CSP (`script-src 'self'; object-src 'none'; base-uri 'none'`) and system fonts.
- **Content scripts can't read the profile.** The service worker sets `chrome.storage.local.setAccessLevel('TRUSTED_CONTEXTS')`. A page only ever receives the values for the fields you chose to fill.
- **Sensitive fields** (PAN, Aadhaar, passport, driving licence, voter ID) are masked in the UI (`XXXX XXXX 1234`, `+91 XXXXX 12345`), excluded from auto-fill and the shortcut, and filled only when ticked. The policy can be set to *Never fill*; "auto" is not a possible value, even in tampered storage.
- **Never filled:** passwords, OTP/verification codes, captchas, card/CVV/bank/IFSC/UPI fields, consent/newsletter/declaration checkboxes, search boxes.
- **No page-data exfiltration.** Detection returns whether a field has a value, never the value. The element registry uses a `WeakMap`, so no attributes are added to the page.
- **In-page UI** renders in a closed shadow root and shows counts only.
- **Untrusted input is sanitised**: imports and content-script messages are rebuilt from known keys, with types checked and lengths capped. All extension UI text goes through `textContent` (the DOM builder never uses `innerHTML` for data).
- **Logging** goes through a redacting logger; debug output is stripped from production builds.
- **History** stores domain, page title, time and count only — never values or full URLs.
- **Exports** exclude IDs by default and support AES-256-GCM with PBKDF2-SHA256 (310k iterations).

See [PRIVACY.md](PRIVACY.md) for the user-facing policy.

---

## Testing

```bash
npm test          # 345 unit/integration tests
npm run test:e2e  # 100 end-to-end checks in headless Chrome
```

**Unit & integration (Vitest + jsdom)** — `tests/`
- `matching/field-mapper.test.ts` — ~200 label/name → field cases (all examples from the spec), autocomplete, fuzzy, context/qualifiers, negative cases, blocked fields, confidence/ambiguity, overrides, performance.
- `matching/option-matcher.test.ts` — gender, countries, nationality, states, months, numeric ranges, degrees, education levels, dial codes, placeholder/disabled options, ambiguity.
- `content/form-detector.test.ts` — every labelling style, table layouts, radio/checkbox groups, hidden/disabled/read-only/password exclusion, dynamic fields, shadow DOM, iframes, duplicates, and a privacy check that values never appear in descriptors.
- `content/form-filler.test.tsx` — event order, **real React 19** controlled text/select/checkbox/radio (plus a negative control showing plain `el.value =` does *not* update React), **real Vue 3** `v-model`, Angular's `DefaultValueAccessor` event contract, masked inputs, undo, re-rendered elements.
- `core/fill-plan.test.ts` — a full application form end to end (detect → map → assess → fill), sensitive/uncertain/prefilled decisions, formatting.
- `core/import-export.test.ts` — round trips, encryption, wrong password, tampering, hostile input.
- `storage/`, `utils/` — profiles, settings invariants, history, overrides, masking, validation, formatters, completeness.

**End to end** — `scripts/e2e.mjs` builds `dist-e2e/` (a test build that adds `<all_urls>` host access and a `?tabId=` popup hook, both compiled out of real builds), starts an isolated headless Chrome with a throwaway profile, loads the extension through the DevTools protocol, seeds a sample profile, drives the real popup against every test page and checks the resulting DOM values and framework state. Screenshots of every screen (light and dark) are written to `e2e-output/`. Set `CHROME_PATH` if Chrome isn't in a standard location.

---

## Known limitations & roadmap

- **Custom dropdown widgets** (react-select, MUI Select, Workday comboboxes) aren't native `<select>`s; One-Fill fills the ones backed by real inputs but can't yet open and pick from JS-rendered option lists.
- **Rich-text editors** and `contenteditable` fields aren't filled yet.
- **Cross-origin iframes** are only reachable once optional site access is granted (activeTab covers the top frame's origin).
- **Closed shadow roots** are inaccessible by design.
- **Split inputs** (Aadhaar or OTP spread across several boxes, three-part phone numbers) aren't combined yet.
- **One address** per profile (current = permanent); separate correspondence/permanent addresses are a natural next step.
- **Work history** (multiple past jobs with dates) and **salary** fields are not modelled.
- **AI fallback** — the resolver hook is ready. A future version could add an opt-in on-device or user-keyed LLM for leftover fields.
- **Encrypted at rest** — profiles are stored unencrypted in extension storage (like browser autofill). An optional passphrase-locked vault would be the next security step.
- **Sync across devices** — intentionally absent for the local-first MVP; could be added via encrypted exports or `chrome.storage.sync` for non-sensitive fields.
- **Web Store packaging** — add a `zip` script, store screenshots and listing copy.
