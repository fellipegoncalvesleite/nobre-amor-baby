import test from 'node:test';
import assert from 'node:assert/strict';

async function loadRateLimit() {
  try {
    return await import('../api/_rateLimit.js');
  } catch (error) {
    assert.fail(`rate-limit helper is not implemented: ${error.message}`);
  }
}

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

test('SHA-256 subject hashing is deterministic lowercase 64-hex and domain separated', async () => {
  const { hashRateLimitSubject } = await loadRateLimit();
  const userA = hashRateLimitSubject('user', 'same-value');
  const userB = hashRateLimitSubject('user', 'same-value');
  const ip = hashRateLimitSubject('ip', 'same-value');
  assert.equal(userA, userB);
  assert.match(userA, /^[0-9a-f]{64}$/);
  assert.notEqual(userA, ip);
});

test('consumeRateLimit sends only the hash, never the raw subject, to PostgreSQL RPC', async () => {
  const { consumeRateLimit, hashRateLimitSubject } = await loadRateLimit();
  const raw = 'rate-limit-test@example.com';
  let args;
  const supabase = {
    async rpc(name, input) {
      assert.equal(name, 'consume_api_rate_limit');
      args = input;
      return { data: [{ allowed: true, limit_value: 3, remaining: 2, retry_after_seconds: 0, reset_at: '2026-08-22T19:00:00Z', request_count: 1 }], error: null };
    },
  };
  const result = await consumeRateLimit(supabase, {
    scope: 'newsletter:email', kind: 'email', subject: raw, limit: 3, windowSeconds: 86400,
  });
  assert.equal(result.allowed, true);
  assert.equal(args.p_subject_hash, hashRateLimitSubject('email', raw));
  assert.equal(JSON.stringify(args).includes(raw), false);
  assert.deepEqual(Object.keys(args).sort(), ['p_cost', 'p_limit', 'p_scope', 'p_subject_hash', 'p_window_seconds']);
});

test('rate-limit IP extraction prefers valid Vercel/forwarded/real/socket candidates and normalizes mapped IPv4', async () => {
  const { getRateLimitClientIp } = await loadRateLimit();
  assert.equal(getRateLimitClientIp({ headers: { 'x-vercel-forwarded-for': '203.0.113.41' } }), '203.0.113.41');
  assert.equal(getRateLimitClientIp({ headers: { 'x-forwarded-for': 'garbage, 2001:db8::1, 203.0.113.9' } }), '2001:db8::1');
  assert.equal(getRateLimitClientIp({ headers: { 'x-real-ip': '::ffff:203.0.113.42' } }), '203.0.113.42');
  assert.equal(getRateLimitClientIp({ headers: { 'x-vercel-forwarded-for': 'garbage' }, socket: { remoteAddress: '198.51.100.8' } }), '198.51.100.8');
});

test('rate-limit IP extraction rejects arbitrary strings and returns null when no valid IP exists', async () => {
  const { getRateLimitClientIp } = await loadRateLimit();
  assert.equal(getRateLimitClientIp({ headers: { 'x-forwarded-for': 'attacker-controlled, nope' }, socket: { remoteAddress: 'also-nope' } }), null);
  assert.equal(getRateLimitClientIp({ headers: {} }), null);
});

test('consumeRateLimits skips null subjects, stops at first blocked rule, and allows complete rule sets', async () => {
  const { consumeRateLimits } = await loadRateLimit();
  const calls = [];
  const supabase = {
    async rpc(_name, input) {
      calls.push(input.p_scope);
      const blocked = input.p_scope === 'checkout:ip';
      return {
        data: [{ allowed: !blocked, limit_value: 30, remaining: blocked ? 0 : 29, retry_after_seconds: blocked ? 11 : 0, reset_at: '2026-08-22T19:00:00Z', request_count: blocked ? 31 : 1 }],
        error: null,
      };
    },
  };
  const blocked = await consumeRateLimits(supabase, [
    { scope: 'checkout:user', kind: 'user', subject: null, limit: 12, windowSeconds: 600 },
    { scope: 'checkout:ip', kind: 'ip', subject: '203.0.113.41', limit: 30, windowSeconds: 600 },
    { scope: 'checkout:global', kind: 'global', subject: 'storefront', limit: 500, windowSeconds: 600 },
  ]);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 11);
  assert.deepEqual(calls, ['checkout:ip']);

  calls.length = 0;
  const allowedSupabase = {
    async rpc(_name, input) {
      calls.push(input.p_scope);
      return { data: [{ allowed: true, limit_value: 10, remaining: 9, retry_after_seconds: 0, reset_at: '2026-08-22T19:00:00Z', request_count: 1 }], error: null };
    },
  };
  const allowed = await consumeRateLimits(allowedSupabase, [
    { scope: 'x:user', kind: 'user', subject: 'user-1', limit: 10, windowSeconds: 60 },
    { scope: 'x:global', kind: 'global', subject: 'storefront', limit: 10, windowSeconds: 60 },
  ]);
  assert.equal(allowed.allowed, true);
  assert.deepEqual(calls, ['x:user', 'x:global']);
});

test('RPC failures become stable rate_limit_unavailable errors', async () => {
  const { consumeRateLimit } = await loadRateLimit();
  const supabase = { async rpc() { return { data: null, error: { message: 'database unavailable' } }; } };
  await assert.rejects(
    consumeRateLimit(supabase, { scope: 'shipping-quote:global', kind: 'global', subject: 'storefront', limit: 2, windowSeconds: 60 }),
    (error) => error?.code === 'rate_limit_unavailable' && error?.status === 503,
  );
});

test('429 responder sets integer Retry-After, no-store, and exposes no subject/hash internals', async () => {
  const { respondRateLimited } = await loadRateLimit();
  const res = createMockResponse();
  respondRateLimited(res, { allowed: false, retryAfterSeconds: 7.9, subjectHash: 'do-not-expose', scope: 'hidden:scope' });
  assert.equal(res.statusCode, 429);
  assert.equal(res.getHeader('retry-after'), '8');
  assert.equal(res.getHeader('cache-control'), 'no-store');
  assert.deepEqual(res.body, {
    error: 'rate_limited',
    message: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    retryAfterSeconds: 8,
  });
  assert.equal(JSON.stringify(res.body).includes('do-not-expose'), false);
  assert.equal(JSON.stringify(res.body).includes('hidden:scope'), false);
});

test('limiter-unavailable responder fails closed with stable 503 contract', async () => {
  const { respondRateLimitUnavailable } = await loadRateLimit();
  const res = createMockResponse();
  respondRateLimitUnavailable(res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.getHeader('cache-control'), 'no-store');
  assert.deepEqual(res.body, {
    error: 'rate_limit_unavailable',
    message: 'Não foi possível validar o limite de tentativas agora. Tente novamente em instantes.',
  });
});
