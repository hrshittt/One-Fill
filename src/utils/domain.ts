/** Hostname without a leading "www.", or '' for non-web URLs. */
export function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'file:') return '';
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Pages where extensions cannot (or must not) run scripts. Chrome blocks these anyway;
 * detecting them up front lets the popup show a friendly message instead of an error.
 */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  if (/^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-search|chrome-untrusted|brave|opera|vivaldi):/i.test(url)) {
    return true;
  }
  return /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i.test(url);
}
