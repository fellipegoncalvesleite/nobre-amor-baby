import test from 'node:test';
import assert from 'node:assert/strict';

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: new Map(),
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); },
    getHeader(name) { return this.headers.get(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function blocked(seconds = 9) {
  return { allowed: false, retryAfterSeconds: seconds };
}

function allowed() {
  return { allowed: true, remaining: 1 };
}

function createRpcLimiter(blockedScope, calls) {
  return {
    async rpc(name, input) {
      assert.equal(name, 'consume_api_rate_limit');
      calls.push({
        scope: input.p_scope,
        limit: input.p_limit,
        windowSeconds: input.p_window_seconds,
        subjectHash: input.p_subject_hash,
      });
      const isBlocked = input.p_scope === blockedScope;
      return {
        data: [{
          allowed: !isBlocked,
          limit_value: input.p_limit,
          remaining: isBlocked ? 0 : Math.max(input.p_limit - 1, 0),
          retry_after_seconds: isBlocked ? 17 : 0,
          reset_at: '2026-08-22T19:00:00Z',
          request_count: isBlocked ? input.p_limit + 1 : 1,
        }],
        error: null,
      };
    },
  };
}

function checkoutRequest(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.41' },
    body: {
      idempotencyKey: 'checkout_550e8400-e29b-41d4-a716-446655440000',
      ...overrides,
    },
  };
}

test('shipping quote returns 429 before catalog, ViaCEP, or Melhor Envio work', async () => {
  const module = await import('../api/shipping-quote.js');
  assert.equal(typeof module.createShippingQuoteHandler, 'function', 'shipping handler factory must expose a limiter seam');
  const calls = [];
  const handler = module.createShippingQuoteHandler({
    getSupabase: () => ({}),
    consumeRateLimits: async (_supabase, rules) => {
      calls.push(...rules.map((rule) => rule.scope));
      return blocked(13);
    },
    resolveCatalogItems: async () => { calls.push('catalog'); throw new Error('must not run'); },
    calculateAuthoritativeShipping: async () => { calls.push('shipping-provider'); throw new Error('must not run'); },
  });
  const res = createMockResponse();
  await handler({ method: 'POST', headers: { 'x-vercel-forwarded-for': '203.0.113.41' }, body: { items: [], toCep: '30110012' } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, 'rate_limited');
  assert.deepEqual(calls, ['shipping-quote:ip', 'shipping-quote:global']);
  assert.equal(calls.includes('catalog'), false);
  assert.equal(calls.includes('shipping-provider'), false);
});

test('shipping quote below limit retains normal handler behavior', async () => {
  const { createShippingQuoteHandler } = await import('../api/shipping-quote.js');
  const calls = [];
  const handler = createShippingQuoteHandler({
    getSupabase: () => ({}),
    consumeRateLimits: async () => allowed(),
    resolveCatalogItems: async () => { calls.push('catalog'); return { resolvedItems: [{ productId: 'p1' }] }; },
    calculateAuthoritativeShipping: async () => { calls.push('shipping'); return { feeCents: 2500, etaText: '3 dias', source: 'melhor_envio' }; },
  });
  const res = createMockResponse();
  await handler({ method: 'POST', headers: {}, body: { items: [{ productId: 'p1' }], toCep: '30110012' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['catalog', 'shipping']);
});

test('newsletter validates/normalizes email then blocks before insert with IP/email/global rules', async () => {
  const module = await import('../api/newsletter.js');
  assert.equal(typeof module.createNewsletterHandler, 'function', 'newsletter handler factory must expose a limiter seam');
  let inserted = false;
  let seenRules;
  const supabase = {
    from() {
      return { insert() { inserted = true; return Promise.resolve({ error: null }); } };
    },
  };
  const handler = module.createNewsletterHandler({
    getSupabase: () => supabase,
    consumeRateLimits: async (_client, rules) => { seenRules = rules; return blocked(31); },
  });
  const res = createMockResponse();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.41' }, body: { email: ' Rate-Limit-Test@Example.com ' } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(inserted, false);
  assert.deepEqual(seenRules.map(({ scope, subject, limit, windowSeconds }) => ({ scope, subject, limit, windowSeconds })), [
    { scope: 'newsletter:ip', subject: '203.0.113.41', limit: 5, windowSeconds: 3600 },
    { scope: 'newsletter:email', subject: 'rate-limit-test@example.com', limit: 3, windowSeconds: 86400 },
    { scope: 'newsletter:global', subject: 'storefront', limit: 300, windowSeconds: 3600 },
  ]);
});


test('newsletter IP and email buckets independently return 429 before insertion', async () => {
  const { createNewsletterHandler } = await import('../api/newsletter.js');
  const expectations = [
    ['newsletter:ip', ['newsletter:ip']],
    ['newsletter:email', ['newsletter:ip', 'newsletter:email']],
  ];

  for (const [blockedScope, expectedScopes] of expectations) {
    const rpcCalls = [];
    let inserted = false;
    const supabase = {
      ...createRpcLimiter(blockedScope, rpcCalls),
      from() {
        return { insert() { inserted = true; return Promise.resolve({ error: null }); } };
      },
    };
    const handler = createNewsletterHandler({ getSupabase: () => supabase });
    const res = createMockResponse();
    await handler({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.41' },
      body: { email: ' Rate-Limit-Test@Example.com ' },
    }, res);

    assert.equal(res.statusCode, 429, blockedScope);
    assert.equal(res.body.error, 'rate_limited', blockedScope);
    assert.equal(inserted, false, blockedScope);
    assert.deepEqual(rpcCalls.map((call) => call.scope), expectedScopes, blockedScope);
  }
});

test('newsletter duplicate semantics remain 200 when limiter allows', async () => {
  const { createNewsletterHandler } = await import('../api/newsletter.js');
  const supabase = {
    from() {
      return { insert() { return Promise.resolve({ error: { code: '23505', message: 'duplicate key newsletter_subscribers_email_ci_idx' } }); } };
    },
  };
  const handler = createNewsletterHandler({ getSupabase: () => supabase, consumeRateLimits: async () => allowed() });
  const res = createMockResponse();
  await handler({ method: 'POST', headers: {}, body: { email: 'duplicate@example.com' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.duplicate, true);
});

test('checkout user/IP/global limiter rejects before idempotency, catalog, inventory, shipping, or provider work', async () => {
  const { createOrdersHandler } = await import('../api/orders.js');
  const calls = [];
  let seenRules;
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: '11111111-2222-3333-4444-555555555555', email: 'buyer@example.com' } }),
    getSupabase: () => ({}),
    consumeRateLimits: async (_client, rules) => { seenRules = rules; return blocked(23); },
    findIdempotentOrder: async () => { calls.push('idempotency'); throw new Error('must not run'); },
    resolveCatalogItems: async () => { calls.push('catalog'); throw new Error('must not run'); },
    reserveOrderInventory: async () => { calls.push('inventory'); throw new Error('must not run'); },
    calculateAuthoritativeShipping: async () => { calls.push('shipping'); throw new Error('must not run'); },
    createAsaasOrderPayment: async () => { calls.push('provider'); throw new Error('must not run'); },
    recoverAsaasOrderPayment: async () => { calls.push('recovery'); throw new Error('must not run'); },
  });
  const res = createMockResponse();
  await handler(checkoutRequest(), res);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(calls, []);
  assert.deepEqual(seenRules.map(({ scope, subject, limit, windowSeconds }) => ({ scope, subject, limit, windowSeconds })), [
    { scope: 'checkout:user', subject: '11111111-2222-3333-4444-555555555555', limit: 12, windowSeconds: 600 },
    { scope: 'checkout:ip', subject: '203.0.113.41', limit: 30, windowSeconds: 600 },
    { scope: 'checkout:global', subject: 'storefront', limit: 500, windowSeconds: 600 },
  ]);
});


test('checkout user, IP, and global buckets independently return 429 before commerce side effects', async () => {
  const { createOrdersHandler } = await import('../api/orders.js');
  const expectations = [
    ['checkout:user', ['checkout:user']],
    ['checkout:ip', ['checkout:user', 'checkout:ip']],
    ['checkout:global', ['checkout:user', 'checkout:ip', 'checkout:global']],
  ];

  for (const [blockedScope, expectedScopes] of expectations) {
    const rpcCalls = [];
    const sideEffects = [];
    const supabase = createRpcLimiter(blockedScope, rpcCalls);
    const handler = createOrdersHandler({
      verifyUser: async () => ({ user: { id: '11111111-2222-3333-4444-555555555555', email: 'buyer@example.com' } }),
      getSupabase: () => supabase,
      findIdempotentOrder: async () => { sideEffects.push('idempotency'); throw new Error('must not run'); },
      resolveCatalogItems: async () => { sideEffects.push('catalog'); throw new Error('must not run'); },
      reserveOrderInventory: async () => { sideEffects.push('inventory'); throw new Error('must not run'); },
      calculateAuthoritativeShipping: async () => { sideEffects.push('shipping'); throw new Error('must not run'); },
      createAsaasOrderPayment: async () => { sideEffects.push('provider'); throw new Error('must not run'); },
      recoverAsaasOrderPayment: async () => { sideEffects.push('recovery'); throw new Error('must not run'); },
    });
    const res = createMockResponse();
    await handler(checkoutRequest(), res);

    assert.equal(res.statusCode, 429, blockedScope);
    assert.equal(res.body.error, 'rate_limited', blockedScope);
    assert.deepEqual(sideEffects, [], blockedScope);
    assert.deepEqual(rpcCalls.map((call) => call.scope), expectedScopes, blockedScope);
  }
});

test('checkout limiter infrastructure failure returns 503 before commerce side effects', async () => {
  const { createOrdersHandler } = await import('../api/orders.js');
  let idempotencyCalls = 0;
  const error = new Error('down');
  error.code = 'rate_limit_unavailable';
  const handler = createOrdersHandler({
    verifyUser: async () => ({ user: { id: 'user-1', email: 'buyer@example.com' } }),
    getSupabase: () => ({}),
    consumeRateLimits: async () => { throw error; },
    findIdempotentOrder: async () => { idempotencyCalls += 1; return { data: null, error: null }; },
  });
  const res = createMockResponse();
  await handler(checkoutRequest(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'rate_limit_unavailable');
  assert.equal(idempotencyCalls, 0);
});

test('cancel-order authorizes ownership then blocks before fulfillment/closure side effects', async () => {
  const { handleCancelOrder } = await import('../api/public.js');
  const order = { id: 'order-1', order_code: 'NA-CANCEL-1', user_id: 'user-1', customer_email: 'buyer@example.com', status: 'new', payment_state: 'pending' };
  const supabase = {
    from(table) {
      assert.equal(table, 'orders');
      return { select() { return { eq() { return { async maybeSingle() { return { data: order, error: null }; } }; } }; } };
    },
  };
  const calls = [];
  const res = createMockResponse();
  await handleCancelOrder({ method: 'POST', headers: { 'x-real-ip': '203.0.113.41' }, body: { orderCode: order.order_code, reason: 'Cliente desistiu' } }, res, supabase, {
    requireAccess: async () => { calls.push('auth'); return { user: { id: 'user-1' } }; },
    consumeRateLimits: async () => { calls.push('limit'); return blocked(12); },
    transition: async () => { calls.push('transition'); throw new Error('must not run'); },
    requestClosure: async () => { calls.push('closure'); throw new Error('must not run'); },
  });
  assert.equal(res.statusCode, 429);
  assert.deepEqual(calls, ['auth', 'limit']);
});

test('retry-payment authorizes ownership then blocks before payment-attempt/provider side effects', async () => {
  const module = await import('../api/public.js');
  assert.equal(typeof module.handleRetryPayment, 'function', 'retry-payment must expose a behavioral test seam');
  const order = {
    id: 'order-2', order_code: 'NA-RETRY-2', user_id: 'user-2', customer_email: 'buyer@example.com',
    status: 'new', payment_state: 'failed', payment_method: 'pix', customer_cpf_cnpj: '12345678901', total_cents: 5000,
  };
  const supabase = {
    from(table) {
      assert.equal(table, 'orders');
      return { select() { return { eq() { return { async maybeSingle() { return { data: order, error: null }; } }; } }; } };
    },
  };
  const calls = [];
  const res = createMockResponse();
  await module.handleRetryPayment({ method: 'POST', headers: { 'x-real-ip': '203.0.113.41' }, body: { orderCode: order.order_code, attemptKey: 'retry_attempt_00000001' } }, res, supabase, {
    requireAccess: async () => { calls.push('auth'); return { user: { id: 'user-2' } }; },
    consumeRateLimits: async () => { calls.push('limit'); return blocked(10); },
    findRetryPaymentAttempt: async () => { calls.push('attempt'); throw new Error('must not run'); },
    executePaymentRetry: async () => { calls.push('provider'); throw new Error('must not run'); },
  });
  assert.equal(res.statusCode, 429);
  assert.deepEqual(calls, ['auth', 'limit']);
});


test('retry-payment keeps ownership authorization authoritative and does not consume a user bucket for denied access', async () => {
  const { handleRetryPayment } = await import('../api/public.js');
  const order = { id: 'order-denied', order_code: 'NA-DENIED', status: 'new', payment_state: 'failed' };
  const supabase = {
    from() {
      return { select() { return { eq() { return { async maybeSingle() { return { data: order, error: null }; } }; } }; } };
    },
  };
  const calls = [];
  const res = createMockResponse();
  await handleRetryPayment({ method: 'POST', headers: {}, body: { orderCode: order.order_code, attemptKey: 'retry_attempt_00000002' } }, res, supabase, {
    requireAccess: async (_req, response) => {
      calls.push('auth');
      response.status(403).json({ error: 'forbidden' });
      return null;
    },
    consumeRateLimits: async () => { calls.push('limit'); return allowed(); },
  });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(calls, ['auth']);
});

test('retry-payment below limit returns to its existing post-auth status semantics', async () => {
  const { handleRetryPayment } = await import('../api/public.js');
  const order = { id: 'order-processing', order_code: 'NA-PROCESSING', status: 'confirmed', payment_state: 'failed' };
  const supabase = {
    from() {
      return { select() { return { eq() { return { async maybeSingle() { return { data: order, error: null }; } }; } }; } };
    },
  };
  const calls = [];
  const res = createMockResponse();
  await handleRetryPayment({ method: 'POST', headers: {}, body: { orderCode: order.order_code, attemptKey: 'retry_attempt_00000003' } }, res, supabase, {
    requireAccess: async () => { calls.push('auth'); return { user: { id: 'user-2' } }; },
    consumeRateLimits: async () => { calls.push('limit'); return allowed(); },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_status');
  assert.deepEqual(calls, ['auth', 'limit']);
});

test('profile avatar authenticates then blocks before base64 validation or storage side effects', async () => {
  const module = await import('../api/profile-avatar.js');
  assert.equal(typeof module.createProfileAvatarHandler, 'function', 'profile avatar handler factory must expose a limiter seam');
  const calls = [];
  const handler = module.createProfileAvatarHandler({
    verifyUser: async () => { calls.push('auth'); return { user: { id: 'user-avatar' } }; },
    getSupabase: () => ({ storage: { listBuckets: async () => { calls.push('storage'); return { data: [], error: null }; } } }),
    consumeRateLimits: async () => { calls.push('limit'); return blocked(60); },
  });
  const res = createMockResponse();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.41' }, body: { file: 'definitely-not-base64' } }, res);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(calls, ['auth', 'limit']);
});


test('profile avatar below limit retains authenticated upload behavior', async () => {
  const { createProfileAvatarHandler } = await import('../api/profile-avatar.js');
  const calls = [];
  const bucket = {
    async upload(path, buffer, options) {
      calls.push(['upload', path, buffer.length, options.contentType]);
      return { error: null };
    },
    async remove(paths) {
      calls.push(['remove', paths]);
      return { error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `https://example.test/${path}` } };
    },
  };
  const supabase = {
    storage: {
      async listBuckets() { calls.push('list-buckets'); return { data: [{ name: 'profile-images' }], error: null }; },
      from(name) { assert.equal(name, 'profile-images'); return bucket; },
    },
  };
  const handler = createProfileAvatarHandler({
    verifyUser: async () => ({ user: { id: 'user-avatar' } }),
    getSupabase: () => supabase,
    consumeRateLimits: async () => allowed(),
  });
  const res = createMockResponse();
  await handler({
    method: 'POST',
    headers: {},
    body: { file: 'data:image/png;base64,aGVsbG8=', filename: 'avatar.png' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bucket, 'profile-images');
  assert.match(res.body.path, /^user-avatar\//);
  assert.equal(calls[0], 'list-buckets');
  assert.equal(calls[1][0], 'upload');
  assert.equal(calls[1][3], 'image/png');
});

test('OPTIONS and wrong methods do not consume counters on dedicated POST endpoints', async () => {
  const { createShippingQuoteHandler } = await import('../api/shipping-quote.js');
  let limits = 0;
  const handler = createShippingQuoteHandler({
    getSupabase: () => ({}),
    consumeRateLimits: async () => { limits += 1; return allowed(); },
  });
  const optionsRes = createMockResponse();
  await handler({ method: 'OPTIONS', headers: {} }, optionsRes);
  assert.equal(optionsRes.statusCode, 204);
  const getRes = createMockResponse();
  await handler({ method: 'GET', headers: {} }, getRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(limits, 0);
});
