import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadLedger() {
  try {
    return await import('../api/_paymentLedger.js');
  } catch (error) {
    assert.fail(`payment ledger helper is not implemented: ${error.message}`);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createMemorySupabase(initialAttempts = []) {
  const attempts = initialAttempts.map((row) => ({
    provider: 'asaas',
    attempt_kind: 'retry',
    ...clone(row),
  }));
  let sequence = attempts.length;

  function pgUnique(constraint, message = 'duplicate key value violates unique constraint') {
    return { code: '23505', constraint, message };
  }

  function matchesOpenRetry(row) {
    return row.attempt_kind === 'retry' && ['claimed', 'provider_uncertain', 'pending'].includes(row.state);
  }

  function selectChain() {
    let current = attempts;
    const chain = {
      eq(column, value) {
        current = current.filter((row) => String(row[column] ?? '') === String(value));
        return chain;
      },
      in(column, values) {
        current = current.filter((row) => values.includes(row[column]));
        return chain;
      },
      neq(column, value) {
        current = current.filter((row) => String(row[column] ?? '') !== String(value));
        return chain;
      },
      order() {
        return chain;
      },
      limit(count) {
        return Promise.resolve({ data: clone(current.slice(0, count)), error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: clone(current[0] || null), error: null });
      },
      single() {
        return Promise.resolve({ data: clone(current[0] || null), error: null });
      },
    };
    return chain;
  }

  return {
    attempts,
    from(table) {
      assert.equal(table, 'payment_attempts');
      return {
        select() {
          return selectChain();
        },
        insert(input) {
          const row = Array.isArray(input) ? input[0] : input;
          return {
            select() {
              return {
                async single() {
                  await Promise.resolve();
                  const sameKey = attempts.find((candidate) =>
                    String(candidate.order_id) === String(row.order_id) &&
                    String(candidate.attempt_key) === String(row.attempt_key));
                  if (sameKey) {
                    return { data: null, error: pgUnique('payment_attempts_order_key_unique') };
                  }
                  const sameReference = attempts.find((candidate) => candidate.external_reference === row.external_reference);
                  if (sameReference) {
                    return { data: null, error: pgUnique('payment_attempts_external_reference_unique') };
                  }
                  if (row.provider_payment_id) {
                    const sameProviderPayment = attempts.find((candidate) =>
                      candidate.provider === (row.provider || 'asaas') &&
                      candidate.provider_payment_id === row.provider_payment_id);
                    if (sameProviderPayment) {
                      return { data: null, error: pgUnique('payment_attempts_provider_payment_unique') };
                    }
                  }
                  if (matchesOpenRetry(row)) {
                    const openRetry = attempts.find((candidate) =>
                      String(candidate.order_id) === String(row.order_id) && matchesOpenRetry(candidate));
                    if (openRetry) {
                      return { data: null, error: pgUnique('payment_attempts_one_open_retry_per_order') };
                    }
                  }
                  const inserted = { id: row.id || `attempt-${++sequence}`, ...clone(row) };
                  attempts.push(inserted);
                  return { data: clone(inserted), error: null };
                },
              };
            },
          };
        },
        update(update) {
          return {
            async eq(column, value) {
              const target = attempts.find((row) => String(row[column] ?? '') === String(value));
              if (!target) return { data: null, error: null };
              if (update.provider_payment_id) {
                const conflict = attempts.find((candidate) =>
                  candidate !== target &&
                  candidate.provider === (target.provider || 'asaas') &&
                  candidate.provider_payment_id === update.provider_payment_id);
                if (conflict) {
                  return { data: null, error: pgUnique('payment_attempts_provider_payment_unique') };
                }
              }
              Object.assign(target, clone(update));
              return { data: clone(target), error: null };
            },
          };
        },
      };
    },
  };
}

test('migration 016 adds payment kind, original backfill, and one-open-retry partial unique index', async () => {
  const sql = await readFile(new URL('../supabase/migration_016_payment_attempt_serialization.sql', import.meta.url), 'utf8');
  assert.match(sql, /attempt_kind/i);
  assert.match(sql, /original/i);
  assert.match(sql, /insert\s+into\s+public\.payment_attempts/i);
  assert.match(sql, /having\s+count\(\*\)\s*>\s*1/i);
  assert.match(sql, /raise\s+exception[\s\S]*open retry/i);
  assert.match(sql, /create\s+unique\s+index[\s\S]*payment_attempts\s*\(\s*order_id\s*\)[\s\S]*where[\s\S]*claimed[\s\S]*provider_uncertain[\s\S]*pending/i);
  assert.match(sql, /enable\s+row\s+level\s+security/i);
});

test('different retry key is rejected while an open retry exists', async () => {
  const { claimRetryPaymentAttempt } = await loadLedger();
  const supabase = createMemorySupabase([{
    id: 'attempt-open', order_id: 'order-1', attempt_key: 'retry_A_000000000',
    external_reference: 'NA-RETRY-A', payment_method: 'pix', state: 'pending', attempt_kind: 'retry',
  }]);

  await assert.rejects(
    claimRetryPaymentAttempt(supabase, { id: 'order-1' }, 'retry_B_000000000', 'pix'),
    (error) => error?.code === 'payment_attempt_in_progress',
  );
  assert.equal(supabase.attempts.length, 1);
});

test('terminal previous retry permits a new retry claim', async () => {
  const { claimRetryPaymentAttempt } = await loadLedger();
  const supabase = createMemorySupabase([{
    id: 'attempt-old', order_id: 'order-2', attempt_key: 'retry_old_0000000',
    external_reference: 'NA-RETRY-OLD', payment_method: 'pix', state: 'failed', attempt_kind: 'retry',
  }]);

  const claimed = await claimRetryPaymentAttempt(supabase, { id: 'order-2' }, 'retry_new_0000000', 'pix');
  assert.equal(claimed.state, 'claimed');
  assert.equal(claimed.attempt_kind, 'retry');
  assert.equal(supabase.attempts.length, 2);
});

test('provider_uncertain open retry blocks a different retry key', async () => {
  const { claimRetryPaymentAttempt } = await loadLedger();
  const supabase = createMemorySupabase([{
    id: 'attempt-uncertain', order_id: 'order-3', attempt_key: 'retry_uncertain_00',
    external_reference: 'NA-RETRY-UNCERTAIN', payment_method: 'pix', state: 'provider_uncertain', attempt_kind: 'retry',
  }]);

  await assert.rejects(
    claimRetryPaymentAttempt(supabase, { id: 'order-3' }, 'retry_other_000000', 'pix'),
    (error) => error?.code === 'payment_attempt_in_progress',
  );
});

test('23505 from the open-attempt index resolves as payment_attempt_in_progress, not same-key idempotency', async () => {
  const { claimRetryPaymentAttempt } = await loadLedger();
  const supabase = createMemorySupabase();
  const first = await claimRetryPaymentAttempt(supabase, { id: 'order-race' }, 'retry_first_000000', 'pix');
  assert.equal(first.state, 'claimed');

  await assert.rejects(
    claimRetryPaymentAttempt(supabase, { id: 'order-race' }, 'retry_second_00000', 'pix'),
    (error) => error?.code === 'payment_attempt_in_progress' && error?.openAttempt?.attempt_key === 'retry_first_000000',
  );
});

test('two simultaneous different retry keys can create at most one provider payment', async () => {
  const { claimRetryPaymentAttempt, persistPaymentAttemptIdentity } = await loadLedger();
  const { executePaymentRetry } = await import('../api/_paymentRetrySafety.js');
  const supabase = createMemorySupabase();
  const order = { id: 'order-concurrent', order_code: 'NA-CONCURRENT', payment_state: 'failed' };
  let createCalls = 0;

  const run = (attemptKey) => executePaymentRetry({
    order,
    attemptKey,
    paymentMethod: 'pix',
    claimAttempt: ({ attemptKey: key }) => claimRetryPaymentAttempt(supabase, order, key, 'pix'),
    recoverPayment: async () => ({ kind: 'none' }),
    createPayment: async ({ attempt }) => {
      createCalls += 1;
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: `pay-${attempt.id}` },
        orderUpdate: { payment_state: 'pending', payment_external_id: `pay-${attempt.id}` },
      };
    },
    persistPayment: async ({ attempt, paymentResult }) => persistPaymentAttemptIdentity(supabase, attempt, {
      providerPaymentId: paymentResult.payload.externalId,
      state: paymentResult.payload.state,
    }),
    markAttemptUncertain: async () => {},
    markAttemptFailed: async () => {},
  });

  const results = await Promise.allSettled([
    run('retry_concurrent_A_000000'),
    run('retry_concurrent_B_000000'),
  ]);

  assert.equal(createCalls, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason?.code === 'payment_attempt_in_progress').length, 1);
});

