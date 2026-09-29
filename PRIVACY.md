# One-Fill Privacy Policy

_Last updated: September 2026_

One-Fill is a local-first autofill extension. There is no account, no server and no analytics. This policy explains what One-Fill stores, what it can access and what it never does.

## What One-Fill stores

All data is stored **only on your device**, in Chrome's extension storage (`chrome.storage.local`):

- **Your profile details** — the information you enter (name, contact details, address, education, professional details, identification numbers, emergency contacts). You can keep several profiles.
- **Resume files** you choose to upload, so they can be attached to upload fields.
- **Settings**, and **mapping corrections** you confirm per website. A correction is a field fingerprint plus which profile field it maps to, never a value.
- **Form history (optional)** — website domain, page title, date and number of fields filled. **Never** the values filled and never full page URLs. History can be turned off or cleared at any time.

Uninstalling the extension deletes all of this data.

## What One-Fill does not do

- It does not send your data to any server. One-Fill makes no network requests.
- It does not use analytics, telemetry, crash reporting or advertising.
- It does not sell, share or upload your profile.
- It does not silently fill sensitive identifiers (PAN, Aadhaar, passport, driving licence, voter ID). These are filled only when you explicitly select them.
- It never fills passwords, one-time codes, captchas, payment card or bank details, and it never ticks consent or declaration boxes.

## Access to web pages

By default One-Fill can read a page **only after you click its toolbar icon or press its keyboard shortcut** (Chrome's `activeTab` permission). It then inspects the form fields on that page (labels, field names and types) to work out what each field asks for. It does not read values already typed into the page. It only checks whether a field is empty.

If you turn on **Detect forms as pages load** or **Auto-fill safe fields**, Chrome asks you to allow access to the sites you visit. You can revoke this at any time in One-Fill's settings or at `chrome://extensions`.

## How your data is protected

- Extension storage is restricted to One-Fill's own pages. Scripts running on websites cannot read your profile.
- A website only receives the values for the fields you choose to fill.
- Sensitive values are masked in One-Fill's interface until you reveal them.
- Exports exclude identification numbers unless you opt in, and can be encrypted with a password (AES-256-GCM).

## Your choices

From One-Fill's settings page you can edit or delete any detail, export or import your data, clear history, forget remembered corrections, revoke optional site access, or delete all One-Fill data.

## Contact

Questions about this policy can be raised through the extension's support channel on the Chrome Web Store listing.
