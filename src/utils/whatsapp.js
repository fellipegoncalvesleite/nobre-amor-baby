/**
 * whatsapp.js — WhatsApp helpers with test-mode support.
 *
 * Environment variables (set in .env):
 *   VITE_WA_TEST=true           — enable test mode
 *   VITE_WA_TEST_NUMBER=5537... — target number in test mode
 *
 * Production number: +55 37 99841-3962 → 5537998413962
 */

/** Production manager number (digits only). */
const PRODUCTION_NUMBER = '5537998413962';

/**
 * Check if WhatsApp test mode is active.
 */
export function isWaTestMode() {
  return import.meta.env.VITE_WA_TEST === 'true';
}

/**
 * Get the target WhatsApp number.
 * In test mode returns the test number, otherwise production.
 */
export function getWhatsAppTargetNumber() {
  if (isWaTestMode()) {
    const testNum = (import.meta.env.VITE_WA_TEST_NUMBER || '').replace(/\D/g, '');
    return testNum || PRODUCTION_NUMBER;
  }
  return PRODUCTION_NUMBER;
}

/**
 * Get masked version of target number (for debug display).
 * Shows only last 4 digits.
 */
export function getMaskedTargetNumber() {
  const num = getWhatsAppTargetNumber();
  if (num.length <= 4) return num;
  return '•'.repeat(num.length - 4) + num.slice(-4);
}

/**
 * Open WhatsApp with a message.
 *
 * @param {string} message — unencoded message text
 * @param {{ testPrefix?: boolean }} options
 */
export function openWhatsApp(message, { testPrefix = true } = {}) {
  const target = getWhatsAppTargetNumber();
  const finalMsg = (isWaTestMode() && testPrefix) ? `(TESTE) ${message}` : message;
  const encoded = encodeURIComponent(finalMsg);
  window.open(
    `https://wa.me/${target}?text=${encoded}`,
    '_blank',
    'noopener,noreferrer',
  );
}
