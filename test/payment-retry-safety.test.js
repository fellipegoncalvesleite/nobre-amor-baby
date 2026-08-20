import test from 'node:test';
import assert from 'node:assert/strict';

async function load(path, label) {
  try {
    return await import(path);
  } catch (error) {
    assert.fail(`${label} helper is not implemented: ${error.message}`);
  }
}

test('malformed payment retry attempt key is rejected', async () => {
  const { normalizePaymentAttemptKey } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  for (const value of ['', 'short', 'spaces are not valid', 'x'.repeat(129)]) {
    assert.throws(() => normalizePaymentAttemptKey(value), /attempt|tentativa|key|chave/i);
  }
});

test('same persisted retry attempt always reconciles before any provider creation', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  const calls = [];
  const result = await executePaymentRetry({
    order: { id: 'order-1', order_code: 'NA-1', payment_state: 'failed' },
    attemptKey: 'retry_550e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({
      id: 'attempt-1',
      order_id: 'order-1',
      attempt_key: 'retry_550e8400-e29b-41d4-a716-446655440000',
      external_reference: 'NA-RETRY-attempt-1',
      provider_payment_id: 'pay_existing',
      state: 'pending',
    }),
    recoverPayment: async () => {
      calls.push('recover');
      return {
        kind: 'single',
        payload: { state: 'pending', method: 'pix', externalId: 'pay_existing', copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: 'pay_existing' },
      };
    },
    createPayment: async () => {
      calls.push('create');
      throw new Error('must not create a second provider payment');
    },
    persistPayment: async () => calls.push('persist'),
    markAttemptUncertain: async () => calls.push('uncertain'),
    markAttemptFailed: async () => calls.push('failed'),
  });

  assert.equal(result.kind, 'success');
  assert.deepEqual(calls, ['recover', 'persist']);
});

test('new claimed retry attempt creates at most one payment after exact reconciliation returns none', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  const calls = [];
  const result = await executePaymentRetry({
    order: { id: 'order-2', order_code: 'NA-2', payment_state: 'failed' },
    attemptKey: 'retry_650e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({
      id: 'attempt-2',
      order_id: 'order-2',
      attempt_key: 'retry_650e8400-e29b-41d4-a716-446655440000',
      external_reference: 'NA-RETRY-attempt-2',
      provider_payment_id: null,
      state: 'claimed',
    }),
    recoverPayment: async () => {
      calls.push('recover');
      return { kind: 'none' };
    },
    createPayment: async ({ externalReference }) => {
      calls.push(`create:${externalReference}`);
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: 'pay_new', copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: 'pay_new' },
      };
    },
    persistPayment: async () => calls.push('persist'),
    markAttemptUncertain: async () => calls.push('uncertain'),
    markAttemptFailed: async () => calls.push('failed'),
  });

  assert.equal(result.kind, 'success');
  assert.deepEqual(calls, ['recover', 'create:NA-RETRY-attempt-2', 'persist']);
});

test('artifact-unavailable retry persists provider identity but stays retryable', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  const persisted = [];
  const result = await executePaymentRetry({
    order: { id: 'order-3', order_code: 'NA-3', payment_state: 'failed' },
    attemptKey: 'retry_750e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({
      id: 'attempt-3',
      external_reference: 'NA-RETRY-attempt-3',
      provider_payment_id: null,
      state: 'claimed',
    }),
    recoverPayment: async () => ({ kind: 'none' }),
    createPayment: async () => ({
      requiresReconciliation: true,
      payload: { state: 'pending', method: 'pix', externalId: 'pay_no_artifact' },
      orderUpdate: { payment_state: 'pending', payment_external_id: 'pay_no_artifact' },
    }),
    persistPayment: async (input) => persisted.push(input),
    markAttemptUncertain: async () => {},
    markAttemptFailed: async () => {},
  });

  assert.equal(result.kind, 'retryable');
  assert.equal(result.error, 'payment_artifact_recovery_pending');
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].activateOrder, false);
});

