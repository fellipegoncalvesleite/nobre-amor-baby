const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (
    key.length < IDEMPOTENCY_KEY_MIN_LENGTH ||
    key.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(key)
  ) {
    const error = new Error('Idempotency key inválida.');
    error.code = 'invalid_idempotency_key';
    throw error;
  }
  return key;
}

const ALLOWED_PAYMENT_TRANSITIONS = new Map([
  ['pending', new Set(['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'])],
  ['failed', new Set(['failed', 'paid', 'refunded'])],
  ['expired', new Set(['expired', 'paid', 'refunded'])],
  ['paid', new Set(['paid', 'refunded'])],
  ['refunded', new Set(['refunded'])],
  ['cancelled', new Set(['cancelled'])],
]);

export function preservePaymentState(currentState, proposedState) {
  const current = String(currentState || 'pending').toLowerCase();
  const proposed = String(proposedState || 'pending').toLowerCase();
  const allowed = ALLOWED_PAYMENT_TRANSITIONS.get(current);
  if (!allowed) return proposed;
  return allowed.has(proposed) ? proposed : current;
}

export function getWebhookLookupSequence(payment = {}) {
  const sequence = [];
  const paymentId = String(payment.id || '').trim();
  const externalReference = String(payment.externalReference || '').trim();

  if (paymentId) {
    sequence.push({ column: 'payment_external_id', value: paymentId });
  }
  if (externalReference) {
    sequence.push({ column: 'order_code', value: externalReference });
  }

  return sequence;
}