test('original payment identity is durably persisted and provider ID conflicts are explicit', async () => {
  const { ensureOriginalPaymentAttempt } = await loadLedger();
  const supabase = createMemorySupabase();
  const order = { id: 'order-original', order_code: 'NA-ORIGINAL', payment_method: 'pix', payment_state: 'pending' };

  const original = await ensureOriginalPaymentAttempt(supabase, order, {
    providerPaymentId: 'pay-original',
    state: 'paid',
    lastEventId: 'evt-paid',
    providerReportedState: 'paid',
    providerAmountCents: 6000,
    amountVerificationState: 'verified',
  });
  assert.equal(original.attempt_kind, 'original');
  assert.equal(original.external_reference, 'NA-ORIGINAL');
  assert.equal(original.provider_payment_id, 'pay-original');
  assert.equal(original.state, 'paid');

  await assert.rejects(
    ensureOriginalPaymentAttempt(supabase, order, { providerPaymentId: 'pay-different', state: 'paid', providerReportedState: 'paid', providerAmountCents: 6000, amountVerificationState: 'verified' }),
    (error) => error?.code === 'payment_reference_conflict',
  );
});

test('original and retry payments can both remain durably paid', async () => {
  const {
    ensureOriginalPaymentAttempt,
    claimRetryPaymentAttempt,
    persistPaymentAttemptIdentity,
    findOtherPaidPaymentForOrder,
  } = await loadLedger();
  const supabase = createMemorySupabase();
  const order = { id: 'order-double-paid', order_code: 'NA-DOUBLE', payment_method: 'pix', payment_state: 'paid' };

  const original = await ensureOriginalPaymentAttempt(supabase, order, {
    providerPaymentId: 'pay-original', state: 'paid', lastEventId: 'evt-original', providerReportedState: 'paid', providerAmountCents: 6000, amountVerificationState: 'verified',
  });
  const retry = await claimRetryPaymentAttempt(supabase, order, 'retry_double_paid_0000', 'pix');
  await persistPaymentAttemptIdentity(supabase, retry, {
    providerPaymentId: 'pay-retry', state: 'paid', lastEventId: 'evt-retry', providerReportedState: 'paid', providerAmountCents: 6000, amountVerificationState: 'verified',
  });

  const otherFromRetry = await findOtherPaidPaymentForOrder(supabase, order.id, retry.id);
  const otherFromOriginal = await findOtherPaidPaymentForOrder(supabase, order.id, original.id);
  assert.equal(otherFromRetry.payment.id, original.id);
  assert.equal(otherFromOriginal.payment.id, retry.id);
  assert.equal(supabase.attempts.filter((attempt) => attempt.state === 'paid').length, 2);
});

