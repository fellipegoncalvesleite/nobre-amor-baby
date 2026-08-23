import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createShippingQuoteHandler } from '../api/shipping-quote.js';
import { calculateShipping, quoteShippingFromApi } from '../src/utils/shipping.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_KEYS = [
  'nobre_amor_auth_debug',
  'nobre_amor_callback_debug',
  'nobre_amor_auth_requests',
];

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

function sameOriginHeaders(extra = {}) {
  return {
    host: 'shop.example.com',
    'x-forwarded-proto': 'https',
    origin: 'https://shop.example.com',
    ...extra,
  };
}

function allowed() {
  return { allowed: true, remaining: 1 };
}

function sampleQuote() {
  return {
    feeCents: 2590,
    etaText: '3 dias úteis',
    source: 'melhor_envio',
    rawFeeCents: 2090,
    surcharge: 500,
    pkg: { weightKg: 0.7, lengthCm: 20, widthCm: 15, heightCm: 8 },
    destination: { cep: '01001000', city: 'São Paulo', uf: 'SP' },
    carrierName: 'Carrier Test',
    carrierId: 'carrier-1',
  };
}

function shippingHarness(authResult = { user: null, profile: null }) {
  const calls = [];
  const handler = createShippingQuoteHandler({
    verifyUser: async () => { calls.push('auth'); return authResult; },
    getSupabase: () => { calls.push('getSupabase'); return {}; },
    consumeRateLimits: async () => { calls.push('limiter'); return allowed(); },
    resolveCatalogItems: async () => { calls.push('catalog'); return { resolvedItems: [{ productId: 'p1' }] }; },
    calculateAuthoritativeShipping: async () => { calls.push('provider'); return sampleQuote(); },
  });
  return { handler, calls };
}

async function invokeShipping({ query = {}, headers = {}, authResult } = {}) {
  const { handler, calls } = shippingHarness(authResult);
  const res = createMockResponse();
  await handler({
    method: 'POST',
    headers,
    query,
    body: { toCep: '01001000', items: [{ productId: 'p1', qty: 1 }] },
  }, res);
  return { res, calls };
}

async function loadAuthDiagnostics() {
  try {
    return await import('../src/lib/authDiagnostics.js');
  } catch (error) {
    assert.fail(`auth diagnostics module unavailable: ${error.code || error.message}`);
  }
}

class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

function readJson(storage, key) {
  const value = storage.getItem(key);
  return value == null ? null : JSON.parse(value);
}

function installFetchMock(responseBody = { feeCents: 1200, etaText: '2 dias', source: 'server' }) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify(responseBody); },
    };
  };
  return {
    calls,
    restore() { globalThis.fetch = originalFetch; },
  };
}

test('RED regression: unauthenticated exact shipping debug is 401 before limiter/catalog/provider work', async () => {
  const { res, calls } = await invokeShipping({ query: { debug: '1' } });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    error: 'unauthorized',
    message: 'Token inválido ou ausente.',
  });
  assert.equal(calls.filter((call) => call === 'limiter').length, 0);
  assert.equal(calls.filter((call) => call === 'catalog').length, 0);
  assert.equal(calls.filter((call) => call === 'provider').length, 0);
});

test('RED regression: authenticated customer cannot request shipping debug', async () => {
  const { res, calls } = await invokeShipping({
    query: { debug: '1' },
    headers: { authorization: 'Bearer customer-token' },
    authResult: { user: { id: 'customer-1' }, profile: { id: 'customer-1', role: 'customer' } },
  });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: 'forbidden',
    message: 'Acesso restrito a ferramentas de depuração.',
  });
  assert.equal(calls.includes('limiter'), false);
  assert.equal(calls.includes('catalog'), false);
  assert.equal(calls.includes('provider'), false);
});

