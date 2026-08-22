import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapAsaasEventToPaymentState, mapAsaasStatusToPaymentState } from '../api/_asaas.js';
import { handleCancelOrder } from '../api/public.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function inventoryResolutionError() {
  const error = new Error('O pagamento precisa ser resolvido antes de liberar o estoque.');
  error.code = 'inventory_release_requires_payment_resolution';
  error.status = 409;
  return error;
}


function closureInProgressError() {
  const error = new Error('Este pedido está em processo de cancelamento ou recusa e não pode avançar no atendimento.');
  error.code = 'order_closure_in_progress';
  error.status = 409;
  return error;
}


function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createResolutionMemorySupabase({ order, attempts = [], actions = [], closures = [] }) {
  const rows = {
    orders: [clone(order)],
    payment_attempts: clone(attempts),
    payment_resolution_actions: clone(actions),
    order_closure_requests: clone(closures),
  };
  let actionSequence = actions.length;

  function selectChain(source) {
    let current = source;
    let limitCount = null;
    const chain = {
      eq(column, value) {
        current = current.filter((row) => String(row[column] ?? '') === String(value));
        return chain;
      },
      neq(column, value) {
        current = current.filter((row) => String(row[column] ?? '') !== String(value));
        return chain;
      },
      in(column, values) {
        current = current.filter((row) => values.includes(row[column]));
        return chain;
      },
      order() { return chain; },
      limit(count) { limitCount = count; return chain; },
      async maybeSingle() {
        const result = limitCount == null ? current : current.slice(0, limitCount);
        return { data: clone(result[0] || null), error: null };
      },
      async single() {
        const result = limitCount == null ? current : current.slice(0, limitCount);
        return { data: clone(result[0] || null), error: result[0] ? null : { message: 'row_not_found' } };
      },
      then(resolvePromise, rejectPromise) {
        const result = limitCount == null ? current : current.slice(0, limitCount);
        return Promise.resolve({ data: clone(result), error: null }).then(resolvePromise, rejectPromise);
      },
    };
    return chain;
  }

  function updateChain(table, patch) {
    const predicates = [];
    const chain = {
      eq(column, value) {
        predicates.push((row) => String(row[column] ?? '') === String(value));
        return chain;
      },
      neq(column, value) {
        predicates.push((row) => String(row[column] ?? '') !== String(value));
        return chain;
      },
      in(column, values) {
        predicates.push((row) => values.includes(row[column]));
        return chain;
      },
      select() { return chain; },
      async maybeSingle() {
        const row = rows[table].find((candidate) => predicates.every((predicate) => predicate(candidate)));
        if (!row) return { data: null, error: null };
        Object.assign(row, clone(patch));
        return { data: clone(row), error: null };
      },
      async single() {
        const result = await chain.maybeSingle();
        if (!result.data) return { data: null, error: { message: 'row_not_found' } };
        return result;
      },
    };
    return chain;
  }

  const api = {
    rows,
    from(table) {
      assert.ok(rows[table], `unexpected table ${table}`);
      return {
        select() { return selectChain(rows[table]); },
        update(patch) { return updateChain(table, patch); },
      };
    },
    async rpc(name, params) {
      if (name === 'request_order_closure') {
        let existing = rows.order_closure_requests.find((closure) =>
          closure.order_id === params.p_order_id && closure.state !== 'completed');
        if (existing) {
          if (existing.target_status !== params.p_target_status) {
            return { data: null, error: { code: 'P0001', message: 'order_closure_conflict' } };
          }
          return { data: clone(existing), error: null };
        }
        existing = {
          id: `closure-${rows.order_closure_requests.length + 1}`,
          order_id: params.p_order_id,
          target_status: params.p_target_status,
          reason: params.p_reason,
          state: 'pending',
          last_error_code: null,
        };
        rows.order_closure_requests.push(existing);
        return { data: clone(existing), error: null };
      }
      if (name === 'ensure_payment_resolution_action') {
        let existing = rows.payment_resolution_actions.find((action) =>
          action.payment_attempt_id === params.p_payment_attempt_id
          && action.provider_action === params.p_provider_action);
        if (existing) {
          if (!existing.closure_request_id && params.p_closure_request_id) {
            existing.closure_request_id = params.p_closure_request_id;
          }
          return { data: clone(existing), error: null };
        }
        existing = {
          id: `action-${++actionSequence}`,
          order_id: params.p_order_id,
          payment_attempt_id: params.p_payment_attempt_id,
          closure_request_id: params.p_closure_request_id,
          kind: params.p_kind,
          provider_action: params.p_provider_action,
          state: 'claimed',
          provider: 'asaas',
          provider_payment_id: params.p_provider_payment_id,
          provider_marker: `NAB ${params.p_provider_action} action-${actionSequence}`,
          provider_accepted_at: null,
          completed_at: null,
          last_error_code: null,
        };
        rows.payment_resolution_actions.push(existing);
        return { data: clone(existing), error: null };
      }
      if (name === 'claim_payment_resolution_execution') {
        const action = rows.payment_resolution_actions.find((candidate) => candidate.id === params.p_action_id);
        if (!action || action.state !== 'claimed') return { data: null, error: null };
        action.state = 'provider_call_in_flight';
        return { data: clone(action), error: null };
      }
      if (name === 'apply_asaas_payment_webhook') {
        const attempt = rows.payment_attempts.find((candidate) => candidate.id === params.p_payment_attempt_id);
        if (attempt) {
          attempt.state = params.p_proposed_state;
          attempt.provider_reported_state = params.p_proposed_state;
        }
        const storedOrder = rows.orders.find((candidate) => candidate.id === params.p_order_id);
        if (storedOrder) storedOrder.payment_state = params.p_proposed_state;
        return {
          data: {
            result: 'applied',
            attempt_state: params.p_proposed_state,
            order_payment_state: params.p_proposed_state,
          },
          error: null,
        };
      }
      if (name === 'finalize_order_closure_if_resolved') {
        const closure = rows.order_closure_requests.find((candidate) => candidate.id === params.p_closure_request_id);
        const unresolvedAction = rows.payment_resolution_actions.find((action) =>
          action.order_id === closure?.order_id && !['completed', 'superseded'].includes(action.state));
        const unresolvedAttempt = rows.payment_attempts.find((attempt) =>
          attempt.order_id === closure?.order_id
          && !(attempt.state === 'cancelled' || attempt.state === 'refunded'
            || (attempt.state === 'failed' && !attempt.provider_payment_id)));
        if (unresolvedAction || unresolvedAttempt) {
          return { data: null, error: { message: 'payment_resolution_incomplete' } };
        }
        if (closure) {
          closure.state = 'completed';
          closure.completed_at = new Date().toISOString();
        }
        const storedOrder = rows.orders.find((candidate) => candidate.id === closure?.order_id);
        if (storedOrder && closure) storedOrder.status = closure.target_status;
        return { data: clone(storedOrder), error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  return api;
}

test('refund requested and refund-in-progress are not terminal refunded states', () => {
  assert.equal(mapAsaasStatusToPaymentState('REFUND_REQUESTED'), 'paid');
  assert.equal(mapAsaasEventToPaymentState('PAYMENT_REFUND_REQUESTED'), 'paid');
  assert.equal(mapAsaasEventToPaymentState('PAYMENT_REFUND_IN_PROGRESS'), 'paid');
  assert.equal(mapAsaasEventToPaymentState('PAYMENT_REFUNDED'), 'refunded');
});

test('public cancellation returns 202 and starts durable resolution when fulfillment requires payment resolution', async () => {
  const order = {
    id: 'order-resolution',
    order_code: 'NA-RESOLUTION',
    user_id: 'user-1',
    customer_email: 'cliente@example.test',
    status: 'new',
    payment_state: 'paid',
    inventory_state: 'reserved',
  };
  const supabase = {
    from(table) {
      assert.equal(table, 'orders');
      return {
        select() {
          return {
            eq() {
              return { async maybeSingle() { return { data: order, error: null }; } };
            },
          };
        },
      };
    },
  };
  const closureCalls = [];
  const res = createMockResponse();

  await handleCancelOrder({
    method: 'POST',
    body: { orderCode: order.order_code, reason: 'Cliente desistiu' },
  }, res, supabase, {
    requireAccess: async () => ({ user: { id: 'user-1' } }),
    transition: async () => { throw inventoryResolutionError(); },
    requestClosure: async (_supabase, input) => {
      closureCalls.push(input);
      return { id: 'closure-1', state: 'waiting_provider' };
    },
  });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.accepted, true);
  assert.equal(res.body.resolutionPending, true);
  assert.equal(res.body.status, 'new');
  assert.equal(res.body.paymentState, 'paid');
  assert.equal(closureCalls.length, 1);
  assert.deepEqual(closureCalls[0], {
    order,
    targetStatus: 'cancelled',
    reason: 'Cliente desistiu',
  });
});

test('public repeated cancellation reuses the pending cancellation closure and returns 202', async () => {
  const order = {
    id: 'order-repeat-cancel',
    order_code: 'NA-REPEAT-CANCEL',
    user_id: 'user-1',
    customer_email: 'cliente@example.test',
    status: 'new',
    payment_state: 'paid',
    inventory_state: 'reserved',
  };
  const existingClosure = {
    id: 'closure-repeat-cancel',
    order_id: order.id,
    target_status: 'cancelled',
    state: 'waiting_provider',
  };
  const supabase = {
    from(table) {
      assert.equal(table, 'orders');
      return {
        select() {
          return {
            eq() {
              return { async maybeSingle() { return { data: order, error: null }; } };
            },
          };
        },
      };
    },
  };
  const closureCalls = [];
  const res = createMockResponse();

  await handleCancelOrder({
    method: 'POST',
    body: { orderCode: order.order_code, reason: 'Cliente desistiu' },
  }, res, supabase, {
    requireAccess: async () => ({ user: { id: 'user-1' } }),
    transition: async () => { throw closureInProgressError(); },
    requestClosure: async (_supabase, input) => {
      closureCalls.push(input);
      return { resolutionPending: true, closure: existingClosure, order };
    },
  });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.resolutionPending, true);
  assert.equal(res.body.closure.id, existingClosure.id);
  assert.equal(res.body.closure.targetStatus, 'cancelled');
  assert.equal(closureCalls.length, 1);
  assert.deepEqual(closureCalls[0], {
    order,
    targetStatus: 'cancelled',
    reason: 'Cliente desistiu',
  });
});

test('reusing a pending cancellation closure does not initiate a duplicate provider refund', async () => {
  const { requestOrderClosure } = await import('../api/_paymentResolution.js');
  const order = {
    id: 'order-repeat-provider',
    order_code: 'NA-REPEAT-PROVIDER',
    total_cents: 1000,
    payment_state: 'paid',
    payment_method: 'pix',
    status: 'new',
    inventory_state: 'reserved',
  };
  const attempt = {
    id: 'attempt-repeat-provider',
    order_id: order.id,
    state: 'paid',
    provider: 'asaas',
    provider_payment_id: 'pay-repeat-provider',
    payment_method: 'pix',
  };
  const closure = {
    id: 'closure-repeat-provider',
    order_id: order.id,
    target_status: 'cancelled',
    reason: 'Cliente desistiu',
    state: 'waiting_provider',
    last_error_code: null,
  };
  const action = {
    id: 'action-repeat-provider',
    order_id: order.id,
    payment_attempt_id: attempt.id,
    closure_request_id: closure.id,
    kind: 'order_close_refund',
    provider_action: 'refund',
    state: 'provider_pending',
    provider: 'asaas',
    provider_payment_id: attempt.provider_payment_id,
    provider_marker: 'NAB refund action-repeat-provider',
    last_error_code: null,
  };
  const supabase = createResolutionMemorySupabase({
    order,
    attempts: [attempt],
    actions: [action],
    closures: [closure],
  });
  const providerCalls = [];

  const result = await requestOrderClosure(supabase, {
    order,
    targetStatus: 'cancelled',
    reason: 'Cliente desistiu',
    requestImpl: async (path, options = {}) => {
      providerCalls.push({ path, options });
      if (path === `/payments/${attempt.provider_payment_id}/refunds` && !options.method) {
        return { data: [{ description: action.provider_marker, status: 'PENDING', value: 10 }] };
      }
      throw new Error(`unexpected provider mutation ${options.method || 'GET'} ${path}`);
    },
  });

  assert.equal(result.resolutionPending, true);
  assert.equal(result.closure.id, closure.id);
  assert.equal(supabase.rows.order_closure_requests.length, 1);
  assert.equal(supabase.rows.payment_resolution_actions.length, 1);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].options.method, undefined);
});

