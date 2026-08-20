import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadAtomicWebhook() {
  return import('../api/_atomicPaymentWebhook.js');
}

async function loadLedger() {
  return import('../api/_paymentLedger.js');
}

test('atomic webhook RPC failure leaves the same event retryable at the application boundary', async () => {
  const { applyAsaasWebhookAtomically } = await loadAtomicWebhook();
  let calls = 0;
  const supabase = {
    async rpc(name, params) {
      calls += 1;
      assert.equal(name, 'apply_asaas_payment_webhook');
      if (calls === 1) return { data: null, error: { code: 'XX000', message: 'simulated order mutation failure' } };
      return { data: { result: 'applied', duplicate: false, payment_state: 'paid', attempt_state: 'paid' }, error: null };
    },
  };
  const input = {
    orderId: '11111111-1111-1111-1111-111111111111',
    attemptId: '22222222-2222-2222-2222-222222222222',
    eventId: 'evt-retryable',
    payment: { id: 'pay-1', value: '60.00', billingType: 'PIX' },
    proposedState: 'paid',
    paymentMethod: 'pix',
  };

  await assert.rejects(applyAsaasWebhookAtomically(supabase, input), /simulated order mutation failure/);
  const retried = await applyAsaasWebhookAtomically(supabase, input);

  assert.equal(calls, 2);
  assert.equal(retried.result, 'applied');
  assert.equal(retried.duplicate, false);
});

test('successful atomic event can return a harmless duplicate on the next delivery', async () => {
  const { applyAsaasWebhookAtomically } = await loadAtomicWebhook();
  let calls = 0;
  const supabase = {
    async rpc() {
      calls += 1;
      if (calls === 1) return { data: { result: 'applied', duplicate: false, payment_state: 'paid' }, error: null };
      return { data: { result: 'applied', duplicate: true, payment_state: 'paid' }, error: null };
    },
  };
  const input = {
    orderId: '11111111-1111-1111-1111-111111111111',
    attemptId: '22222222-2222-2222-2222-222222222222',
    eventId: 'evt-idempotent',
    payment: { id: 'pay-1', value: '60.00' },
    proposedState: 'paid',
    paymentMethod: 'pix',
  };

  const first = await applyAsaasWebhookAtomically(supabase, input);
  const second = await applyAsaasWebhookAtomically(supabase, input);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(calls, 2);
});

test('paid amount parser distinguishes exact cents from invalid provider values before RPC', async () => {
  const { parseProviderPaymentAmountCents } = await loadAtomicWebhook();
  assert.deepEqual(parseProviderPaymentAmountCents('60.00'), { valid: true, cents: 6000 });
  assert.deepEqual(parseProviderPaymentAmountCents(60), { valid: true, cents: 6000 });
  assert.deepEqual(parseProviderPaymentAmountCents('60.001'), { valid: false, cents: null });
  assert.deepEqual(parseProviderPaymentAmountCents(undefined), { valid: false, cents: null });
});

test('paid RPC input carries parsed provider amount but leaves authoritative comparison to the database', async () => {
  const { applyAsaasWebhookAtomically } = await loadAtomicWebhook();
  let captured;
  const supabase = {
    async rpc(_name, params) {
      captured = params;
      return { data: { result: 'rejected_amount', duplicate: false, error_code: 'payment_amount_mismatch' }, error: null };
    },
  };

  const result = await applyAsaasWebhookAtomically(supabase, {
    orderId: '11111111-1111-1111-1111-111111111111',
    attemptId: '22222222-2222-2222-2222-222222222222',
    eventId: 'evt-mismatch',
    payment: { id: 'pay-mismatch', value: '50.00' },
    proposedState: 'paid',
    paymentMethod: 'pix',
  });

  assert.equal(captured.p_provider_amount_cents, 5000);
  assert.equal(captured.p_provider_amount_valid, true);
  assert.equal(result.result, 'rejected_amount');
  assert.equal(result.error_code, 'payment_amount_mismatch');
});

