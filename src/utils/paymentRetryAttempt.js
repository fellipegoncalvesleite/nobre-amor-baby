const STORAGE_PREFIX = 'nobre_amor_v1_payment_retry_attempt:';
const TERMINAL_PREFIX = 'nobre_amor_v1_payment_retry_terminal:';

function getStorageKey(orderCode) {
  return `${STORAGE_PREFIX}${String(orderCode || '').trim()}`;
}

function getTerminalKey(orderCode) {
  return `${TERMINAL_PREFIX}${String(orderCode || '').trim()}`;
}

export function getOrCreatePaymentRetryAttemptKey(orderCode, options = {}) {
  const storage = options.storage || globalThis.sessionStorage;
  const randomUUID = options.randomUUID || globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!storage || !randomUUID) {
    throw new Error('Não foi possível criar uma tentativa segura de pagamento.');
  }

  const storageKey = getStorageKey(orderCode);
  const terminalKey = getTerminalKey(orderCode);
  if (storage.getItem(terminalKey)) {
    storage.removeItem(storageKey);
    storage.removeItem(terminalKey);
  }

  const existing = storage.getItem(storageKey);
  if (existing) return existing;

  const attemptKey = `retry_${randomUUID()}`;
  storage.setItem(storageKey, attemptKey);
  return attemptKey;
}

export function markPaymentRetryAttemptTerminal(orderCode, options = {}) {
  const storage = options.storage || globalThis.sessionStorage;
  if (!storage) return;
  storage.setItem(getTerminalKey(orderCode), '1');
}

export function clearPaymentRetryAttemptKey(orderCode, options = {}) {
  const storage = options.storage || globalThis.sessionStorage;
  if (!storage) return;
  storage.removeItem(getStorageKey(orderCode));
  storage.removeItem(getTerminalKey(orderCode));
}