test('additional-paid webhook path delegates to durable payment resolution processing', () => {
  const source = readFileSync(resolve(ROOT, 'api/asaas-webhook.js'), 'utf8');
  assert.match(source, /processPaymentResolutionWebhook/);
  assert.match(source, /additional_paid/);
  assert.match(source, /duplicate_paid_refund/);
});

test('customer and admin UIs distinguish accepted financial resolution from completed cancellation', () => {
  const customer = readFileSync(resolve(ROOT, 'src/pages/CustomerOrderDetailPage.jsx'), 'utf8');
  const admin = readFileSync(resolve(ROOT, 'src/pages/AdminOrderDetailPage.jsx'), 'utf8');
  assert.match(customer, /resolutionPending/);
  assert.match(customer, /Cancelamento solicitado\. Aguardando confirmação financeira\./);
  assert.match(admin, /resolutionPending/);
  assert.match(admin, /Resolução financeira iniciada\. Aguardando confirmação do Asaas\./);
});

test('full refund helper reconciles by marker before POST and never sends a partial value', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  const calls = [];
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-1',
    providerMarker: 'NAB refund action-1',
    paymentAmountCents: 1000,
    requestImpl: async (path, options = {}) => {
      calls.push({ path, options });
      if (path.endsWith('/refunds')) return { data: [] };
      if (path.endsWith('/refund')) return { id: 'refund-1', status: 'PENDING' };
      throw new Error(`unexpected ${path}`);
    },
  });
  assert.equal(result.kind, 'provider_pending');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, '/payments/pay-refund-1/refunds');
  assert.equal(calls[1].path, '/payments/pay-refund-1/refund');
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(calls[1].options.body, { description: 'NAB refund action-1' });
  assert.equal(Object.hasOwn(calls[1].options.body, 'value'), false);
});