test('invalid auth on exact shipping debug returns 401 before shipping work', async () => {
  const { res, calls } = await invokeShipping({
    query: { debug: '1' },
    headers: { authorization: 'Bearer invalid-token' },
    authResult: { user: null, profile: null },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
  assert.equal(calls.includes('limiter'), false);
  assert.equal(calls.includes('catalog'), false);
  assert.equal(calls.includes('provider'), false);
});

test('manager is not authorized for exact shipping debug', async () => {
  const { res, calls } = await invokeShipping({
    query: { debug: '1' },
    headers: { authorization: 'Bearer manager-token' },
    authResult: { user: { id: 'manager-1' }, profile: { id: 'manager-1', role: 'manager' } },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'forbidden');
  assert.equal(calls.includes('limiter'), false);
});

test('debug-role user receives the existing shipping debug structure and remains rate limited', async () => {
  const { res, calls } = await invokeShipping({
    query: { debug: '1' },
    headers: { authorization: 'Bearer debug-token' },
    authResult: { user: { id: 'debug-1' }, profile: { id: 'debug-1', role: 'debug' } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.debug, {
    rawFeeCents: 2090,
    surcharge: 500,
    package: { weightKg: 0.7, lengthCm: 20, widthCm: 15, heightCm: 8 },
    destination: { cep: '01001000', city: 'São Paulo', uf: 'SP' },
    carrierName: 'Carrier Test',
    carrierId: 'carrier-1',
  });
  assert.deepEqual(calls, ['auth', 'getSupabase', 'limiter', 'catalog', 'provider']);
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes('debug-1'), false);
  assert.equal(serialized.includes('role'), false);
});

test('normal and non-exact debug query values remain public and never include debug output', async () => {
  for (const query of [{}, { debug: '0' }, { debug: 'true' }, { debug: 'yes' }, { debug: '' }, { debug: 'arbitrary' }]) {
    const { res, calls } = await invokeShipping({ query });
    assert.equal(res.statusCode, 200, JSON.stringify(query));
    assert.equal(Object.hasOwn(res.body, 'debug'), false, JSON.stringify(query));
    assert.equal(calls.includes('auth'), false, JSON.stringify(query));
    assert.deepEqual(calls, ['getSupabase', 'limiter', 'catalog', 'provider'], JSON.stringify(query));
  }
});

test('hostile Origin rejects exact shipping debug before authentication or shipping work', async () => {
  const { res, calls } = await invokeShipping({
    query: { debug: '1' },
    headers: {
      host: 'shop.example.com',
      'x-forwarded-proto': 'https',
      origin: 'https://evil.example',
      authorization: 'Bearer debug-token',
    },
    authResult: { user: { id: 'debug-1' }, profile: { role: 'debug' } },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'origin_not_allowed');
  assert.deepEqual(calls, []);
});

test('shipping debug CORS preflight allows Authorization only for an allowed Origin', async () => {
  const { handler } = shippingHarness();
  const allowedRes = createMockResponse();
  await handler({
    method: 'OPTIONS',
    headers: sameOriginHeaders({
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type, Authorization',
    }),
    query: {},
  }, allowedRes);
  assert.equal(allowedRes.statusCode, 204);
  assert.equal(allowedRes.getHeader('Access-Control-Allow-Headers'), 'Content-Type, Authorization');

  const hostileRes = createMockResponse();
  await handler({
    method: 'OPTIONS',
    headers: {
      host: 'shop.example.com',
      'x-forwarded-proto': 'https',
      origin: 'https://evil.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type, Authorization',
    },
    query: {},
  }, hostileRes);
  assert.equal(hostileRes.statusCode, 403);
  assert.equal(hostileRes.body?.error, 'origin_not_allowed');
});

test('shipping browser client omits Authorization when debug is false', async () => {
  const mock = installFetchMock();
  try {
    await quoteShippingFromApi({ toCep: '01001000', items: [], debug: false, accessToken: 'must-not-send' });
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, '/api/shipping-quote');
    assert.equal(mock.calls[0].options.headers.Authorization, undefined);
  } finally {
    mock.restore();
  }
});

test('shipping browser client sends debug token only in Authorization header', async () => {
  const mock = installFetchMock({ feeCents: 1200, etaText: '2 dias', source: 'server', debug: { rawFeeCents: 1000 } });
  try {
    await quoteShippingFromApi({ toCep: '01001000', items: [{ id: 'p1', qty: 1 }], debug: true, accessToken: 'debug-token' });
    assert.equal(mock.calls.length, 1);
    const call = mock.calls[0];
    assert.equal(call.url, '/api/shipping-quote?debug=1');
    assert.equal(call.options.headers.Authorization, 'Bearer debug-token');
    assert.equal(String(call.url).includes('debug-token'), false);
    assert.equal(String(call.options.body).includes('debug-token'), false);
  } finally {
    mock.restore();
  }
});

test('calculateShipping forwards debug access token to the API client path', async () => {
  const mock = installFetchMock({ feeCents: 1200, etaText: '2 dias', source: 'server', debug: { rawFeeCents: 1000 } });
  try {
    await calculateShipping({ cep: '01001000', cart: [], debug: true, accessToken: 'debug-token' });
    assert.equal(mock.calls[0].options.headers.Authorization, 'Bearer debug-token');
  } finally {
    mock.restore();
  }
});

test('RED regression: callback diagnostics never persist raw auth secret values', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const storage = new MemoryStorage();
  diagnostics.recordAuthCallback({
    parameterNames: ['code', 'token_hash', 'type', 'error_description'],
    hasHash: true,
    hasCode: true,
    hasTokenHash: true,
    flowType: 'signup',
    returnPath: '/checkout',
    code: 'super-secret-oauth-code',
    tokenHash: 'super-secret-token-hash',
    hash: '#access_token=super-secret-access',
    errorDescription: 'super-secret-error-description',
    accessToken: 'super-secret-access',
  }, { enabled: true, storage, now: () => '2026-08-22T21:00:00.000Z' });
  const serialized = storage.getItem('nobre_amor_callback_debug') || '';
  for (const secret of [
    'super-secret-oauth-code',
    'super-secret-token-hash',
    'super-secret-access',
    'super-secret-error-description',
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  const saved = JSON.parse(serialized);
  assert.deepEqual(saved.parameterNames, ['code', 'token_hash', 'type', 'error_description']);
  assert.equal(saved.hasHash, true);
  assert.equal(saved.hasCode, true);
  assert.equal(saved.hasTokenHash, true);
  assert.equal(saved.flowType, 'signup');
  assert.equal(saved.returnPath, '/checkout');
});

test('RED regression: disabled production diagnostics clear legacy keys and perform no writes', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const storage = new MemoryStorage(Object.fromEntries(AUTH_KEYS.map((key) => [key, '["legacy-secret"]'])));
  diagnostics.clearAuthDiagnostics(storage);
  for (const key of AUTH_KEYS) assert.equal(storage.getItem(key), null, key);

  diagnostics.recordAuthEvent({ event: 'SIGNED_IN', hasSession: true, userId: 'user-secret', email: 'buyer@example.com' }, { enabled: false, storage });
  diagnostics.recordAuthRequest({ method: 'signInWithPassword', outcome: 'ok', email: 'buyer@example.com' }, { enabled: false, storage });
  diagnostics.recordAuthCallback({ parameterNames: ['code'], hasCode: true, code: 'secret-code' }, { enabled: false, storage });
  for (const key of AUTH_KEYS) assert.equal(storage.getItem(key), null, key);
});

test('auth diagnostics swallow storage failures', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const throwing = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
    removeItem() { throw new Error('storage disabled'); },
  };
  assert.doesNotThrow(() => diagnostics.clearAuthDiagnostics(throwing));
  assert.doesNotThrow(() => diagnostics.recordAuthEvent({ event: 'SIGNED_IN', hasSession: true }, { enabled: true, storage: throwing }));
  assert.doesNotThrow(() => diagnostics.recordAuthRequest({ method: 'signInWithPassword', outcome: 'ok' }, { enabled: true, storage: throwing }));
  assert.doesNotThrow(() => diagnostics.recordAuthCallback({ parameterNames: ['code'], hasCode: true }, { enabled: true, storage: throwing }));
});

test('auth event diagnostics persist only event/timestamp/hasSession and stay bounded', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const storage = new MemoryStorage();
  for (let i = 0; i < 25; i += 1) {
    diagnostics.recordAuthEvent({
      event: `EVENT_${i}`,
      hasSession: true,
      userId: `user-${i}`,
      email: `buyer${i}@example.com`,
      accessToken: `jwt-${i}`,
      session: { access_token: `session-token-${i}` },
    }, { enabled: true, storage, now: () => `2026-08-22T21:00:${String(i).padStart(2, '0')}.000Z` });
  }
  const logs = readJson(storage, 'nobre_amor_auth_debug');
  assert.equal(logs.length, 20);
  assert.deepEqual(Object.keys(logs.at(-1)).sort(), ['event', 'hasSession', 'timestamp'].sort());
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes('user-24'), false);
  assert.equal(serialized.includes('buyer24@example.com'), false);
  assert.equal(serialized.includes('session-token-24'), false);
});

