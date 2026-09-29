import { useState } from 'react';
import { createRoot } from 'react-dom/client';

/** A typical React signup form with fully controlled inputs and live validation. */
function SignupForm() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', country: '', gender: '', experience: '', terms: false });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const valid = /^[^@\s]+@[^@\s]+\.\w{2,}$/.test(form.email);

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="row">
        <div className="field">
          <label htmlFor="r-first">First name</label>
          <input id="r-first" name="firstName" value={form.firstName} onChange={set('firstName')} />
        </div>
        <div className="field">
          <label htmlFor="r-last">Last name</label>
          <input id="r-last" name="lastName" value={form.lastName} onChange={set('lastName')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="r-email">Work email</label>
        <input id="r-email" type="email" name="email" value={form.email} onChange={set('email')} />
        {form.email && <span className={valid ? 'ok' : ''}>{valid ? '✓ Looks good' : 'Enter a valid email'}</span>}
      </div>
      <div className="field">
        <label htmlFor="r-phone">Phone number</label>
        <input id="r-phone" type="tel" name="phone" value={form.phone} onChange={set('phone')} />
      </div>
      <div className="field">
        <label htmlFor="r-country">Country</label>
        <select id="r-country" name="country" value={form.country} onChange={set('country')}>
          <option value="">Select a country</option>
          <option value="us">United States</option>
          <option value="in">India</option>
          <option value="uk">United Kingdom</option>
        </select>
      </div>
      <fieldset>
        <legend>Gender</legend>
        {['Male', 'Female', 'Non-binary'].map((g) => (
          <label key={g}>
            <input type="radio" name="gender" value={g} checked={form.gender === g} onChange={set('gender')} /> {g}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="r-exp">Years of experience</label>
        <input id="r-exp" type="number" name="experience" value={form.experience} onChange={set('experience')} />
      </div>
      <p>
        <label>
          <input type="checkbox" name="terms" checked={form.terms} onChange={set('terms')} /> I accept the terms of service
        </label>
      </p>
      <h2>React state</h2>
      <pre className="state" id="react-state">{JSON.stringify(form, null, 2)}</pre>
    </form>
  );
}

createRoot(document.getElementById('root')!).render(<SignupForm />);
