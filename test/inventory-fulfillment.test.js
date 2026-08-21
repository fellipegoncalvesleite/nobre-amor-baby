import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { resolveCatalogItems } from '../api/_serverShipping.js';
import adminHandler from '../api/admin.js';
import { createOrdersHandler } from '../api/orders.js';

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function checkoutRequest() {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test' },
    body: {
      idempotencyKey: 'checkout_inventory_550e8400-e29b-41d4-a716-446655440000',
      customer: { name: 'Cliente', phone: '37999999999', cpfCnpj: '12345678901' },
      address: { cep: '35500000', street: 'Rua A', number: '1', city: 'Divinópolis', uf: 'MG' },
      payment: { method: 'pix' },
      items: [{ productId: '10000000-0000-0000-0000-000000000001', size: 'P', qty: 1 }],
    },
  };
}

function checkoutHarness({ reserveError = null, claimCreated = true } = {}) {
  const calls = [];
  const order = {
    id: '20000000-0000-0000-0000-000000000001',
    order_code: 'NA-INVENTORY-CHECKOUT',
    status: 'new',
    inventory_state: 'unreserved',
    checkout_finalization_state: 'in_progress',
    customer_name: 'Cliente',
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
            calls.push('insert-order');
            return { select() { return { async single() { return { data: order, error: null }; } }; } };
          },
          update(update) {
            calls.push(`update-order:${update.checkout_finalization_state || update.payment_state}`);
            return { async eq() { return { error: null }; } };
          },
        };
      }
      if (table === 'order_items') {
        return {
          async insert() {
            calls.push('insert-items');
            return { error: null };
          },
        };
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
        productId: '10000000-0000-0000-0000-000000000001', productName: 'Body', size: 'P',
        qty: 1, unitPriceCents: 5000, lineTotalCents: 5000, weightGrams: 200,
      }],
      subtotalCents: 5000,
    }),
    calculateAuthoritativeShipping: async () => ({
      feeCents: 1000, etaText: '1 dia útil', source: 'local_fixed', destination: { city: 'Divinópolis', uf: 'MG' },
    }),
    reserveOrderInventory: async () => {
      calls.push('reserve-inventory');
      if (reserveError) throw reserveError;
      return { ...order, inventory_state: 'reserved' };
    },
    ensureOriginalPaymentAttempt: async () => {
      calls.push('claim-payment');
      return {
        id: 'attempt-1', order_id: order.id, attempt_key: 'original', attempt_kind: 'original',
        external_reference: order.order_code, payment_method: 'pix', state: 'claimed', provider_payment_id: null,
        checkoutClaimCreated: claimCreated,
      };
    },
    recoverAsaasOrderPayment: async () => {
      calls.push('recover-provider');
      return { kind: 'none' };
    },
    createAsaasOrderPayment: async () => {
      calls.push('post-provider');
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: 'pay-1', copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: 'pay-1', payment_ref: 'pay-1' },
      };
    },
    persistPaymentAttemptIdentity: async (_supabase, attempt, input) => ({
      ...attempt, provider_payment_id: input.providerPaymentId, state: input.state,
    }),
  });
  return { calls, handler };
}

function catalogSupabase(products) {
  return {
    from(table) {
      assert.equal(table, 'products');
      return {
        select(columns) {
          assert.match(columns, /in_stock/);
          assert.match(columns, /stock_count/);
          assert.match(columns, /size_options/);
          return { async in() { return { data: products, error: null }; } };
        },
      };
    },
  };
}

test('catalog rejects unavailable product stock before checkout', async () => {
  const supabase = catalogSupabase([{
    id: 'p1', name: 'Body', price_cents: 5000, weight_grams: 200,
    is_public: true, in_stock: false, stock_count: 0, size_options: [],
  }]);

  await assert.rejects(
    resolveCatalogItems({ supabase, items: [{ productId: 'p1', qty: 1 }] }),
    (error) => error.code === 'product_out_of_stock' && error.status === 409,
  );
});

test('catalog aggregates duplicate product lines before checking stock', async () => {
  const supabase = catalogSupabase([{
    id: 'p1', name: 'Body', price_cents: 5000, weight_grams: 200,
    is_public: true, in_stock: true, stock_count: 4, size_options: ['P', 'M'],
  }]);

  await assert.rejects(
    resolveCatalogItems({
      supabase,
      items: [
        { productId: 'p1', size: 'P', qty: 2 },
        { productId: 'p1', size: 'M', qty: 3 },
      ],
    }),
    (error) => error.code === 'insufficient_inventory' && error.status === 409,
  );
});

