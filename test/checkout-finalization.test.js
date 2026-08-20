import test from 'node:test';
import assert from 'node:assert/strict';

async function load(path, label) {
  try {
    return await import(path);
  } catch (error) {
    assert.fail(`${label} helper is not implemented: ${error.message}`);
  }
}

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test('finalized checkout is safe to replay without provider reconciliation', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  let recoveryCalls = 0;
  const order = {
    id: 'order-1',
    order_code: 'NA-20260820-000001',
    checkout_finalization_state: 'finalized',
  };

  const result = await resolvePersistedCheckout({
    order,
    recoverPayment: async () => {
      recoveryCalls += 1;
      throw new Error('must not reconcile a finalized checkout');
    },
    persistRecovery: async () => {
      throw new Error('must not persist recovery for a finalized checkout');
    },
  });

  assert.equal(result.kind, 'replay');
  assert.equal(result.order, order);
  assert.equal(recoveryCalls, 0);
});

test('in-progress checkout is not replayed as ordinary success', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  const result = await resolvePersistedCheckout({
    order: {
      id: 'order-2',
      order_code: 'NA-20260820-000002',
      checkout_finalization_state: 'in_progress',
    },
    recoverPayment: async () => ({ kind: 'none' }),
    persistRecovery: async () => {
      throw new Error('nothing should be persisted without a provider payment');
    },
  });

  assert.equal(result.kind, 'pending');
  assert.equal(result.error, 'checkout_in_progress');
});

test('unique-insert race row uses the same non-success lifecycle decision', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  const racedOrder = {
    id: 'order-race',
    order_code: 'NA-20260820-000003',
    checkout_finalization_state: 'in_progress',
  };

  const result = await resolvePersistedCheckout({
    order: racedOrder,
    recoverPayment: async () => ({ kind: 'none' }),
    persistRecovery: async () => {
      throw new Error('race must not finalize without provider evidence');
    },
  });

  assert.notEqual(result.kind, 'replay');
  assert.equal(result.error, 'checkout_in_progress');
});

test('reconciliation-required checkout with no provider match remains retryable and unfinished', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  const result = await resolvePersistedCheckout({
    order: {
      id: 'order-4',
      order_code: 'NA-20260820-000004',
      checkout_finalization_state: 'reconciliation_required',
    },
    recoverPayment: async () => ({ kind: 'none' }),
    persistRecovery: async () => {
      throw new Error('nothing should be persisted without a provider payment');
    },
  });

  assert.equal(result.kind, 'pending');
  assert.equal(result.error, 'payment_reconciliation_pending');
});

test('exactly one provider payment is persisted and becomes replayable', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  const persisted = [];
  const order = {
    id: 'order-5',
    order_code: 'NA-20260820-000005',
    checkout_finalization_state: 'reconciliation_required',
  };
  const recovery = {
    kind: 'single',
    orderUpdate: {
      payment_external_id: 'pay_123',
      payment_ref: 'pay_123',
      payment_state: 'pending',
      payment_method: 'pix',
      payment_link_url: 'https://example.test/pay_123',
    },
  };

  const result = await resolvePersistedCheckout({
    order,
    recoverPayment: async () => recovery,
    persistRecovery: async (update) => {
      persisted.push(update);
    },
  });

  assert.equal(result.kind, 'replay');
  assert.equal(result.order.payment_external_id, 'pay_123');
  assert.equal(result.order.checkout_finalization_state, 'finalized');
  assert.deepEqual(persisted, [{ ...recovery.orderUpdate, checkout_finalization_state: 'finalized' }]);
});

test('multiple provider payments produce explicit conflict and are never guessed', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  let persistCalls = 0;
  const result = await resolvePersistedCheckout({
    order: {
      id: 'order-6',
      order_code: 'NA-20260820-000006',
      checkout_finalization_state: 'reconciliation_required',
    },
    recoverPayment: async () => ({ kind: 'conflict', paymentIds: ['pay_a', 'pay_b'] }),
    persistRecovery: async () => {
      persistCalls += 1;
    },
  });

  assert.equal(result.kind, 'conflict');
  assert.deepEqual(result.paymentIds, ['pay_a', 'pay_b']);
  assert.equal(persistCalls, 0);
});