test('transport uncertainty is persisted and returned as retryable', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  let uncertain = 0;
  const error = new Error('network');
  error.paymentOutcomeUncertain = true;
  const result = await executePaymentRetry({
    order: { id: 'order-4', order_code: 'NA-4', payment_state: 'failed' },
    attemptKey: 'retry_850e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({ id: 'attempt-4', external_reference: 'NA-RETRY-attempt-4', state: 'claimed' }),
    recoverPayment: async () => ({ kind: 'none' }),
    createPayment: async () => { throw error; },
    persistPayment: async () => assert.fail('must not sync an uncertain creation'),
    markAttemptUncertain: async () => { uncertain += 1; },
    markAttemptFailed: async () => assert.fail('uncertain creation is not definitive failure'),
  });

  assert.equal(result.kind, 'retryable');
  assert.equal(result.error, 'payment_reconciliation_required');
  assert.equal(uncertain, 1);
});

test('multiple exact provider matches are a conflict and never create', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  let createCalls = 0;
  const result = await executePaymentRetry({
    order: { id: 'order-5', order_code: 'NA-5', payment_state: 'failed' },
    attemptKey: 'retry_950e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({ id: 'attempt-5', external_reference: 'NA-RETRY-attempt-5', state: 'claimed' }),
    recoverPayment: async () => ({ kind: 'conflict', paymentIds: ['pay_a', 'pay_b'] }),
    createPayment: async () => { createCalls += 1; },
    persistPayment: async () => {},
    markAttemptUncertain: async () => {},
    markAttemptFailed: async () => {},
  });

  assert.equal(result.kind, 'conflict');
  assert.equal(createCalls, 0);
});

test('stale non-paid attempt event cannot replace active payment metadata', async () => {
  const { shouldApplyAttemptEventToOrder } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  assert.equal(shouldApplyAttemptEventToOrder({
    isActiveAttempt: false,
    proposedState: 'pending',
    orderPaymentExternalId: 'pay_current',
    providerPaymentId: 'pay_old',
  }), false);
  assert.equal(shouldApplyAttemptEventToOrder({
    isActiveAttempt: false,
    proposedState: 'failed',
    orderPaymentExternalId: 'pay_current',
    providerPaymentId: 'pay_old',
  }), false);
});

test('paid event from any valid attempt must be applied, but refund is not misattributed', async () => {
  const { shouldApplyAttemptEventToOrder } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  assert.equal(shouldApplyAttemptEventToOrder({
    isActiveAttempt: false,
    proposedState: 'paid',
    orderPaymentExternalId: 'pay_current',
    providerPaymentId: 'pay_old',
  }), true);
  assert.equal(shouldApplyAttemptEventToOrder({
    isActiveAttempt: false,
    proposedState: 'refunded',
    orderPaymentExternalId: 'pay_current',
    providerPaymentId: 'pay_old',
  }), false);
});

test('retry reconciliation uses provider state instead of preserving the previous failed order state', async () => {
  const { recoverAsaasOrderPayment } = await import('../api/_asaas.js');
  const result = await recoverAsaasOrderPayment({
    order: {
      order_code: 'NA-OLD',
      payment_method: 'pix',
      payment_state: 'failed',
    },
    externalReference: 'NA-RETRY-state-test',
    preserveOrderState: false,
    requestImpl: async (path) => {
      if (path === '/payments') {
        return {
          data: [{
            id: 'pay_retry_pending',
            externalReference: 'NA-RETRY-state-test',
            billingType: 'PIX',
            status: 'PENDING',
          }],
        };
      }
      if (path === '/payments/pay_retry_pending/pixQrCode') {
        return { payload: 'retry-pix-code' };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(result.kind, 'single');
  assert.equal(result.payload.state, 'pending');
  assert.equal(result.orderUpdate.payment_state, 'pending');
});

test('provider payment survives order sync failure and same attempt recovers without a second create', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  let attempt = {
    id: 'attempt-sync-failure',
    external_reference: 'NA-RETRY-sync-failure',
    provider_payment_id: null,
    state: 'claimed',
  };
  let createCalls = 0;
  let recoveryCalls = 0;
  let firstPersist = true;

  const common = {
    order: { id: 'order-sync-failure', order_code: 'NA-SYNC', payment_state: 'failed' },
    attemptKey: 'retry_a50e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => attempt,
    recoverPayment: async () => {
      recoveryCalls += 1;
      if (!attempt.provider_payment_id) return { kind: 'none' };
      return {
        kind: 'single',
        payload: { state: 'pending', method: 'pix', externalId: attempt.provider_payment_id, copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: attempt.provider_payment_id },
      };
    },
    createPayment: async () => {
      createCalls += 1;
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: 'pay_survives_sync', copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: 'pay_survives_sync' },
      };
    },
    persistPayment: async ({ paymentResult }) => {
      attempt = { ...attempt, provider_payment_id: paymentResult.payload.externalId, state: paymentResult.payload.state };
      if (firstPersist) {
        firstPersist = false;
        const error = new Error('order sync failed');
        error.code = 'payment_retry_sync_error';
        throw error;
      }
    },
    markAttemptUncertain: async () => {},
    markAttemptFailed: async () => {},
  };

  await assert.rejects(executePaymentRetry(common), /order sync failed/);
  const replay = await executePaymentRetry(common);

  assert.equal(replay.kind, 'success');
  assert.equal(createCalls, 1);
  assert.equal(recoveryCalls, 2);
});

test('same uncertain retry attempt never creates again when reconciliation returns none', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  let createCalls = 0;
  const result = await executePaymentRetry({
    order: { id: 'order-uncertain-replay', order_code: 'NA-UNCERTAIN', payment_state: 'failed' },
    attemptKey: 'retry_b50e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({
      id: 'attempt-uncertain',
      external_reference: 'NA-RETRY-uncertain',
      provider_payment_id: null,
      state: 'provider_uncertain',
    }),
    recoverPayment: async () => ({ kind: 'none' }),
    createPayment: async () => { createCalls += 1; },
    persistPayment: async () => {},
    markAttemptUncertain: async () => {},
    markAttemptFailed: async () => {},
  });

  assert.equal(result.kind, 'retryable');
  assert.equal(result.error, 'payment_reconciliation_required');
  assert.equal(createCalls, 0);
});