test('refund helper does not POST when a matching pending refund already exists', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  let posts = 0;
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-2',
    providerMarker: 'NAB refund action-2',
    paymentAmountCents: 1000,
    requestImpl: async (path, options = {}) => {
      if (options.method === 'POST') posts += 1;
      assert.equal(path, '/payments/pay-refund-2/refunds');
      return { data: [{ description: 'NAB refund action-2', status: 'PENDING', value: 10 }] };
    },
  });
  assert.equal(result.kind, 'provider_pending');
  assert.equal(posts, 0);
});

test('refund helper recognizes only a full DONE matching refund as completed', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-3',
    providerMarker: 'NAB refund action-3',
    paymentAmountCents: 1000,
    allowMutation: false,
    requestImpl: async () => ({ data: [{ description: 'NAB refund action-3', status: 'DONE', value: 10 }] }),
  });
  assert.equal(result.kind, 'completed');
});

test('refund helper sends unexpected partial refund history to manual review and never POSTs', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  let posts = 0;
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-4',
    providerMarker: 'NAB refund action-4',
    paymentAmountCents: 1000,
    requestImpl: async (_path, options = {}) => {
      if (options.method === 'POST') posts += 1;
      return { data: [{ description: 'other-refund', status: 'DONE', value: 2 }] };
    },
  });
  assert.equal(result.kind, 'manual_review');
  assert.equal(posts, 0);
});