test('invalid or missing paid amount is sent as invalid and cannot be represented as verified paid input', async () => {
  const { applyAsaasWebhookAtomically } = await loadAtomicWebhook();
  const captured = [];
  const supabase = {
    async rpc(_name, params) {
      captured.push(params);
      return { data: { result: 'rejected_amount', error_code: 'payment_amount_invalid' }, error: null };
    },
  };
  const base = {
    orderId: '11111111-1111-1111-1111-111111111111',
    attemptId: '22222222-2222-2222-2222-222222222222',
    eventId: 'evt-invalid',
    proposedState: 'paid',
    paymentMethod: 'pix',
  };

  await applyAsaasWebhookAtomically(supabase, { ...base, payment: { id: 'pay-invalid', value: 'abc' } });
  await applyAsaasWebhookAtomically(supabase, { ...base, eventId: 'evt-missing', payment: { id: 'pay-missing' } });

  assert.equal(captured[0].p_provider_amount_valid, false);
  assert.equal(captured[0].p_provider_amount_cents, null);
  assert.equal(captured[1].p_provider_amount_valid, false);
  assert.equal(captured[1].p_provider_amount_cents, null);
});

test('paid fallback lookup excludes amount-unverified ledger rows', async () => {
  const { findOtherPaidPaymentForOrder } = await loadLedger();
  const attempts = [
    { id: 'bad', order_id: 'order-1', state: 'paid', amount_verification_state: 'mismatch' },
    { id: 'good', order_id: 'order-1', state: 'paid', amount_verification_state: 'verified' },
  ];
  const supabase = {
    from(table) {
      assert.equal(table, 'payment_attempts');
      return {
        select() {
          let current = attempts;
          const chain = {
            eq(column, value) {
              current = current.filter((row) => String(row[column] ?? '') === String(value));
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

  const fromExcluded = await findOtherPaidPaymentForOrder(supabase, 'order-1', 'excluded');
  assert.equal(fromExcluded.payment.id, 'good');
});

test('migration 017 defines backend-only atomic webhook application with row locking and transactional event idempotency', async () => {
  const sql = await readFile(new URL('../supabase/migration_017_atomic_payment_webhooks.sql', import.meta.url), 'utf8');
  assert.match(sql, /create\s+table[\s\S]*payment_webhook_events/i);
  assert.match(sql, /unique[\s\S]*provider[\s\S]*event_id/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.apply_asaas_payment_webhook/i);
  assert.match(sql, /for\s+update/i);
  assert.match(sql, /amount_verification_state/i);
  assert.match(sql, /revoke\s+execute[\s\S]*anon/i);
  assert.match(sql, /revoke\s+execute[\s\S]*authenticated/i);
  assert.match(sql, /grant\s+execute[\s\S]*service_role/i);
});

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function createWebhookSupabase({ rpcResults }) {
  const order = {
    id: '11111111-1111-1111-1111-111111111111',
    order_code: 'NA-ATOMIC-1',
    active_payment_attempt_id: '22222222-2222-2222-2222-222222222222',
    payment_external_id: 'pay-atomic-1',
    payment_last_event: null,
    payment_state: 'pending',
    payment_method: 'pix',
    payment_link_url: null,
    paid_at: null,
    paid_total_cents: null,
    total_cents: 6000,
  };
  const attempt = {
    id: '22222222-2222-2222-2222-222222222222',
    order_id: order.id,
    attempt_key: 'original',
    attempt_kind: 'original',
    external_reference: order.order_code,
    payment_method: 'pix',
    state: 'pending',
    provider: 'asaas',
    provider_payment_id: 'pay-atomic-1',
    last_event_id: null,
  };
  let rpcIndex = 0;
  let rpcCalls = 0;
  let directMutations = 0;

  const api = {
    get rpcCalls() { return rpcCalls; },
    get directMutations() { return directMutations; },
    from(table) {
      const source = table === 'orders' ? [order] : table === 'payment_attempts' ? [attempt] : [];
      return {
        select() {
          let current = source;
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
        update() {
          directMutations += 1;
          throw new Error('webhook must not mutate ledger/order outside atomic RPC');
        },
        insert() {
          directMutations += 1;
          throw new Error('unexpected direct insert');
        },
      };
    },
    async rpc(name, params) {
      rpcCalls += 1;
      assert.equal(name, 'apply_asaas_payment_webhook');
      assert.equal(params.p_order_id, order.id);
      assert.equal(params.p_payment_attempt_id, attempt.id);
      const result = rpcResults[Math.min(rpcIndex, rpcResults.length - 1)];
      rpcIndex += 1;
      return result;
    },
  };
  return api;
}

function atomicWebhookRequest({ eventId = 'evt-atomic', event = 'PAYMENT_CONFIRMED', value = '60.00' } = {}) {
  return {
    method: 'POST',
    headers: { 'asaas-access-token': 'test-webhook-token' },
    body: {
      id: eventId,
      event,
      payment: {
        id: 'pay-atomic-1',
        externalReference: 'NA-ATOMIC-1',
        status: event === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CONFIRMED',
        value,
        billingType: 'PIX',
      },
    },
  };
}

test('webhook handler applies exact paid event only through the atomic RPC', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [{ data: { result: 'applied', duplicate: false, payment_state: 'paid', attempt_state: 'paid', order_code: 'NA-ATOMIC-1' }, error: null }],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });
  const res = createMockResponse();

  await handler(atomicWebhookRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.paymentState, 'paid');
  assert.equal(supabase.rpcCalls, 1);
  assert.equal(supabase.directMutations, 0);
});

test('webhook amount mismatch remains a stable 409 even when the committed rejection is a duplicate', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [
      { data: { result: 'rejected_amount', duplicate: false, error_code: 'payment_amount_mismatch', payment_state: 'pending', attempt_state: 'payment_review', order_code: 'NA-ATOMIC-1' }, error: null },
      { data: { result: 'rejected_amount', duplicate: true, error_code: 'payment_amount_mismatch', payment_state: 'pending', attempt_state: 'payment_review', order_code: 'NA-ATOMIC-1' }, error: null },
    ],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });

  const first = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-mismatch', value: '50.00' }), first);
  const second = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-mismatch', value: '50.00' }), second);

  assert.equal(first.statusCode, 409);
  assert.equal(first.body.error, 'payment_amount_mismatch');
  assert.equal(second.statusCode, 409);
  assert.equal(second.body.error, 'payment_amount_mismatch');
  assert.equal(second.body.duplicate, true);
  assert.equal(supabase.directMutations, 0);
});

test('webhook DB failure is 500 and the same event reaches the RPC again on provider retry', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [
      { data: null, error: { code: 'XX000', message: 'simulated transactional failure' } },
      { data: { result: 'applied', duplicate: false, payment_state: 'paid', attempt_state: 'paid', order_code: 'NA-ATOMIC-1' }, error: null },
    ],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });

  const first = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-retry-after-db-failure' }), first);
  const second = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-retry-after-db-failure' }), second);

  assert.equal(first.statusCode, 500);
  assert.equal(second.statusCode, 200);
  assert.equal(supabase.rpcCalls, 2);
  assert.equal(supabase.directMutations, 0);
});