test('refund ownership switches between original and retry paid records, and stale refunds are ignored', async () => {
  const { decidePaymentOrderTransition } = await loadLedger();
  const original = { id: 'original', attempt_kind: 'original', state: 'refunded', provider_payment_id: 'pay-original', payment_method: 'pix' };
  const retry = { id: 'retry', attempt_kind: 'retry', state: 'paid', provider_payment_id: 'pay-retry', payment_method: 'pix' };

  const retryRefund = decidePaymentOrderTransition({
    order: { payment_state: 'paid', active_payment_attempt_id: 'retry', payment_external_id: 'pay-retry' },
    paymentRecord: { ...retry, state: 'refunded' },
    proposedState: 'refunded',
    otherPaidPayment: { ...original, state: 'paid' },
  });
  assert.equal(retryRefund.action, 'switch_to_paid');
  assert.equal(retryRefund.activePayment.id, 'original');
  assert.equal(retryRefund.nextState, 'paid');

  const originalRefund = decidePaymentOrderTransition({
    order: { payment_state: 'paid', active_payment_attempt_id: 'original', payment_external_id: 'pay-original' },
    paymentRecord: original,
    proposedState: 'refunded',
    otherPaidPayment: retry,
  });
  assert.equal(originalRefund.action, 'switch_to_paid');
  assert.equal(originalRefund.activePayment.id, 'retry');

  const onlyRefund = decidePaymentOrderTransition({
    order: { payment_state: 'paid', active_payment_attempt_id: 'original', payment_external_id: 'pay-original' },
    paymentRecord: original,
    proposedState: 'refunded',
    otherPaidPayment: null,
  });
  assert.equal(onlyRefund.action, 'apply');
  assert.equal(onlyRefund.nextState, 'refunded');

  const staleRefund = decidePaymentOrderTransition({
    order: { payment_state: 'paid', active_payment_attempt_id: 'retry', payment_external_id: 'pay-retry' },
    paymentRecord: original,
    proposedState: 'refunded',
    otherPaidPayment: retry,
  });
  assert.equal(staleRefund.action, 'ignore');
});