test('ambiguous refund transport is classified as provider_uncertain instead of retried', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  let posts = 0;
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-5',
    providerMarker: 'NAB refund action-5',
    paymentAmountCents: 1000,
    requestImpl: async (_path, options = {}) => {
      if (!options.method) return { data: [] };
      posts += 1;
      const error = new Error('timeout');
      error.asaasTransportFailure = true;
      throw error;
    },
  });
  assert.equal(result.kind, 'provider_uncertain');
  assert.equal(posts, 1);
});

test('pending charge delete helper marks accepted DELETE as provider_pending and ambiguous failure as uncertain', async () => {
  const { deleteAsaasPayment } = await import('../api/_paymentResolution.js');
  const accepted = await deleteAsaasPayment({
    providerPaymentId: 'pay-delete-1',
    requestImpl: async (path, options) => {
      assert.equal(path, '/payments/pay-delete-1');
      assert.equal(options.method, 'DELETE');
      return { deleted: true, id: 'pay-delete-1' };
    },
  });
  assert.equal(accepted.kind, 'provider_pending');

  const uncertain = await deleteAsaasPayment({
    providerPaymentId: 'pay-delete-2',
    requestImpl: async () => {
      const error = new Error('upstream 502');
      error.status = 502;
      throw error;
    },
  });
  assert.equal(uncertain.kind, 'provider_uncertain');
});