test('atomic refund fallback result switches ownership without a second order mutation', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [{ data: { result: 'switch_to_paid', duplicate: false, payment_state: 'paid', attempt_state: 'refunded', order_code: 'NA-ATOMIC-1' }, error: null }],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });
  const res = createMockResponse();

  await handler(atomicWebhookRequest({ eventId: 'evt-refund', event: 'PAYMENT_REFUNDED' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.switchedToPaidAttempt, true);
  assert.equal(res.body.paymentState, 'paid');
  assert.equal(supabase.directMutations, 0);
});

test('stale event result is acknowledged without regressing order state', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [{ data: { result: 'ignored_stale', duplicate: false, payment_state: 'refunded', attempt_state: 'refunded', order_code: 'NA-ATOMIC-1' }, error: null }],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });
  const res = createMockResponse();

  await handler(atomicWebhookRequest({ eventId: 'evt-stale-paid' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ignored, true);
  assert.equal(res.body.reason, 'stale_payment_transition');
  assert.equal(res.body.paymentState, 'refunded');
});

test('ledger refuses an unverified direct paid write outside the atomic webhook path', async () => {
  const { persistPaymentAttemptIdentity } = await loadLedger();
  const supabase = {
    from() {
      return {
        update() {
          return { async eq() { return { error: null }; } };
        },
      };
    },
  };

  await assert.rejects(
    persistPaymentAttemptIdentity(supabase, { id: 'attempt-direct', state: 'pending' }, { state: 'paid' }),
    (error) => error?.code === 'unverified_paid_state',
  );
});