test('paid amount must parse to safe integer cents and equal authoritative order total', async () => {
  const { validatePaidPaymentAmount } = await loadLedger();
  assert.deepEqual(validatePaidPaymentAmount('123.45', 12345), { ok: true, cents: 12345 });
  assert.equal(validatePaidPaymentAmount('123.44', 12345).error, 'payment_amount_mismatch');
  assert.equal(validatePaidPaymentAmount('123.456', 12345).error, 'payment_amount_invalid');
  assert.equal(validatePaidPaymentAmount('not-a-number', 12345).error, 'payment_amount_invalid');
});

test('late original webhook ownership is materialized into the payment ledger before order state handling', async () => {
  const { ensurePaymentRecordForWebhook } = await import('../api/asaas-webhook.js');
  const supabase = createMemorySupabase();
  const order = {
    id: 'order-late-original',
    order_code: 'NA-LATE-ORIGINAL',
    payment_method: 'pix',
    payment_state: 'paid',
    payment_external_id: 'pay-retry-active',
    active_payment_attempt_id: 'retry-active',
  };

  const record = await ensurePaymentRecordForWebhook(supabase, {
    order,
    attempt: null,
    lookup: 'order_external_reference',
    payment: { id: 'pay-late-original', externalReference: 'NA-LATE-ORIGINAL' },
  });

  assert.equal(record.attempt_kind, 'original');
  assert.equal(record.provider_payment_id, 'pay-late-original');
  assert.equal(record.external_reference, 'NA-LATE-ORIGINAL');
  assert.equal(supabase.attempts.length, 1);
});