test('same definitively failed retry attempt requires a new attempt key instead of creating again', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  let createCalls = 0;
  const result = await executePaymentRetry({
    order: { id: 'order-failed-replay', order_code: 'NA-FAILED', payment_state: 'failed' },
    attemptKey: 'retry_c50e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({
      id: 'attempt-failed',
      external_reference: 'NA-RETRY-failed',
      provider_payment_id: null,
      state: 'failed',
    }),
    recoverPayment: async () => ({ kind: 'none' }),
    createPayment: async () => { createCalls += 1; },
    persistPayment: async () => {},
    markAttemptUncertain: async () => {},
    markAttemptFailed: async () => {},
  });

  assert.equal(result.kind, 'terminal');
  assert.equal(result.error, 'payment_attempt_failed');
  assert.equal(createCalls, 0);
});

test('stale original payment may only take over an active retry when it becomes paid', async () => {
  const { shouldApplyOriginalPaymentEventToOrder } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  const base = {
    hasActiveRetryAttempt: true,
    orderPaymentExternalId: 'pay_retry',
    providerPaymentId: 'pay_original',
  };

  assert.equal(shouldApplyOriginalPaymentEventToOrder({ ...base, proposedState: 'pending' }), false);
  assert.equal(shouldApplyOriginalPaymentEventToOrder({ ...base, proposedState: 'expired' }), false);
  assert.equal(shouldApplyOriginalPaymentEventToOrder({ ...base, proposedState: 'refunded' }), false);
  assert.equal(shouldApplyOriginalPaymentEventToOrder({ ...base, proposedState: 'paid' }), true);
});

test('definitive provider creation failure terminates the same attempt without throwing into a blind retry path', async () => {
  const { executePaymentRetry } = await load('../api/_paymentRetrySafety.js', 'payment retry safety');
  let failedMarks = 0;
  const result = await executePaymentRetry({
    order: { id: 'order-definitive-failure', order_code: 'NA-DEFINITE', payment_state: 'failed' },
    attemptKey: 'retry_d50e8400-e29b-41d4-a716-446655440000',
    paymentMethod: 'pix',
    claimAttempt: async () => ({
      id: 'attempt-definitive',
      external_reference: 'NA-RETRY-definitive',
      provider_payment_id: null,
      state: 'claimed',
    }),
    recoverPayment: async () => ({ kind: 'none' }),
    createPayment: async () => {
      const error = new Error('provider rejected payment');
      error.code = 'asaas_request_failed';
      error.status = 400;
      throw error;
    },
    persistPayment: async () => assert.fail('definitive failure must not persist a provider payment'),
    markAttemptUncertain: async () => assert.fail('definitive 4xx is not uncertainty'),
    markAttemptFailed: async () => { failedMarks += 1; },
  });

  assert.equal(result.kind, 'terminal');
  assert.equal(result.error, 'payment_attempt_failed');
  assert.equal(failedMarks, 1);
});