test('direct provider paid state is verified against the authoritative total before ledger persistence', async () => {
  const { derivePaymentAttemptVerification } = await loadLedger();

  assert.deepEqual(derivePaymentAttemptVerification('paid', '60.00', 6000), {
    state: 'paid',
    providerReportedState: 'paid',
    providerAmountCents: 6000,
    amountVerificationState: 'verified',
    error: null,
  });
  assert.deepEqual(derivePaymentAttemptVerification('paid', '50.00', 6000), {
    state: 'payment_review',
    providerReportedState: 'paid',
    providerAmountCents: 5000,
    amountVerificationState: 'mismatch',
    error: 'payment_amount_mismatch',
  });
  assert.equal(derivePaymentAttemptVerification('paid', undefined, 6000).state, 'payment_review');
  assert.equal(derivePaymentAttemptVerification('pending', undefined, 6000).state, 'pending');
});

test('a later corrected paid event can succeed after a previously committed amount mismatch', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [
      { data: { result: 'rejected_amount', duplicate: false, error_code: 'payment_amount_mismatch', payment_state: 'pending', attempt_state: 'payment_review', order_code: 'NA-ATOMIC-1' }, error: null },
      { data: { result: 'applied', duplicate: false, payment_state: 'paid', attempt_state: 'paid', order_code: 'NA-ATOMIC-1' }, error: null },
    ],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });

  const mismatch = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-mismatch-first', value: '50.00' }), mismatch);
  const corrected = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-corrected-paid', value: '60.00' }), corrected);

  assert.equal(mismatch.statusCode, 409);
  assert.equal(corrected.statusCode, 200);
  assert.equal(corrected.body.paymentState, 'paid');
  assert.equal(supabase.rpcCalls, 2);
  assert.equal(supabase.directMutations, 0);
});

test('refund transaction failure leaves the same refund event retryable', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [
      { data: null, error: { code: 'XX000', message: 'simulated refund mutation failure' } },
      { data: { result: 'applied', duplicate: false, payment_state: 'refunded', attempt_state: 'refunded', order_code: 'NA-ATOMIC-1' }, error: null },
    ],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });

  const first = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-refund-retry', event: 'PAYMENT_REFUNDED' }), first);
  const second = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-refund-retry', event: 'PAYMENT_REFUNDED' }), second);

  assert.equal(first.statusCode, 500);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.paymentState, 'refunded');
  assert.equal(supabase.rpcCalls, 2);
});

test('refund ownership-switch failure leaves the same event retryable for an atomic switch', async () => {
  const { createAsaasWebhookHandler } = await import('../api/asaas-webhook.js');
  const supabase = createWebhookSupabase({
    rpcResults: [
      { data: null, error: { code: 'XX000', message: 'simulated ownership switch failure' } },
      { data: { result: 'switch_to_paid', duplicate: false, payment_state: 'paid', attempt_state: 'refunded', order_code: 'NA-ATOMIC-1' }, error: null },
    ],
  });
  const handler = createAsaasWebhookHandler({
    getSupabaseFn: () => supabase,
    getAsaasConfigFn: () => ({ webhookToken: 'test-webhook-token' }),
  });

  const first = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-switch-retry', event: 'PAYMENT_REFUNDED' }), first);
  const second = createMockResponse();
  await handler(atomicWebhookRequest({ eventId: 'evt-switch-retry', event: 'PAYMENT_REFUNDED' }), second);

  assert.equal(first.statusCode, 500);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.switchedToPaidAttempt, true);
  assert.equal(second.body.paymentState, 'paid');
  assert.equal(supabase.rpcCalls, 2);
});

test('concurrent duplicate same event yields one financial application contract', async () => {
  const { applyAsaasWebhookAtomically } = await loadAtomicWebhook();
  const appliedEvents = new Set();
  let financialApplications = 0;
  const supabase = {
    async rpc(_name, params) {
      await new Promise((resolve) => setImmediate(resolve));
      if (appliedEvents.has(params.p_event_id)) {
        return { data: { result: 'applied', duplicate: true, payment_state: 'paid', attempt_state: 'paid' }, error: null };
      }
      appliedEvents.add(params.p_event_id);
      financialApplications += 1;
      return { data: { result: 'applied', duplicate: false, payment_state: 'paid', attempt_state: 'paid' }, error: null };
    },
  };
  const input = {
    orderId: '11111111-1111-1111-1111-111111111111',
    attemptId: '22222222-2222-2222-2222-222222222222',
    eventId: 'evt-concurrent-duplicate',
    payment: { id: 'pay-1', value: '60.00' },
    proposedState: 'paid',
    paymentMethod: 'pix',
  };

  const results = await Promise.all([
    applyAsaasWebhookAtomically(supabase, input),
    applyAsaasWebhookAtomically(supabase, input),
  ]);

  assert.equal(financialApplications, 1);
  assert.equal(results.filter((result) => result.duplicate === false).length, 1);
  assert.equal(results.filter((result) => result.duplicate === true).length, 1);
});

