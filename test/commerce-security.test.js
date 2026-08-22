import test from 'node:test';
import assert from 'node:assert/strict';

async function load(path, label) {
  try {
    return await import(path);
  } catch (error) {
    assert.fail(`${label} helper is not implemented: ${error.message}`);
  }
}

test('payment transition guard allows pending -> paid', async () => {
  const { preservePaymentState } = await load('../api/_commerceSecurity.js', 'payment transition');
  assert.equal(preservePaymentState('pending', 'paid'), 'paid');
});

test('payment transition guard preserves paid against stale pending', async () => {
  const { preservePaymentState } = await load('../api/_commerceSecurity.js', 'payment transition');
  assert.equal(preservePaymentState('paid', 'pending'), 'paid');
});

test('payment transition guard preserves refunded against paid', async () => {
  const { preservePaymentState } = await load('../api/_commerceSecurity.js', 'payment transition');
  assert.equal(preservePaymentState('refunded', 'paid'), 'refunded');
});

test('payment transition guard preserves cancelled against pending', async () => {
  const { preservePaymentState } = await load('../api/_commerceSecurity.js', 'payment transition');
  assert.equal(preservePaymentState('cancelled', 'pending'), 'cancelled');
});

test('webhook lookup prefers payment id and falls back to externalReference', async () => {
  const { getWebhookLookupSequence } = await load('../api/_commerceSecurity.js', 'webhook reconciliation');
  assert.deepEqual(
    getWebhookLookupSequence({ id: 'pay_123', externalReference: 'NA-20260819-000001' }),
    [
      { column: 'payment_external_id', value: 'pay_123' },
      { column: 'order_code', value: 'NA-20260819-000001' },
    ],
  );
});

test('idempotency key validation accepts a stable opaque key and rejects unsafe values', async () => {
  const { normalizeIdempotencyKey } = await load('../api/_commerceSecurity.js', 'idempotency');
  assert.equal(normalizeIdempotencyKey('checkout_550e8400-e29b-41d4-a716-446655440000'), 'checkout_550e8400-e29b-41d4-a716-446655440000');
  assert.throws(() => normalizeIdempotencyKey('short'), /idempotency/i);
  assert.throws(() => normalizeIdempotencyKey('x'.repeat(129)), /idempotency/i);
  assert.throws(() => normalizeIdempotencyKey('bad key with spaces'), /idempotency/i);
});

test('local shipping is derived server-side from CEP and uses the configured fixed fee', async () => {
  const { calculateAuthoritativeShipping } = await load('../api/_serverShipping.js', 'server shipping');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return { cep: '35502-825', localidade: 'Divinópolis', uf: 'MG' };
      },
    };
  };

  const result = await calculateAuthoritativeShipping({
    toCep: '35502825',
    resolvedItems: [{ productId: 'p1', qty: 2, unitPriceCents: 5000, weightGrams: 200 }],
    fetchImpl,
    melhorEnvioToken: null,
  });

  assert.equal(result.feeCents, 1000);
  assert.equal(result.source, 'local_fixed');
  assert.equal(calls.length, 1, 'local delivery must not call Melhor Envio');
});

test('non-local shipping ignores client authority, uses store origin, catalog insurance/weight, and adds surcharge', async () => {
  const { calculateAuthoritativeShipping } = await load('../api/_serverShipping.js', 'server shipping');
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('viacep.com.br')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { cep: '30110-012', localidade: 'Belo Horizonte', uf: 'MG' };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify([{ id: 1, name: 'Carrier', price: '20.00', delivery_time: 3 }]);
      },
    };
  };

  const result = await calculateAuthoritativeShipping({
    toCep: '30110012',
    resolvedItems: [{ productId: 'p1', qty: 2, unitPriceCents: 5000, weightGrams: 200 }],
    fetchImpl,
    melhorEnvioToken: 'test-token',
    fromCep: '00000000',
    feeCents: 1,
  });

  assert.equal(result.rawFeeCents, 2000);
  assert.equal(result.feeCents, 2500);
  assert.equal(result.surcharge, 500);

  const melhorEnvioCall = calls.find((call) => call.url.includes('melhorenvio.com.br'));
  assert.ok(melhorEnvioCall);
  const payload = JSON.parse(melhorEnvioCall.options.body);
  assert.equal(payload.from.postal_code, '35502825');
  assert.equal(payload.products[0].insurance_value, 100);
  assert.equal(payload.products[0].weight, 0.45);
});