test('new checkout claims original ledger ownership before provider POST and persists provider identity after creation', async () => {
  const { createOrdersHandler } = await import('../api/orders.js');
  const calls = [];
  const order = {
    id: 'order-checkout-ledger',
    order_code: 'NA-CHECKOUT-LEDGER',
    status: 'new',
    checkout_finalization_state: 'in_progress',
    customer_name: 'Cliente Teste',
    customer_email: 'cliente@example.test',
    customer_phone: '37999999999',
    customer_cpf_cnpj: '12345678901',
    total_cents: 6000,
    payment_method: 'pix',
    payment_state: 'pending',
  };
  const supabase = {
    from(table) {
      if (table === 'orders') {
        return {
          insert() {
            return { select() { return { async single() { return { data: order, error: null }; } }; } };
          },
          update(update) {
            calls.push(`order-update:${update.payment_external_id || update.checkout_finalization_state || 'metadata'}`);
            return { async eq() { return { error: null }; } };
          },
        };
      }
      if (table === 'order_items') return { async insert() { return { error: null }; } };
      throw new Error(`unexpected table ${table}`);
    },
  };
  const originalAttempt = {
    id: 'attempt-original', order_id: order.id, attempt_key: 'original', attempt_kind: 'original',
    external_reference: order.order_code, payment_method: 'pix', state: 'claimed', provider: 'asaas',
    provider_payment_id: null,
  };
  const handler = createOrdersHandler({
    consumeRateLimits: async () => ({ allowed: true }),
    hasOpenOrderClosure: async () => null,
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => supabase,
    findIdempotentOrder: async () => ({ data: null, error: null }),
    generateUniqueOrderCode: async () => order.order_code,
    resolveCatalogItems: async () => ({
      resolvedItems: [{ productId: 'p1', productName: 'Body', size: 'P', qty: 1, unitPriceCents: 5000, lineTotalCents: 5000, weightGrams: 200 }],
      subtotalCents: 5000,
    }),
    calculateAuthoritativeShipping: async () => ({
      feeCents: 1000, etaText: '1 dia útil', source: 'local_fixed', destination: { city: 'Divinópolis', uf: 'MG' },
    }),
    reserveOrderInventory: async (_supabase, orderId) => {
      calls.push('reserve-inventory');
      return { ...order, id: orderId, inventory_state: 'reserved' };
    },
    ensureOriginalPaymentAttempt: async () => {
      calls.push('claim-original');
      return originalAttempt;
    },
    persistPaymentAttemptIdentity: async (_supabase, attempt, input) => {
      calls.push(`persist-original:${attempt.id}:${input.providerPaymentId}:${input.state}`);
      return { ...attempt, provider_payment_id: input.providerPaymentId, state: input.state };
    },
    createAsaasOrderPayment: async () => {
      calls.push('create-provider');
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: 'pay-checkout-ledger', copyPaste: 'pix-code' },
        orderUpdate: {
          payment_method: 'pix', payment_state: 'pending', payment_provider: 'asaas',
          payment_external_id: 'pay-checkout-ledger', payment_ref: 'pay-checkout-ledger',
        },
      };
    },
  });
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: {
      idempotencyKey: 'checkout_550e8400-e29b-41d4-a716-446655440000',
      customer: { name: 'Cliente Teste', phone: '37999999999', email: 'ignored@example.test', cpfCnpj: '12345678901' },
      address: { cep: '35500000', street: 'Rua A', number: '1', city: 'Divinópolis', uf: 'MG' },
      payment: { method: 'pix' },
      items: [{ productId: 'p1', size: 'P', qty: 1 }],
    },
  };
  const res = {
    statusCode: null, body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.ok(calls.indexOf('claim-original') < calls.indexOf('create-provider'));
  assert.ok(calls.indexOf('create-provider') < calls.indexOf('persist-original:attempt-original:pay-checkout-ledger:pending'));
  assert.ok(calls.some((call) => call === 'order-update:pay-checkout-ledger'));
});

test('historical direct provider-id webhook with no active ledger owner materializes original ownership', async () => {
  const { ensurePaymentRecordForWebhook } = await import('../api/asaas-webhook.js');
  const supabase = createMemorySupabase();
  const order = {
    id: 'order-direct-historical',
    order_code: 'NA-DIRECT-HISTORICAL',
    payment_method: 'pix',
    payment_state: 'pending',
    payment_external_id: 'pay-direct-historical',
    active_payment_attempt_id: null,
  };

  const record = await ensurePaymentRecordForWebhook(supabase, {
    order,
    attempt: null,
    lookup: 'order_payment_external_id',
    payment: { id: 'pay-direct-historical' },
  });

  assert.equal(record.attempt_kind, 'original');
  assert.equal(record.provider_payment_id, 'pay-direct-historical');
  assert.equal(record.external_reference, order.order_code);
});

test('preserved terminal attempt state marks stale provider events as non-applicable', async () => {
  const { isStalePaymentAttemptTransition } = await loadLedger();
  assert.equal(isStalePaymentAttemptTransition({ proposedState: 'paid', persistedState: 'refunded' }), true);
  assert.equal(isStalePaymentAttemptTransition({ proposedState: 'pending', persistedState: 'paid' }), true);
  assert.equal(isStalePaymentAttemptTransition({ proposedState: 'refunded', persistedState: 'refunded' }), false);
  assert.equal(isStalePaymentAttemptTransition({ proposedState: 'paid', persistedState: 'paid' }), false);
});
