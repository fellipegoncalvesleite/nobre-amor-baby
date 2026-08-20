import test from 'node:test';
import assert from 'node:assert/strict';

function createLookupSupabase({ orders = [], attempts = [] }) {
  const rows = { orders, payment_attempts: attempts };
  return {
    from(table) {
      return {
        select() {
          let current = rows[table] || [];
          const chain = {
            eq(column, value) {
              current = current.filter((row) => String(row[column] ?? '') === String(value));
              return chain;
            },
            async maybeSingle() {
              return { data: current[0] || null, error: null };
            },
          };
          return chain;
        },
      };
    },
  };
}

test('webhook resolves an old retry payment through persisted attempt identity', async () => {
  const { findPaymentContextForWebhook } = await import('../api/asaas-webhook.js');
  const supabase = createLookupSupabase({
    orders: [{
      id: 'order-1',
      order_code: 'NA-ORDER-1',
      active_payment_attempt_id: 'attempt-new',
      payment_external_id: 'pay_new',
    }],
    attempts: [{
      id: 'attempt-old',
      order_id: 'order-1',
      external_reference: 'NA-RETRY-old',
      provider_payment_id: 'pay_old',
      state: 'pending',
    }],
  });

  const context = await findPaymentContextForWebhook(supabase, {
    id: 'pay_old',
    externalReference: 'NA-RETRY-old',
  });

  assert.equal(context.error, null);
  assert.equal(context.order.id, 'order-1');
  assert.equal(context.attempt.id, 'attempt-old');
  assert.equal(context.lookup, 'attempt_provider_payment_id');
});

test('webhook resolves unknown retry payment id by exact persisted externalReference', async () => {
  const { findPaymentContextForWebhook } = await import('../api/asaas-webhook.js');
  const supabase = createLookupSupabase({
    orders: [{ id: 'order-2', order_code: 'NA-ORDER-2', payment_external_id: null }],
    attempts: [{
      id: 'attempt-2',
      order_id: 'order-2',
      external_reference: 'NA-RETRY-exact-2',
      provider_payment_id: null,
      state: 'provider_uncertain',
    }],
  });

  const context = await findPaymentContextForWebhook(supabase, {
    id: 'pay_recovered',
    externalReference: 'NA-RETRY-exact-2',
  });

  assert.equal(context.order.id, 'order-2');
  assert.equal(context.attempt.id, 'attempt-2');
  assert.equal(context.lookup, 'attempt_external_reference');
});

test('webhook can find another paid attempt when the active paid attempt is refunded', async () => {
  const { findOtherPaidAttemptForWebhook } = await import('../api/asaas-webhook.js');
  const attempts = [
    { id: 'attempt-refunded', order_id: 'order-3', state: 'refunded', provider_payment_id: 'pay_refunded' },
    { id: 'attempt-still-paid', order_id: 'order-3', state: 'paid', amount_verification_state: 'verified', provider_payment_id: 'pay_still_paid', payment_method: 'pix' },
  ];
  const supabase = {
    from(table) {
      assert.equal(table, 'payment_attempts');
      return {
        select() {
          let current = attempts;
          const chain = {
            eq(column, value) {
              current = current.filter((row) => String(row[column]) === String(value));
              return chain;
            },
            async limit(count) {
              return { data: current.slice(0, count), error: null };
            },
          };
          return chain;
        },
      };
    },
  };

  const result = await findOtherPaidAttemptForWebhook(supabase, 'order-3', 'attempt-refunded');
  assert.equal(result.error, null);
  assert.equal(result.attempt.id, 'attempt-still-paid');
  assert.equal(result.attempt.provider_payment_id, 'pay_still_paid');
});
