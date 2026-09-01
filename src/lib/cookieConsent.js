export const COOKIE_CONSENT_KEY = 'nobre_amor_cookie_consent_v1';
export const COOKIE_CONSENT_ACCEPTED = 'accepted';
export const COOKIE_CONSENT_REJECTED = 'rejected';
export const COOKIE_CONSENT_EVENT = 'nobre-amor:cookie-consent-open';

const VALID_CHOICES = new Set([
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_REJECTED,
]);

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof globalThis === 'undefined') return null;

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCookieConsent(storage) {
  try {
    const value = resolveStorage(storage)?.getItem(COOKIE_CONSENT_KEY) ?? null;
    return VALID_CHOICES.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCookieConsent(choice, storage) {
  if (!VALID_CHOICES.has(choice)) {
    throw new Error('Invalid cookie consent choice');
  }

  const target = resolveStorage(storage);
  if (target) target.setItem(COOKIE_CONSENT_KEY, choice);
  return choice;
}

export function hasOptionalCookieConsent(storage) {
  return readCookieConsent(storage) === COOKIE_CONSENT_ACCEPTED;
}