test('delete acceptance requires deleted=true and the matching provider payment id', async () => {
  const { deleteAsaasPayment } = await import('../api/_paymentResolution.js');
  const result = await deleteAsaasPayment({
    providerPaymentId: 'pay-delete-identity',
    requestImpl: async () => ({ deleted: true, id: 'pay-other' }),
  });
  assert.equal(result.kind, 'provider_uncertain');
  assert.equal(result.errorCode, 'provider_delete_acceptance_unverified');
});

test('retry-payment and same-key checkout replay both guard against an open order closure', () => {
  const publicApi = readFileSync(resolve(ROOT, 'api/public.js'), 'utf8');
  const ordersApi = readFileSync(resolve(ROOT, 'api/orders.js'), 'utf8');
  assert.match(publicApi, /order_closure_in_progress/);
  assert.match(publicApi, /hasOpenOrderClosure/);
  assert.match(ordersApi, /order_closure_in_progress/);
  assert.match(ordersApi, /hasOpenOrderClosure/);
});

test('refund helper treats any unmatched active refund history as manual review and never issues another full refund', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  let posts = 0;
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-unmatched-pending',
    providerMarker: 'NAB refund current-action',
    paymentAmountCents: 1000,
    requestImpl: async (_path, options = {}) => {
      if (options.method === 'POST') posts += 1;
      return { data: [{ description: 'legacy refund', status: 'PENDING', value: 10 }] };
    },
  });
  assert.equal(result.kind, 'manual_review');
  assert.equal(posts, 0);
});

test('matching pending refund with a clearly partial value is manual review rather than ordinary pending', async () => {
  const { requestFullAsaasRefund } = await import('../api/_paymentResolution.js');
  const result = await requestFullAsaasRefund({
    providerPaymentId: 'pay-refund-partial-pending',
    providerMarker: 'NAB refund partial-action',
    paymentAmountCents: 1000,
    requestImpl: async () => ({ data: [{ description: 'NAB refund partial-action', status: 'PENDING', value: 2 }] }),
  });
  assert.equal(result.kind, 'manual_review');
});

test('closure reconciliation keeps refund progress pending while partial and denied require manual review', async () => {
  const { classifyProviderStatusForResolution } = await import('../api/_paymentResolution.js');
  for (const status of ['REFUND_REQUESTED', 'REFUND_IN_PROGRESS']) {
    assert.equal(classifyProviderStatusForResolution(status), 'provider_pending');
  }
  for (const status of ['PARTIALLY_REFUNDED', 'REFUND_DENIED']) {
    assert.equal(classifyProviderStatusForResolution(status), 'manual_review');
  }
  assert.equal(classifyProviderStatusForResolution('CONFIRMED'), 'paid');
  assert.equal(classifyProviderStatusForResolution('PENDING'), 'pending');
  assert.equal(classifyProviderStatusForResolution('REFUNDED'), 'refunded');
  assert.equal(classifyProviderStatusForResolution('DELETED'), 'cancelled');
});

test('same-key checkout replay with an open closure returns conflict before provider recovery', async () => {
  const { createOrdersHandler } = await import('../api/orders.js');
  let recoverCalls = 0;
  const existingOrder = {
    id: 'order-closing',
    order_code: 'NA-CLOSING',
    user_id: 'user-1',
    payment_method: 'pix',
    payment_state: 'pending',
    inventory_state: 'reserved',
    checkout_finalization_state: 'finalized',
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => ({}),
    findIdempotentOrder: async () => ({ data: existingOrder, error: null }),
    hasOpenOrderClosure: async () => ({ id: 'closure-1', state: 'waiting_provider' }),
    recoverAsaasOrderPayment: async () => { recoverCalls += 1; throw new Error('must not recover'); },
  });
  const req = {
    method: 'POST',
    body: {
      idempotencyKey: 'checkout_closure_550e8400-e29b-41d4-a716-446655440000',
      customer: {}, address: {}, payment: { method: 'pix' }, items: [],
    },
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_closure_in_progress');
  assert.equal(recoverCalls, 0);
});