test('Asaas recovery queries by authoritative externalReference and maps one PIX payment', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const calls = [];
  const requestImpl = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/payments') {
      return {
        data: [{
          id: 'pay_pix_1',
          externalReference: 'NA-20260820-000007',
          billingType: 'PIX',
          status: 'PENDING',
          invoiceUrl: 'https://example.test/pay_pix_1',
          dueDate: '2026-08-20',
          clientPaymentDate: null,
        }],
      };
    }
    if (path === '/payments/pay_pix_1/pixQrCode') {
      return {
        payload: '000201-pix-copy-paste',
        encodedImage: 'BASE64PNG',
        expirationDate: '2026-08-20T12:00:00Z',
      };
    }
    throw new Error(`unexpected path ${path}`);
  };

  const result = await recoverAsaasOrderPayment({
    order: {
      order_code: 'NA-20260820-000007',
      payment_method: 'pix',
    },
    requestImpl,
  });

  assert.equal(result.kind, 'single');
  assert.equal(calls[0].path, '/payments');
  assert.deepEqual(calls[0].options.query, { externalReference: 'NA-20260820-000007', limit: 10 });
  assert.equal(result.orderUpdate.payment_external_id, 'pay_pix_1');
  assert.equal(result.orderUpdate.payment_ref, 'pay_pix_1');
  assert.equal(result.orderUpdate.payment_method, 'pix');
  assert.equal(result.orderUpdate.payment_state, 'pending');
  assert.equal(result.orderUpdate.payment_link_url, 'https://example.test/pay_pix_1');
  assert.equal(result.orderUpdate.payment_pix_copy_paste, '000201-pix-copy-paste');
  assert.equal(result.orderUpdate.payment_pix_qr_code, 'data:image/png;base64,BASE64PNG');
  assert.equal(result.orderUpdate.payment_expires_at, '2026-08-20T12:00:00Z');
  assert.equal(result.orderUpdate.payment_last_event, 'PAYMENT_RECONCILED');
});

test('Asaas recovery returns conflict for multiple exact externalReference matches', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const result = await recoverAsaasOrderPayment({
    order: { order_code: 'NA-20260820-000008', payment_method: 'pix' },
    requestImpl: async () => ({
      data: [
        { id: 'pay_1', externalReference: 'NA-20260820-000008', billingType: 'PIX', status: 'PENDING' },
        { id: 'pay_2', externalReference: 'NA-20260820-000008', billingType: 'PIX', status: 'PENDING' },
      ],
    }),
  });

  assert.equal(result.kind, 'conflict');
  assert.deepEqual(result.paymentIds, ['pay_1', 'pay_2']);
});

test('Asaas recovery returns none when externalReference has no exact provider match', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const result = await recoverAsaasOrderPayment({
    order: { order_code: 'NA-20260820-000009', payment_method: 'pix' },
    requestImpl: async () => ({
      data: [{ id: 'pay_other', externalReference: 'NA-OTHER', billingType: 'PIX', status: 'PENDING' }],
    }),
  });

  assert.equal(result.kind, 'none');
});

test('catalog quantity rejects fractional, negative, unsafe, and absurd values', async () => {
  const { resolveCatalogItems } = await load('../api/_serverShipping.js', 'server shipping');
  const supabase = {
    from() {
      return {
        select() {
          return {
            async in() {
              return {
                data: [{ id: 'p1', name: 'Body', price_cents: 5000, weight_grams: 200, is_public: true }],
                error: null,
              };
            },
          };
        },
      };
    },
  };

  for (const qty of [1.5, -1, Number.MAX_SAFE_INTEGER + 1, 1_000_000]) {
    await assert.rejects(
      resolveCatalogItems({ supabase, items: [{ productId: 'p1', qty }] }),
      /qty/i,
      `qty ${qty} must be rejected`,
    );
  }
});