test('catalog requires an exact allowed size when product has size options', async () => {
  const supabase = catalogSupabase([{
    id: 'p1', name: 'Body', price_cents: 5000, weight_grams: 200,
    is_public: true, in_stock: true, stock_count: 5, size_options: ['P', 'M'],
  }]);

  await assert.rejects(
    resolveCatalogItems({ supabase, items: [{ productId: 'p1', size: 'G', qty: 1 }] }),
    (error) => error.code === 'invalid_product_size' && error.status === 400,
  );
});

test('admin confirmed to packing never restores stock outside the fulfillment transaction', async (t) => {
  const requests = [];
  const order = {
    id: '11111111-1111-1111-1111-111111111111',
    order_code: 'NA-REGRESSION-1',
    status: 'confirmed',
    inventory_state: 'reserved',
  };
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body });
    res.setHeader('Content-Type', 'application/json');

    if (req.url.startsWith('/rest/v1/orders') && req.method === 'GET') {
      res.end(JSON.stringify(order));
      return;
    }
    if (req.url.startsWith('/rest/v1/order_items') && req.method === 'GET') {
      res.end(JSON.stringify([{ id: 'item-1', product_id: '22222222-2222-2222-2222-222222222222', qty: 1 }]));
      return;
    }
    if (req.url.startsWith('/rest/v1/orders') && req.method === 'PATCH') {
      res.end(JSON.stringify({ ...order, status: 'packing' }));
      return;
    }
    if (req.url.startsWith('/rest/v1/rpc/transition_order_fulfillment') && req.method === 'POST') {
      res.end(JSON.stringify({ order_id: order.id, status: 'packing', inventory_state: 'reserved' }));
      return;
    }
    if (req.url.startsWith('/rest/v1/rpc/')) {
      res.end('{}');
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: `unexpected ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    admin: process.env.ADMIN_API_KEY,
  };
  t.after(() => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.admin === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = previous.admin;
  });
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.ADMIN_API_KEY = 'test-admin-key';

  const res = createMockResponse();
  await adminHandler({
    method: 'PATCH',
    headers: { 'x-admin-key': 'test-admin-key' },
    query: { resource: 'orders', id: order.order_code },
    body: { status: 'packing' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(requests.some((request) => request.url.includes('/rpc/increment_stock')), false);
  assert.equal(requests.some((request) => request.url.includes('/rpc/decrement_stock')), false);
  assert.equal(requests.filter((request) => request.url.includes('/rpc/transition_order_fulfillment')).length, 1);
});

test('inventory RPC errors preserve explicit conflict semantics', async () => {
  const { inventoryRpcError } = await import('../api/_inventory.js');
  const conflict = inventoryRpcError({ message: 'inventory_release_requires_payment_resolution', code: 'P0001' });
  assert.equal(conflict.code, 'inventory_release_requires_payment_resolution');
  assert.equal(conflict.status, 409);

  const malformed = inventoryRpcError({ message: 'invalid_product_size', code: '22023' });
  assert.equal(malformed.code, 'invalid_product_size');
  assert.equal(malformed.status, 400);
});

test('fulfillment wrapper sends only server-authoritative transition inputs', async () => {
  const { transitionOrderFulfillment } = await import('../api/_inventory.js');
  let call;
  const supabase = {
    async rpc(name, params) {
      call = { name, params };
      return { data: { id: 'order-1', status: 'cancelled', inventory_state: 'released' }, error: null };
    },
  };

  const result = await transitionOrderFulfillment(supabase, {
    orderId: 'order-1',
    newStatus: 'cancelled',
    rejectedReason: null,
    cancelReason: 'Cliente desistiu',
  });

  assert.deepEqual(call, {
    name: 'transition_order_fulfillment',
    params: {
      p_order_id: 'order-1',
      p_new_status: 'cancelled',
      p_rejected_reason: null,
      p_cancel_reason: 'Cliente desistiu',
    },
  });
  assert.equal(result.inventory_state, 'released');
});

test('checkout reserves persisted authoritative items before claiming or posting payment', async () => {
  const { calls, handler } = checkoutHarness();
  const res = createMockResponse();
  await handler(checkoutRequest(), res);

  assert.equal(res.statusCode, 201);
  assert.ok(calls.indexOf('insert-items') < calls.indexOf('reserve-inventory'));
  assert.ok(calls.indexOf('reserve-inventory') < calls.indexOf('claim-payment'));
  assert.ok(calls.indexOf('claim-payment') < calls.indexOf('post-provider'));
});

test('reservation failure returns a stock conflict without claiming or posting payment', async () => {
  const error = new Error('A quantidade solicitada excede o estoque disponível.');
  error.code = 'insufficient_inventory';
  error.status = 409;
  const { calls, handler } = checkoutHarness({ reserveError: error });
  const res = createMockResponse();
  await handler(checkoutRequest(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'insufficient_inventory');
  assert.equal(calls.includes('claim-payment'), false);
  assert.equal(calls.includes('post-provider'), false);
});

test('concurrent checkout that loses the original ledger claim never posts a second provider payment', async () => {
  const { calls, handler } = checkoutHarness({ claimCreated: false });
  const res = createMockResponse();
  await handler(checkoutRequest(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(calls.includes('post-provider'), false);
  assert.equal(calls.includes('recover-provider'), true);
});

test('same-key unreserved checkout retries reservation and creates payment only after success', async () => {
  const calls = [];
  const order = {
    id: '20000000-0000-0000-0000-000000000099',
    order_code: 'NA-RETRY-INVENTORY',
    status: 'new',
    inventory_state: 'unreserved',
    checkout_finalization_state: 'in_progress',
    customer_cpf_cnpj: '12345678901',
    total_cents: 6000,
    payment_method: 'pix',
    payment_state: 'pending',
  };
  const itemRows = [{
    order_id: order.id,
    product_id: '10000000-0000-0000-0000-000000000001',
    product_name: 'Body',
    size: 'P',
    qty: 1,
    unit_price_cents: 5000,
    line_total_cents: 5000,
  }];
  const supabase = {
    from(table) {
      if (table === 'order_items') {
        return {
          select() {
            return {
              eq() {
                return { async order() { return { data: itemRows, error: null }; } };
              },
            };
          },
        };
      }
      if (table === 'orders') {
        return {
          update(update) {
            calls.push(`update:${update.checkout_finalization_state || update.payment_state}`);
            return { async eq() { return { error: null }; } };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => supabase,
    findIdempotentOrder: async () => ({ data: order, error: null }),
    reserveOrderInventory: async () => {
      calls.push('reserve');
      return { ...order, inventory_state: 'reserved' };
    },
    recoverAsaasOrderPayment: async () => {
      calls.push('recover');
      return { kind: 'none' };
    },
    ensureOriginalPaymentAttempt: async () => {
      calls.push('claim');
      return {
        id: 'attempt-retry-inventory', order_id: order.id, attempt_key: 'original', attempt_kind: 'original',
        external_reference: order.order_code, payment_method: 'pix', state: 'claimed', provider_payment_id: null,
      };
    },
    createAsaasOrderPayment: async () => {
      calls.push('provider');
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: 'pay-retry-inventory', copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: 'pay-retry-inventory', payment_ref: 'pay-retry-inventory' },
      };
    },
    persistPaymentAttemptIdentity: async (_supabase, attempt, input) => ({
      ...attempt, provider_payment_id: input.providerPaymentId, state: input.state,
    }),
  });

  const res = createMockResponse();
  await handler(checkoutRequest(), res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.filter((call) => ['reserve', 'recover', 'claim', 'provider'].includes(call)), ['reserve', 'claim', 'provider']);
});

test('same-key reserved checkout resumes provider creation only when no original ledger row exists', async () => {
  const calls = [];
  const order = {
    id: '20000000-0000-0000-0000-000000000098',
    order_code: 'NA-RESERVED-NO-LEDGER',
    status: 'new',
    inventory_state: 'reserved',
    checkout_finalization_state: 'in_progress',
    customer_cpf_cnpj: '12345678901',
    total_cents: 6000,
    payment_method: 'pix',
    payment_state: 'pending',
  };
  const itemRows = [{
    order_id: order.id, product_id: '10000000-0000-0000-0000-000000000001', product_name: 'Body',
    size: 'P', qty: 1, unit_price_cents: 5000, line_total_cents: 5000,
  }];
  const supabase = {
    from(table) {
      if (table === 'payment_attempts') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return { async maybeSingle() { return { data: null, error: null }; } };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'order_items') {
        return {
          select() {
            return { eq() { return { async order() { return { data: itemRows, error: null }; } }; } };
          },
        };
      }
      if (table === 'orders') {
        return {
          update() { return { async eq() { return { error: null }; } }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => supabase,
    findIdempotentOrder: async () => ({ data: order, error: null }),
    reserveOrderInventory: async () => { calls.push('reserve'); },
    recoverAsaasOrderPayment: async () => { calls.push('recover'); return { kind: 'none' }; },
    ensureOriginalPaymentAttempt: async () => {
      calls.push('claim');
      return {
        id: 'attempt-resume', order_id: order.id, attempt_key: 'original', attempt_kind: 'original',
        external_reference: order.order_code, payment_method: 'pix', state: 'claimed', provider_payment_id: null,
      };
    },
    createAsaasOrderPayment: async () => {
      calls.push('provider');
      return {
        requiresReconciliation: false,
        payload: { state: 'pending', method: 'pix', externalId: 'pay-resume', copyPaste: 'pix-code' },
        orderUpdate: { payment_state: 'pending', payment_external_id: 'pay-resume', payment_ref: 'pay-resume' },
      };
    },
    persistPaymentAttemptIdentity: async (_supabase, attempt, input) => ({ ...attempt, state: input.state }),
  });
  const res = createMockResponse();
  await handler(checkoutRequest(), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.filter((call) => ['reserve', 'recover', 'claim', 'provider'].includes(call)), ['claim', 'provider']);
});

test('same-key released checkout is terminal and never recovers or creates payment', async () => {
  let providerCalls = 0;
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'cliente@example.test' } }),
    getSupabase: () => ({}),
    findIdempotentOrder: async () => ({
      data: {
        id: 'order-released', order_code: 'NA-RELEASED', inventory_state: 'released',
        checkout_finalization_state: 'finalized',
      },
      error: null,
    }),
    recoverAsaasOrderPayment: async () => { providerCalls += 1; },
    createAsaasOrderPayment: async () => { providerCalls += 1; },
  });
  const res = createMockResponse();
  await handler(checkoutRequest(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'inventory_checkout_terminal');
  assert.equal(providerCalls, 0);
});

test('public cancellation uses fulfillment transaction without fabricating payment state', async () => {
  const { handleCancelOrder } = await import('../api/public.js');
  const writes = [];
  const order = {
    id: 'order-public-cancel',
    order_code: 'NA-PUBLIC-CANCEL',
    user_id: 'user-1',
    customer_email: 'cliente@example.test',
    status: 'new',
    payment_state: 'pending',
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
        update(value) {
          writes.push(value);
          throw new Error('public cancellation must not update orders directly');
        },
      };
    },
  };
  const transitions = [];
  const res = createMockResponse();
  await handleCancelOrder({
    method: 'POST',
    body: { orderCode: order.order_code, reason: 'Cliente desistiu' },
  }, res, supabase, {
    requireAccess: async () => ({ user: { id: 'user-1' } }),
    transition: async (_supabase, input) => {
      transitions.push(input);
      return { ...order, status: 'cancelled', inventory_state: 'released' };
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(writes.length, 0);
  assert.deepEqual(transitions, [{
    orderId: order.id,
    newStatus: 'cancelled',
    cancelReason: 'Cliente desistiu',
  }]);
  assert.equal(res.body.paymentState, 'pending');
});

test('admin fulfillment actions expose only the next forward states', async () => {
  const { getAdminFulfillmentActions } = await import('../src/lib/orderStatus.js');
  assert.deepEqual(getAdminFulfillmentActions('new').map((action) => action.status), ['confirmed', 'rejected', 'cancelled']);
  assert.deepEqual(getAdminFulfillmentActions('confirmed').map((action) => action.status), ['packing', 'cancelled']);
  assert.deepEqual(getAdminFulfillmentActions('packing').map((action) => action.status), ['shipped', 'cancelled']);
  assert.deepEqual(getAdminFulfillmentActions('shipped').map((action) => action.status), ['done']);
  for (const terminal of ['done', 'rejected', 'cancelled']) {
    assert.deepEqual(getAdminFulfillmentActions(terminal), []);
  }
});
