const AUTH_EVENT_KEY = 'nobre_amor_auth_debug';
const AUTH_CALLBACK_KEY = 'nobre_amor_callback_debug';
const AUTH_REQUEST_KEY = 'nobre_amor_auth_requests';

export const AUTH_DIAGNOSTIC_KEYS = [AUTH_EVENT_KEY, AUTH_CALLBACK_KEY, AUTH_REQUEST_KEY];

const AUTH_EVENT_LIMIT = 20;
const AUTH_REQUEST_LIMIT = 40;
const CALLBACK_PARAMETER_LIMIT = 30;
const SAFE_FLOW_TYPES = new Set([
  'email',
  'email_change',
  'invite',
  'magiclink',
  'recovery',
  'signup',
]);

function defaultEnabled() {
  return Boolean(import.meta.env?.DEV);
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function timestamp(now) {
  try {
    return typeof now === 'function' ? String(now()) : new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function readArray(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendBounded(storage, key, entry, limit) {
  if (!storage) return;
  try {
    const entries = readArray(storage, key);
    entries.push(entry);
    if (entries.length > limit) entries.splice(0, entries.length - limit);
    storage.setItem(key, JSON.stringify(entries));
  } catch {
    // Diagnostics must never affect authentication.
  }
}

function cleanText(value, maxLength = 80) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function cleanStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function cleanParameterNames(values) {
  if (!Array.isArray(values)) return [];
  const names = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (!/^[A-Za-z0-9_.~-]{1,64}$/.test(name) || names.includes(name)) continue;
    names.push(name);
    if (names.length >= CALLBACK_PARAMETER_LIMIT) break;
  }
  return names;
}

function cleanReturnPath(value) {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path.split(/[?#]/, 1)[0].slice(0, 300) || '/';
}

function cleanFlowType(value) {
  const type = cleanText(value, 40);
  return type && SAFE_FLOW_TYPES.has(type) ? type : null;
}

export function clearAuthDiagnostics(storage = resolveStorage()) {
  const target = resolveStorage(storage);
  if (!target) return;
  for (const key of AUTH_DIAGNOSTIC_KEYS) {
    try {
      target.removeItem(key);
    } catch {
      // Storage can be disabled by the browser; cleanup is best effort.
    }
  }
}

export function recordAuthEvent(input = {}, options = {}) {
  const enabled = options.enabled ?? defaultEnabled();
  if (!enabled) return;
  const storage = resolveStorage(options.storage);
  if (!storage) return;

  appendBounded(storage, AUTH_EVENT_KEY, {
    event: cleanText(input.event, 80) || 'UNKNOWN',
    timestamp: timestamp(options.now),
    hasSession: Boolean(input.hasSession),
  }, AUTH_EVENT_LIMIT);
}

export function recordAuthRequest(input = {}, options = {}) {
  const enabled = options.enabled ?? defaultEnabled();
  if (!enabled) return;
  const storage = resolveStorage(options.storage);
  if (!storage) return;

  const entry = {
    method: cleanText(input.method, 80) || 'unknown',
    outcome: cleanText(input.outcome, 20) || 'unknown',
    type: cleanText(input.type, 40),
    provider: cleanText(input.provider, 40),
    status: cleanStatus(input.status),
    errorName: cleanText(input.errorName, 80),
    timestamp: timestamp(options.now),
  };

  appendBounded(storage, AUTH_REQUEST_KEY, entry, AUTH_REQUEST_LIMIT);
}

export function recordAuthCallback(input = {}, options = {}) {
  const enabled = options.enabled ?? defaultEnabled();
  if (!enabled) return;
  const storage = resolveStorage(options.storage);
  if (!storage) return;

  const entry = {
    timestamp: timestamp(options.now),
    hasHash: Boolean(input.hasHash),
    parameterNames: cleanParameterNames(input.parameterNames),
    hasCode: Boolean(input.hasCode),
    hasTokenHash: Boolean(input.hasTokenHash),
    flowType: cleanFlowType(input.flowType),
    returnPath: cleanReturnPath(input.returnPath),
  };

  try {
    storage.setItem(AUTH_CALLBACK_KEY, JSON.stringify(entry));
  } catch {
    // Diagnostics must never affect authentication.
  }
}