test('payment-resolution admin recovery route is covered by the universal manager JWT gate', () => {
  const adminApi = readFileSync(resolve(ROOT, 'api/admin.js'), 'utf8');
  assert.match(adminApi, /const manager = await requireManager\(req, res\)/);
  assert.match(adminApi, /case 'payment-resolutions'/);
  assert.doesNotMatch(adminApi, /manager_auth_required/);
  assert.doesNotMatch(adminApi, /resource === 'payment-resolutions'/);
});

test('successful closure finalization does not perform a second Node-side completed-state update after the atomic RPC', () => {
  const source = readFileSync(resolve(ROOT, 'api/_paymentResolution.js'), 'utf8');
  const start = source.indexOf('async function finalizeClosure');
  const end = source.indexOf('\nasync function reconcileDeleteAction', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /updateClosure\(supabase, closureId, \{ state: 'completed'/);
});

test('payment-resolution action updates use compare-and-set so stale provider responses cannot regress terminal evidence', () => {
  const source = readFileSync(resolve(ROOT, 'api/_paymentResolution.js'), 'utf8');
  const start = source.indexOf('async function updateAction');
  const end = source.indexOf('\nasync function updateClosure', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /expectedStates/);
  assert.match(body, /\.in\('state', expectedStates\)/);
  assert.match(body, /loadAction\(supabase, actionId\)/);
});


test('order-closure updates use compare-and-set and reload terminal state instead of reopening completed rows', () => {
  const source = readFileSync(resolve(ROOT, 'api/_paymentResolution.js'), 'utf8');
  const start = source.indexOf('async function updateClosure');
  const end = source.indexOf('\nasync function loadOrder', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /\.neq\('state', 'completed'\)/);
  assert.match(body, /\.maybeSingle\(\)/);
  assert.match(body, /loadClosure\(supabase, closureId\)/);
});

test('unexpected refund progress, partial, or denied webhooks create a durable provider_refund_review action when none exists', () => {
  const source = readFileSync(resolve(ROOT, 'api/_paymentResolution.js'), 'utf8');
  assert.match(source, /provider_refund_review/);
  assert.match(source, /ensureResolutionAction/);
  assert.match(source, /PAYMENT_PARTIALLY_REFUNDED/);
  assert.match(source, /PAYMENT_REFUND_DENIED/);
});


test('ambiguous delete followed by 404 without provider acceptance does not fabricate cancellation', async () => {
  const { reconcilePaymentResolution } = await import('../api/_paymentResolution.js');
  const order = {
    id: 'order-delete-404', total_cents: 1000, payment_state: 'pending', status: 'new', inventory_state: 'reserved', payment_method: 'pix',
  };
  const attempt = {
    id: 'attempt-delete-404', order_id: order.id, state: 'pending', provider_payment_id: 'pay-delete-404', payment_method: 'pix',
  };
  const closure = { id: 'closure-delete-404', order_id: order.id, state: 'waiting_provider', target_status: 'cancelled' };
  const action = {
    id: 'action-delete-404', order_id: order.id, payment_attempt_id: attempt.id, closure_request_id: closure.id,
    kind: 'order_close_delete', provider_action: 'delete', state: 'provider_uncertain', provider: 'asaas',
    provider_payment_id: attempt.provider_payment_id, provider_marker: 'NAB delete action-delete-404', provider_accepted_at: null,
  };
  const supabase = createResolutionMemorySupabase({ order, attempts: [attempt], actions: [action], closures: [closure] });
  const notFound = new Error('not found');
  notFound.status = 404;

  const result = await reconcilePaymentResolution(supabase, action.id, {
    requestImpl: async () => { throw notFound; },
  });

  assert.notEqual(result.action.state, 'completed');
  assert.equal(supabase.rows.payment_attempts[0].state, 'pending');
  assert.equal(supabase.rows.orders[0].payment_state, 'pending');
  assert.notEqual(supabase.rows.order_closure_requests[0].state, 'completed');
});

test('accepted delete may use later 404 as terminal absence evidence', async () => {
  const { reconcilePaymentResolution } = await import('../api/_paymentResolution.js');
  const order = { id: 'order-delete-accepted', total_cents: 1000, payment_state: 'pending', status: 'new', inventory_state: 'reserved', payment_method: 'pix' };
  const attempt = { id: 'attempt-delete-accepted', order_id: order.id, state: 'pending', provider_payment_id: 'pay-delete-accepted', payment_method: 'pix' };
  const closure = { id: 'closure-delete-accepted', order_id: order.id, state: 'waiting_provider', target_status: 'cancelled' };
  const action = {
    id: 'action-delete-accepted', order_id: order.id, payment_attempt_id: attempt.id, closure_request_id: closure.id,
    kind: 'order_close_delete', provider_action: 'delete', state: 'provider_pending', provider: 'asaas',
    provider_payment_id: attempt.provider_payment_id, provider_marker: 'NAB delete action-delete-accepted',
    provider_accepted_at: '2026-08-21T12:00:00.000Z',
  };
  const supabase = createResolutionMemorySupabase({ order, attempts: [attempt], actions: [action], closures: [closure] });
  const notFound = new Error('not found');
  notFound.status = 404;

  const result = await reconcilePaymentResolution(supabase, action.id, {
    requestImpl: async () => { throw notFound; },
  });

  assert.equal(result.action.state, 'completed');
  assert.equal(supabase.rows.payment_attempts[0].state, 'cancelled');
  assert.equal(supabase.rows.orders[0].payment_state, 'cancelled');
  assert.equal(supabase.rows.order_closure_requests[0].state, 'completed');
});

for (const priorState of ['failed', 'provider_uncertain']) {
  test(`paid transition during open closure from ${priorState} creates durable refund without a delete action`, async () => {
    const { processPaymentResolutionWebhook } = await import('../api/_paymentResolution.js');
    const order = { id: `order-paid-${priorState}`, total_cents: 1000, payment_state: 'paid', status: 'new', inventory_state: 'reserved', payment_method: 'pix' };
    const storedAttempt = { id: `attempt-paid-${priorState}`, order_id: order.id, state: 'paid', provider_payment_id: `pay-paid-${priorState}`, payment_method: 'pix' };
    const staleAttempt = { ...storedAttempt, state: priorState };
    const closure = { id: `closure-paid-${priorState}`, order_id: order.id, state: 'waiting_provider', target_status: 'cancelled' };
    const supabase = createResolutionMemorySupabase({ order, attempts: [storedAttempt], actions: [], closures: [closure] });

    const result = await processPaymentResolutionWebhook(supabase, {
      order,
      attempt: staleAttempt,
      event: 'PAYMENT_CONFIRMED',
      atomicResult: { result: 'applied', attempt_state: 'paid' },
      payment: { id: storedAttempt.provider_payment_id, status: 'CONFIRMED', value: 10 },
      requestImpl: async (path, options = {}) => {
        if (path.endsWith('/refunds')) return { data: [] };
        if (options.method === 'POST' && path.endsWith('/refund')) return { id: `refund-${priorState}`, status: 'PENDING' };
        if (!options.method && path === `/payments/${storedAttempt.provider_payment_id}`) {
          return { id: storedAttempt.provider_payment_id, status: 'CONFIRMED', value: 10 };
        }
        throw new Error(`unexpected provider request ${path}`);
      },
    });

    const refundAction = supabase.rows.payment_resolution_actions.find((action) => action.payment_attempt_id === storedAttempt.id && action.provider_action === 'refund');
    assert.ok(refundAction, 'verified paid attempt in an open closure must have a durable refund action');
    assert.equal(refundAction.kind, 'order_close_refund');
    assert.equal(refundAction.closure_request_id, closure.id);
    assert.equal(refundAction.state, 'provider_pending');
    assert.equal(result.action?.id, refundAction.id);
    assert.notEqual(supabase.rows.order_closure_requests[0].state, 'completed');
  });
}