test('auth request diagnostics store bounded method/outcome metadata without email or arbitrary errors', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const storage = new MemoryStorage({ nobre_amor_auth_requests: '{malformed json' });
  assert.doesNotThrow(() => diagnostics.recordAuthRequest({
    method: 'signInWithPassword',
    outcome: 'error',
    type: 'password',
    provider: null,
    status: 400,
    errorName: 'AuthApiError',
    email: 'buyer@example.com',
    password: 'secret-password',
    token: 'eyJhbGciOiJIUzI1NiJ9.secret.signature',
    message: 'buyer@example.com secret-token',
  }, { enabled: true, storage, now: () => '2026-08-22T21:00:00.000Z' }));
  const logs = readJson(storage, 'nobre_amor_auth_requests');
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], {
    method: 'signInWithPassword',
    outcome: 'error',
    type: 'password',
    provider: null,
    status: 400,
    errorName: 'AuthApiError',
    timestamp: '2026-08-22T21:00:00.000Z',
  });
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes('buyer@example.com'), false);
  assert.equal(serialized.includes('secret-password'), false);
  assert.equal(serialized.includes('eyJhbGciOiJIUzI1NiJ9'), false);
});

test('signup diagnostics do not persist email and request log remains bounded to 40 entries', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const storage = new MemoryStorage();
  for (let i = 0; i < 45; i += 1) {
    diagnostics.recordAuthRequest({
      method: 'signUp',
      outcome: 'request',
      type: 'password',
      email: `signup${i}@example.com`,
    }, { enabled: true, storage, now: () => `2026-08-22T21:01:${String(i % 60).padStart(2, '0')}.000Z` });
  }
  const logs = readJson(storage, 'nobre_amor_auth_requests');
  assert.equal(logs.length, 40);
  assert.equal(JSON.stringify(logs).includes('@example.com'), false);
});