test('unsafe PostgreSQL integer-cent line totals are rejected', async () => {
  const { resolveCatalogItems } = await load('../api/_serverShipping.js', 'server shipping');
  const supabase = {
    from() {
      return {
        select() {
          return {
            async in() {
              return {
                data: [{ id: 'p1', name: 'Body', price_cents: 1_500_000_000, weight_grams: 200, is_public: true }],
                error: null,
              };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    resolveCatalogItems({ supabase, items: [{ productId: 'p1', qty: 2 }] }),
    /cent|total|integer|valor/i,
  );
});

test('unauthenticated POST /api/orders returns 401 before checkout dependencies are needed', async () => {
  const { default: handler } = await load('../api/orders.js', 'orders endpoint');
  const res = createMockResponse();
  await handler({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
});

function baseCheckoutRequest() {
  return {
    method: 'POST',
    headers: {},
    body: {
      idempotencyKey: 'checkout_handler_550e8400-e29b-41d4-a716-446655440000',
      customer: {
        name: 'Cliente Teste',
        phone: '37999999999',
        cpfCnpj: '12345678901',
      },
      address: {
        cep: '35502825',
        number: '100',
      },
      payment: { method: 'pix' },
      items: [{ productId: 'p1', qty: 1, size: 'P' }],
    },
  };
}

function createInsertOnlySupabase(insertResult) {
  return {
    from(table) {
      assert.equal(table, 'orders');
      return {
        insert() {
          return {
            select() {
              return {
                async single() {
                  return insertResult;
                },
              };
            },
          };
        },
      };
    },
  };
}

test('completed same-key handler replay never creates another provider payment', async () => {
  const { createOrdersHandler } = await load('../api/orders.js', 'orders handler factory');
  let createPaymentCalls = 0;
  let recoveryCalls = 0;
  const order = {
    id: 'existing-finalized',
    order_code: 'NA-20260820-100001',
    checkout_finalization_state: 'finalized',
    payment_method: 'pix',
    payment_state: 'pending',
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => ({}),
    findIdempotentOrder: async () => ({ data: order, error: null }),
    recoverAsaasOrderPayment: async () => {
      recoveryCalls += 1;
      return { kind: 'none' };
    },
    createAsaasOrderPayment: async () => {
      createPaymentCalls += 1;
      throw new Error('must not create payment on replay');
    },
  });

  const res = createMockResponse();
  await handler(baseCheckoutRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.idempotentReplay, true);
  assert.equal(recoveryCalls, 0);
  assert.equal(createPaymentCalls, 0);
});

test('in-progress same-key handler request returns 409 and never creates payment', async () => {
  const { createOrdersHandler } = await load('../api/orders.js', 'orders handler factory');
  let createPaymentCalls = 0;
  const order = {
    id: 'existing-progress',
    order_code: 'NA-20260820-100002',
    checkout_finalization_state: 'in_progress',
    payment_method: 'pix',
    payment_state: 'pending',
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => ({}),
    findIdempotentOrder: async () => ({ data: order, error: null }),
    recoverAsaasOrderPayment: async () => ({ kind: 'none' }),
    createAsaasOrderPayment: async () => {
      createPaymentCalls += 1;
      throw new Error('must not create payment while checkout is in progress');
    },
  });

  const res = createMockResponse();
  await handler(baseCheckoutRequest(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.error, 'checkout_in_progress');
  assert.equal(createPaymentCalls, 0);
});

test('23505 race resolving to in-progress row returns 409 and never creates payment', async () => {
  const { createOrdersHandler } = await load('../api/orders.js', 'orders handler factory');
  let lookupCalls = 0;
  let createPaymentCalls = 0;
  const racedOrder = {
    id: 'race-order',
    order_code: 'NA-20260820-100003',
    checkout_finalization_state: 'in_progress',
    payment_method: 'pix',
    payment_state: 'pending',
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => createInsertOnlySupabase({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    findIdempotentOrder: async () => {
      lookupCalls += 1;
      return lookupCalls === 1
        ? { data: null, error: null }
        : { data: racedOrder, error: null };
    },
    generateUniqueOrderCode: async () => 'NA-20260820-100004',
    resolveCatalogItems: async () => ({
      resolvedItems: [{
        productId: 'p1',
        productName: 'Body',
        size: 'P',
        qty: 1,
        unitPriceCents: 5000,
        lineTotalCents: 5000,
        weightGrams: 200,
      }],
      subtotalCents: 5000,
    }),
    calculateAuthoritativeShipping: async () => ({
      feeCents: 1000,
      etaText: '1 dia útil',
      source: 'local_fixed',
      destination: { city: 'Divinópolis', uf: 'MG' },
    }),
    recoverAsaasOrderPayment: async () => ({ kind: 'none' }),
    createAsaasOrderPayment: async () => {
      createPaymentCalls += 1;
      throw new Error('must not create payment after unique race');
    },
  });

  const res = createMockResponse();
  await handler(baseCheckoutRequest(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.error, 'checkout_in_progress');
  assert.equal(lookupCalls, 2);
  assert.equal(createPaymentCalls, 0);
});

test('reconciliation marker cannot regress an already finalized checkout', async () => {
  const { markCheckoutReconciliationRequired } = await load('../api/orders.js', 'orders reconciliation guard');
  const calls = [];
  const supabase = {
    from(table) {
      assert.equal(table, 'orders');
      return {
        update(update) {
          calls.push({ type: 'update', update });
          return {
            eq(column, value) {
              calls.push({ type: 'eq', column, value });
              return {
                async neq(guardColumn, guardValue) {
                  calls.push({ type: 'neq', column: guardColumn, value: guardValue });
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const error = await markCheckoutReconciliationRequired(supabase, 'order-finalized');

  assert.equal(error, null);
  assert.deepEqual(calls.at(-1), {
    type: 'neq',
    column: 'checkout_finalization_state',
    value: 'finalized',
  });
});

test('Asaas recovery maps paid state with paid timestamp and safe paid total', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const result = await recoverAsaasOrderPayment({
    order: {
      order_code: 'NA-20260820-000010',
      payment_method: 'pix',
      payment_state: 'pending',
      total_cents: 5000,
    },
    requestImpl: async (path) => {
      if (path === '/payments') {
        return {
          data: [{
            id: 'pay_paid',
            externalReference: 'NA-20260820-000010',
            billingType: 'PIX',
            status: 'RECEIVED',
            value: 50,
            clientPaymentDate: '2026-08-20T10:15:00Z',
          }],
        };
      }
      if (path === '/payments/pay_paid/pixQrCode') return {};
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(result.kind, 'single');
  assert.equal(result.orderUpdate.payment_state, 'paid');
  assert.equal(result.orderUpdate.paid_at, '2026-08-20T10:15:00Z');
  assert.equal(result.orderUpdate.paid_total_cents, 5000);
});

test('Asaas recovery preserves a stronger local payment state against stale provider status', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const result = await recoverAsaasOrderPayment({
    order: {
      order_code: 'NA-20260820-000011',
      payment_method: 'pix',
      payment_state: 'paid',
      paid_at: '2026-08-20T09:00:00Z',
      paid_total_cents: 5000,
      total_cents: 5000,
    },
    requestImpl: async (path) => {
      if (path === '/payments') {
        return {
          data: [{
            id: 'pay_stale',
            externalReference: 'NA-20260820-000011',
            billingType: 'PIX',
            status: 'PENDING',
            value: 50,
          }],
        };
      }
      if (path === '/payments/pay_stale/pixQrCode') return {};
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(result.orderUpdate.payment_state, 'paid');
  assert.equal(result.orderUpdate.paid_at, '2026-08-20T09:00:00Z');
  assert.equal(result.orderUpdate.paid_total_cents, 5000);
});

test('pending PIX recovery without copy-paste or QR stays reconciliation-required', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const calls = [];
  const result = await recoverAsaasOrderPayment({
    order: {
      order_code: 'NA-20260820-200001',
      payment_method: 'pix',
      payment_state: 'pending',
    },
    requestImpl: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/payments') {
        return {
          data: [{
            id: 'pay_missing_artifact',
            externalReference: 'NA-20260820-200001',
            billingType: 'PIX',
            status: 'PENDING',
            invoiceUrl: 'https://example.test/pay_missing_artifact',
          }],
        };
      }
      if (path === '/payments/pay_missing_artifact/pixQrCode') {
        const error = new Error('QR unavailable');
        error.code = 'asaas_request_failed';
        throw error;
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(result.kind, 'artifact_unavailable');
  assert.equal(result.orderUpdate.payment_external_id, 'pay_missing_artifact');
  assert.deepEqual(calls[0].options.query, {
    externalReference: 'NA-20260820-200001',
    limit: 10,
  });
});

test('artifact-unavailable recovery persists reconciliation state without finalizing', async () => {
  const { resolvePersistedCheckout } = await load('../api/_checkoutFinalization.js', 'checkout finalization');
  const persisted = [];
  const result = await resolvePersistedCheckout({
    order: {
      id: 'order-artifact',
      order_code: 'NA-20260820-200002',
      checkout_finalization_state: 'reconciliation_required',
    },
    recoverPayment: async () => ({
      kind: 'artifact_unavailable',
      orderUpdate: {
        payment_external_id: 'pay_artifact',
        payment_state: 'pending',
        payment_method: 'pix',
      },
    }),
    persistRecovery: async (update) => persisted.push(update),
  });

  assert.equal(result.kind, 'pending');
  assert.equal(result.error, 'payment_artifact_recovery_pending');
  assert.deepEqual(persisted, [{
    payment_external_id: 'pay_artifact',
    payment_state: 'pending',
    payment_method: 'pix',
    checkout_finalization_state: 'reconciliation_required',
  }]);
});

test('paid PIX recovery may finalize even when QR retrieval fails', async () => {
  const { recoverAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas recovery');
  const result = await recoverAsaasOrderPayment({
    order: {
      order_code: 'NA-20260820-200003',
      payment_method: 'pix',
      payment_state: 'pending',
      total_cents: 5000,
    },
    requestImpl: async (path) => {
      if (path === '/payments') {
        return {
          data: [{
            id: 'pay_paid_no_qr',
            externalReference: 'NA-20260820-200003',
            billingType: 'PIX',
            status: 'RECEIVED',
            value: 50,
          }],
        };
      }
      if (path === '/payments/pay_paid_no_qr/pixQrCode') throw new Error('QR unavailable');
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(result.kind, 'single');
  assert.equal(result.orderUpdate.payment_state, 'paid');
});

test('initial pending PIX creation with missing artifacts reports reconciliation instead of ordinary success', async () => {
  const { createAsaasOrderPayment } = await load('../api/_asaas.js', 'Asaas creation');
  const result = await createAsaasOrderPayment({
    order: {
      order_code: 'NA-20260820-200004',
      customer_name: 'Cliente',
      customer_email: 'cliente@example.test',
      customer_phone: '37999999999',
      customer_cpf_cnpj: '12345678901',
      total_cents: 5000,
      payment_method: 'pix',
    },
    items: [],
    paymentMethod: 'pix',
    customerDocument: '12345678901',
    createCustomerImpl: async () => ({ id: 'cus_1' }),
    requestImpl: async (path, options = {}) => {
      if (path === '/payments' && options.method === 'POST') {
        return {
          id: 'pay_created_no_qr',
          externalReference: 'NA-20260820-200004',
          billingType: 'PIX',
          status: 'PENDING',
          invoiceUrl: 'https://example.test/pay_created_no_qr',
        };
      }
      if (path === '/payments/pay_created_no_qr/pixQrCode') throw new Error('QR unavailable');
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(result.requiresReconciliation, true);
  assert.equal(result.payload.state, 'pending');
  assert.equal(result.payload.externalId, 'pay_created_no_qr');
  assert.equal(result.payload.copyPaste, null);
  assert.equal(result.payload.qrCode, null);
});

test('initial checkout with existing pending PIX but no artifact returns retryable non-success and does not finalize', async () => {
  const { createOrdersHandler } = await load('../api/orders.js', 'orders handler factory');
  const updates = [];
  const order = {
    id: 'order-initial-artifact',
    order_code: 'NA-20260820-300001',
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
            updates.push(update);
            return { async eq() { return { error: null }; } };
          },
        };
      }
      if (table === 'order_items') {
        return { async insert() { return { error: null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => supabase,
    findIdempotentOrder: async () => ({ data: null, error: null }),
    generateUniqueOrderCode: async () => order.order_code,
    resolveCatalogItems: async () => ({
      resolvedItems: [{
        productId: 'p1', productName: 'Body', size: 'P', qty: 1,
        unitPriceCents: 5000, lineTotalCents: 5000, weightGrams: 200,
      }],
      subtotalCents: 5000,
    }),
    calculateAuthoritativeShipping: async () => ({
      feeCents: 1000,
      etaText: '1 dia útil',
      source: 'local_fixed',
      destination: { city: 'Divinópolis', uf: 'MG' },
    }),
    createAsaasOrderPayment: async () => ({
      requiresReconciliation: true,
      payload: {
        state: 'pending', method: 'pix', externalId: 'pay_no_artifact',
        copyPaste: null, qrCode: null,
      },
      orderUpdate: {
        payment_method: 'pix',
        payment_state: 'pending',
        payment_provider: 'asaas',
        payment_external_id: 'pay_no_artifact',
        payment_ref: 'pay_no_artifact',
        payment_pix_copy_paste: null,
        payment_pix_qr_code: null,
      },
    }),
  });

  const res = createMockResponse();
  await handler(baseCheckoutRequest(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body?.error, 'payment_artifact_recovery_pending');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].checkout_finalization_state, 'reconciliation_required');
  assert.equal(updates[0].payment_external_id, 'pay_no_artifact');
});

test('same checkout key after PIX artifact failure recovers the existing charge and never creates another', async () => {
  const { createOrdersHandler } = await load('../api/orders.js', 'orders handler factory');
  let createCalls = 0;
  let recoveryCalls = 0;
  const updates = [];
  const order = {
    id: 'existing-artifact-recovery',
    order_code: 'NA-20260820-400001',
    checkout_finalization_state: 'reconciliation_required',
    payment_method: 'pix',
    payment_state: 'pending',
    total_cents: 6000,
  };
  const supabase = {
    from(table) {
      assert.equal(table, 'orders');
      return {
        update(update) {
          updates.push(update);
          return { async eq() { return { error: null }; } };
        },
      };
    },
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => supabase,
    findIdempotentOrder: async () => ({ data: order, error: null }),
    recoverAsaasOrderPayment: async () => {
      recoveryCalls += 1;
      return {
        kind: 'single',
        payload: {
          provider: 'asaas', method: 'pix', state: 'pending', externalId: 'pay_existing',
          copyPaste: 'pix-recovered', qrCode: null,
        },
        orderUpdate: {
          payment_method: 'pix',
          payment_state: 'pending',
          payment_provider: 'asaas',
          payment_external_id: 'pay_existing',
          payment_ref: 'pay_existing',
          payment_pix_copy_paste: 'pix-recovered',
          payment_pix_qr_code: null,
        },
      };
    },
    createAsaasOrderPayment: async () => {
      createCalls += 1;
      throw new Error('same checkout key must never create another payment');
    },
  });

  const res = createMockResponse();
  await handler(baseCheckoutRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.idempotentReplay, true);
  assert.equal(res.body?.payment?.copyPaste, 'pix-recovered');
  assert.equal(recoveryCalls, 1);
  assert.equal(createCalls, 0);
  assert.equal(updates[0].checkout_finalization_state, 'finalized');
});
