import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('client retry attempt key survives repeated network attempts until explicit clear', async () => {
  const { getOrCreatePaymentRetryAttemptKey, clearPaymentRetryAttemptKey } = await import('../src/utils/paymentRetryAttempt.js');
  const storage = new MemoryStorage();
  let uuidCalls = 0;
  const randomUUID = () => {
    uuidCalls += 1;
    return '550e8400-e29b-41d4-a716-446655440000';
  };

  const first = getOrCreatePaymentRetryAttemptKey('NA-ORDER-1', { storage, randomUUID });
  const second = getOrCreatePaymentRetryAttemptKey('NA-ORDER-1', { storage, randomUUID });

  assert.equal(first, 'retry_550e8400-e29b-41d4-a716-446655440000');
  assert.equal(second, first);
  assert.equal(uuidCalls, 1);

  clearPaymentRetryAttemptKey('NA-ORDER-1', { storage });
  const third = getOrCreatePaymentRetryAttemptKey('NA-ORDER-1', { storage, randomUUID });
  assert.equal(third, first);
  assert.equal(uuidCalls, 2);
});

test('a terminal attempt is replaced only on the next explicit get-or-create action', async () => {
  const {
    getOrCreatePaymentRetryAttemptKey,
    markPaymentRetryAttemptTerminal,
  } = await import('../src/utils/paymentRetryAttempt.js');
  const storage = new MemoryStorage();
  const values = [
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440002',
  ];
  const randomUUID = () => values.shift();

  const first = getOrCreatePaymentRetryAttemptKey('NA-ORDER-2', { storage, randomUUID });
  markPaymentRetryAttemptTerminal('NA-ORDER-2', { storage });

  assert.equal(storage.getItem('nobre_amor_v1_payment_retry_attempt:NA-ORDER-2'), first);
  const second = getOrCreatePaymentRetryAttemptKey('NA-ORDER-2', { storage, randomUUID });
  assert.notEqual(second, first);
  assert.equal(second, 'retry_550e8400-e29b-41d4-a716-446655440002');
});