test('callback diagnostics never persist raw values, hashes, JWT-shaped material, or arbitrary objects', async () => {
  const diagnostics = await loadAuthDiagnostics();
  const storage = new MemoryStorage();
  diagnostics.recordAuthCallback({
    parameterNames: ['code', 'type'],
    hasHash: true,
    hasCode: true,
    hasTokenHash: false,
    flowType: 'recovery',
    returnPath: '/conta',
    code: 'super-secret-oauth-code',
    hash: '#access_token=super-secret-access',
    tokenHash: 'super-secret-token-hash',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
    searchParams: { code: 'super-secret-oauth-code' },
  }, { enabled: true, storage, now: () => '2026-08-22T21:02:00.000Z' });
  const serialized = storage.getItem('nobre_amor_callback_debug') || '';
  for (const secret of ['super-secret-oauth-code', 'super-secret-token-hash', 'super-secret-access', 'eyJhbGciOiJIUzI1NiJ9']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(serialized.includes('searchParams'), false);
  assert.equal(serialized.includes('#access_token'), false);
});

test('auth source integration centralizes diagnostic writes and keeps raw callback values out of diagnostics', async () => {
  const authContext = await readFile(resolve(ROOT, 'src/context/AuthContext.jsx'), 'utf8');
  const callback = await readFile(resolve(ROOT, 'src/pages/AuthCallbackPage.jsx'), 'utf8');
  const login = await readFile(resolve(ROOT, 'src/pages/LoginPage.jsx'), 'utf8');

  for (const source of [authContext, callback, login]) {
    for (const key of AUTH_KEYS) {
      assert.equal(source.includes(`sessionStorage.setItem('${key}'`), false, key);
    }
    assert.match(source, /authDiagnostics|recordAuth|clearAuthDiagnostics/);
  }

  assert.equal(callback.includes('Object.fromEntries(searchParams.entries())'), false);
  assert.equal(callback.includes('window.location.hash.substring'), false);
  assert.equal(/logAuthRequest\([^\n]+email\.trim\(\)/.test(login), false);
});

test('DebugPage forwards accessToken on every shipping invocation that requests debug output', async () => {
  const source = await readFile(resolve(ROOT, 'src/pages/DebugPage.jsx'), 'utf8');
  const matches = [...source.matchAll(/debug:\s*true/g)];
  assert.ok(matches.length > 0, 'DebugPage should retain shipping debug tooling');
  for (const match of matches) {
    const nearby = source.slice(match.index, match.index + 120);
    assert.match(nearby, /accessToken/, `missing accessToken near debug call at index ${match.index}`);
  }
});
