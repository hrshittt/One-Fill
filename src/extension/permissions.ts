/**
 * Optional "site access" permission. One-Fill works without it (via activeTab when you click the
 * icon); it is only requested when the user turns on page-load detection or safe auto-fill.
 */
export const SITE_ACCESS: chrome.permissions.Permissions = { origins: ['http://*/*', 'https://*/*'] };

export async function hasSiteAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(SITE_ACCESS);
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (e.g. a toggle click) in an extension page. */
export async function requestSiteAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request(SITE_ACCESS);
  } catch {
    return false;
  }
}

export async function revokeSiteAccess(): Promise<void> {
  try {
    await chrome.permissions.remove(SITE_ACCESS);
  } catch {
    /* ignore */
  }
}
