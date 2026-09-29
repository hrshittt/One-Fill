import type { ThemePreference } from '../types/settings';

/** Applies the theme preference; "system" follows prefers-color-scheme via CSS. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
}

let toastTimer: number | undefined;

/** A small status toast for extension pages. */
export function toast(message: string, tone: 'success' | 'error' | 'info' = 'success', timeout = 2600): void {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  region.textContent = '';
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.textContent = message;
  region.appendChild(el);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add('toast-leave'), timeout);
  window.setTimeout(() => el.remove(), timeout + 300);
}