test('catalog resolution ignores client prices and weights', async () => {
  const { resolveCatalogItems } = await load('../api/_serverShipping.js', 'server shipping');
  const supabase = {
    from(table) {
      assert.equal(table, 'products');
      return {
        select() {
          return {
            async in(column, ids) {
              assert.equal(column, 'id');
              assert.deepEqual(ids, ['p1']);
              return {
                data: [{
                  id: 'p1', name: 'Body', price_cents: 5000, weight_grams: 200,
                  is_public: true, in_stock: true, stock_count: 10, size_options: [],
                }],
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const { resolvedItems, subtotalCents } = await resolveCatalogItems({
    supabase,
    items: [{ productId: 'p1', qty: 2, unitPriceCents: 1, weightGrams: 1 }],
  });

  assert.equal(resolvedItems[0].unitPriceCents, 5000);
  assert.equal(resolvedItems[0].weightGrams, 200);
  assert.equal(subtotalCents, 10000);
});

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

test('Asaas webhook fails closed when webhook token is not configured', async () => {
  const previous = process.env.ASAAS_WEBHOOK_TOKEN;
  delete process.env.ASAAS_WEBHOOK_TOKEN;
  try {
    const { default: handler } = await load('../api/asaas-webhook.js', 'Asaas webhook');
    const res = createMockResponse();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body?.error, 'webhook_not_configured');
  } finally {
    if (previous == null) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = previous;
  }
});

test('Asaas webhook rejects a wrong configured token before database access', async () => {
  const previous = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'expected-token';
  try {
    const { default: handler } = await load('../api/asaas-webhook.js', 'Asaas webhook');
    const res = createMockResponse();
    await handler({ method: 'POST', headers: { 'asaas-access-token': 'wrong-token' }, body: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body?.error, 'unauthorized');
  } finally {
    if (previous == null) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = previous;
  }
});

test('retry-payment authorization gate precedes payment-attempt or provider side effects', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../api/public.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function handleRetryPayment');
  const end = source.indexOf('async function handleProfile', start);
  const retrySource = source.slice(start, end);
  const authIndex = retrySource.indexOf('requireAccess(req, res, order)');
  const rateLimitIndex = retrySource.indexOf('enforceRateLimits(supabase');
  const attemptIndex = retrySource.indexOf('findRetryPaymentAttempt(supabase, order.id, attemptKey)');
  const orchestrationIndex = retrySource.indexOf('executePaymentRetry({');

  assert.ok(authIndex >= 0, 'retry-payment must authenticate/authorize the order');
  assert.ok(rateLimitIndex > authIndex, 'rate limiting must happen only after ownership authorization');
  assert.ok(attemptIndex > rateLimitIndex, 'payment attempt lookup/claim must happen only after rate limiting');
  assert.ok(orchestrationIndex > rateLimitIndex, 'provider retry orchestration must happen only after rate limiting');
});

test('payment retry migration enforces persisted uniqueness and RLS', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../supabase/migration_015_payment_retry_safety.sql', import.meta.url), 'utf8');
  assert.match(sql, /unique\s*\(order_id, attempt_key\)/i);
  assert.match(sql, /unique\s*\(external_reference\)/i);
  assert.match(sql, /active_payment_attempt_id/i);
  assert.match(sql, /enable row level security/i);
});