test('only amount-verified paid attempts can keep an order paid after active-owner refund', async () => {
  const { findOtherPaidPaymentForOrder, decidePaymentOrderTransition } = await loadLedger();
  const attempts = [
    { id: 'mismatch', order_id: 'order-refund', state: 'payment_review', amount_verification_state: 'mismatch' },
  ];
  const supabase = {
    from() {
      return {
        select() {
          let current = attempts;
          const chain = {
            eq(column, value) {
              current = current.filter((row) => String(row[column] ?? '') === String(value));
              return chain;
            },
            async limit(count) { return { data: current.slice(0, count), error: null }; },
          };
          return chain;
        },
      };
    },
  };

  const fallback = await findOtherPaidPaymentForOrder(supabase, 'order-refund', 'active');
  const transition = decidePaymentOrderTransition({
    order: { payment_state: 'paid', active_payment_attempt_id: 'active' },
    paymentRecord: { id: 'active', state: 'refunded', attempt_kind: 'retry' },
    proposedState: 'refunded',
    otherPaidPayment: fallback.payment,
  });

  assert.equal(fallback.payment, null);
  assert.equal(transition.action, 'apply');
  assert.equal(transition.nextState, 'refunded');
});

test('migration preserves unprovable historical paid rows as review records instead of treating them as verified or aborting', async () => {
  const sql = await readFile(new URL('../supabase/migration_017_atomic_payment_webhooks.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /raise\s+exception\s+'migration_017:\s*paid payment_attempts without authoritative amount evidence/i);
  assert.match(sql, /provider_reported_state\s*=\s*coalesce\(pa\.provider_reported_state,\s*'paid'\)[\s\S]*state\s*=\s*'payment_review'[\s\S]*amount_verification_state\s*=\s*'legacy_unverified'/i);
});

test('migration 017 never infers historical amount verification from orders.paid_total_cents', async () => {
  const sql = await readFile(new URL('../supabase/migration_017_atomic_payment_webhooks.sql', import.meta.url), 'utf8');
  const backfillStart = sql.indexOf('-- Historical paid rows predate durable provider-amount provenance.');
  const backfillEnd = sql.indexOf('alter table public.payment_attempts\n  drop constraint if exists payment_attempts_paid_requires_verified_amount;');
  assert.notEqual(backfillStart, -1);
  assert.notEqual(backfillEnd, -1);
  const historicalBackfill = sql.slice(backfillStart, backfillEnd);

  assert.doesNotMatch(
    historicalBackfill,
    /amount_verification_state\s*=\s*'verified'/i,
    'historical rows must not be promoted to verified before new provider evidence exists',
  );
  assert.doesNotMatch(
    historicalBackfill,
    /provider_amount_cents\s*=\s*coalesce\(pa\.provider_amount_cents,\s*o\.paid_total_cents\)/i,
    'orders.paid_total_cents has no trustworthy provider-amount provenance for legacy rows',
  );
  assert.match(
    historicalBackfill,
    /provider_reported_state\s*=\s*coalesce\(pa\.provider_reported_state,\s*'paid'\)[\s\S]*provider_amount_cents\s*=\s*null[\s\S]*state\s*=\s*'payment_review'[\s\S]*amount_verification_state\s*=\s*'legacy_unverified'/i,
  );
});

test('mismatched later paid event does not overwrite a previously verified ledger amount', async () => {
  const sql = await readFile(new URL('../supabase/migration_017_atomic_payment_webhooks.sql', import.meta.url), 'utf8');
  assert.match(sql, /provider_amount_cents\s*=\s*case[\s\S]*v_attempt\.state\s*=\s*'paid'[\s\S]*v_attempt\.amount_verification_state\s*=\s*'verified'[\s\S]*then\s+v_attempt\.provider_amount_cents[\s\S]*else\s+p_provider_amount_cents[\s\S]*end/i);
});
