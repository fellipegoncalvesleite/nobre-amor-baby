import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

import adminHandler from '../api/admin.js';
import publicHandler from '../api/public.js';
import { createOrdersHandler } from '../api/orders.js';
import { createNewsletterHandler } from '../api/newsletter.js';
import { createShippingQuoteHandler } from '../api/shipping-quote.js';
import { createProfileAvatarHandler } from '../api/profile-avatar.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
const AUTH_HEADERS = ['Content-Type', 'Authorization'];

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    headers: new Map(),
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); },
    getHeader(name) { return this.headers.get(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
}

async function readText(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

function sameOriginHeaders(extra = {}) {
  return {
    host: 'shop.example.com',
    'x-forwarded-proto': 'https',
    origin: 'https://shop.example.com',
    ...extra,
  };
}

function hostileOriginHeaders(extra = {}) {
  return sameOriginHeaders({ origin: 'https://evil.example', ...extra });
}

function varyTokens(res) {
  return String(res.getHeader('Vary') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCsp(value) {
  const directives = new Map();
  for (const chunk of String(value || '').split(';')) {
    const tokens = chunk.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) directives.set(tokens[0], tokens.slice(1));
  }
  return directives;
}

function runThemeScript(source, { stored = null, prefersDark = false, storageThrows = false, mediaThrows = false } = {}) {
  const added = [];
  const meta = { content: '#F0DAE8' };
  const context = {
    localStorage: {
      getItem(key) {
        assert.equal(key, 'nobre_amor_v1_theme');
        if (storageThrows) throw new Error('storage disabled');
        return stored;
      },
    },
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme:dark)');
      if (mediaThrows) throw new Error('matchMedia unavailable');
      return { matches: prefersDark };
    },
    document: {
      documentElement: { classList: { add(value) { added.push(value); } } },
      querySelector(selector) {
        assert.equal(selector, 'meta[name="theme-color"]');
        return meta;
      },
    },
  };

  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  return { added, meta };
}

test('RED regression: untrusted browser Origin is rejected instead of receiving wildcard CORS', async () => {
  const res = createMockResponse();
  await adminHandler({
    method: 'GET',
    headers: hostileOriginHeaders(),
    query: { resource: 'products' },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: 'origin_not_allowed',
    message: 'Origem não autorizada.',
  });
  assert.equal(res.getHeader('Access-Control-Allow-Origin'), undefined);
});

test('origin normalization accepts canonical HTTP(S) origins and rejects non-origins', async () => {
  const { normalizeOrigin } = await import('../api/_httpSecurity.js');

  assert.equal(normalizeOrigin('https://shop.example.com'), 'https://shop.example.com');
  assert.equal(normalizeOrigin('HTTPS://SHOP.EXAMPLE.COM'), 'https://shop.example.com');
  assert.equal(normalizeOrigin('https://shop.example.com:443'), 'https://shop.example.com');
  assert.equal(normalizeOrigin('http://shop.example.com:80'), 'http://shop.example.com');
  assert.equal(normalizeOrigin('https://shop.example.com:8443'), 'https://shop.example.com:8443');
  assert.equal(normalizeOrigin('ftp://shop.example.com'), null);
  assert.equal(normalizeOrigin('javascript:alert(1)'), null);
  assert.equal(normalizeOrigin('not a url'), null);
  assert.equal(normalizeOrigin('null'), null);
  assert.equal(normalizeOrigin('https://user:pass@shop.example.com'), null);
  assert.equal(normalizeOrigin('https://shop.example.com/path'), null, 'request/configured origins must not contain paths');
});

test('allowed-origin sources use exact normalized Set membership', async () => {
  const { getAllowedOrigins } = await import('../api/_httpSecurity.js');
  const req = {
    headers: {
      host: 'SHOP.EXAMPLE.COM:443',
      'x-forwarded-proto': 'HTTPS',
    },
    socket: { encrypted: false },
  };
  const env = {
    SITE_URL: 'https://canonical.example.com/storefront/path',
    CORS_ALLOWED_ORIGINS: ' https://preview.example.com ,https://admin.example.com:443, *, malformed, https://bad.example.com/path ',
  };
  const allowed = getAllowedOrigins(req, env);

  assert.equal(allowed.has('https://shop.example.com'), true, 'current request same-origin');
  assert.equal(allowed.has('https://canonical.example.com'), true, 'SITE_URL canonical origin');
  assert.equal(allowed.has('https://preview.example.com'), true, 'first configured exact origin');
  assert.equal(allowed.has('https://admin.example.com'), true, 'second configured exact origin with normalized default port');
  assert.equal(allowed.has('*'), false, 'configured wildcard must never become trusted');
  assert.equal(allowed.has('https://bad.example.com'), false, 'configured path must not silently become an origin');
  assert.equal(allowed.has('malformed'), false);
});

test('origin authorization rejects suffix, prefix, scheme, port, null, malformed, and wildcard attacks', async () => {
  const { applyApiCors } = await import('../api/_httpSecurity.js');
  const deniedOrigins = [
    'https://shop.example.com.evil.test',
    'https://evil-shop.example.com',
    'http://shop.example.com',
    'https://shop.example.com:8443',
    'null',
    'not a url',
  ];

  for (const origin of deniedOrigins) {
    const res = createMockResponse();
    const handled = applyApiCors({
      method: 'GET',
      headers: {
        host: 'shop.example.com',
        'x-forwarded-proto': 'https',
        origin,
      },
    }, res, {
      methods: ['GET', 'OPTIONS'],
      allowedHeaders: AUTH_HEADERS,
      env: { CORS_ALLOWED_ORIGINS: '*' },
    });

    assert.equal(handled, true, origin);
    assert.equal(res.statusCode, 403, origin);
    assert.equal(res.body?.error, 'origin_not_allowed', origin);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), undefined, origin);
  }
});

test('SITE_URL and exact additional origins are allowed while missing Origin proceeds without ACAO', async () => {
  const { applyApiCors } = await import('../api/_httpSecurity.js');
  const env = {
    SITE_URL: 'https://canonical.example.com/app',
    CORS_ALLOWED_ORIGINS: ' https://preview.example.com, https://admin.example.com ',
  };

  for (const origin of ['https://canonical.example.com', 'https://preview.example.com', 'https://admin.example.com']) {
    const res = createMockResponse();
    const handled = applyApiCors({
      method: 'GET',
      headers: { host: 'different.example.com', 'x-forwarded-proto': 'https', origin },
    }, res, { methods: ['GET', 'OPTIONS'], allowedHeaders: AUTH_HEADERS, env });
    assert.equal(handled, false, origin);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), origin, origin);
  }

  const noOrigin = createMockResponse();
  const handled = applyApiCors({ method: 'GET', headers: {} }, noOrigin, {
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: AUTH_HEADERS,
    env,
  });
  assert.equal(handled, false);
  assert.equal(noOrigin.getHeader('Access-Control-Allow-Origin'), undefined);
});

test('Vary preserves existing values, deduplicates Origin, and preflight adds request dimensions', async () => {
  const { applyApiCors } = await import('../api/_httpSecurity.js');
  const res = createMockResponse();
  res.setHeader('Vary', 'Accept-Encoding');
  const req = { method: 'GET', headers: sameOriginHeaders() };

  assert.equal(applyApiCors(req, res, { methods: ['GET', 'OPTIONS'], allowedHeaders: AUTH_HEADERS, env: {} }), false);
  assert.equal(applyApiCors(req, res, { methods: ['GET', 'OPTIONS'], allowedHeaders: AUTH_HEADERS, env: {} }), false);
  assert.deepEqual(varyTokens(res).sort(), ['Accept-Encoding', 'Origin'].sort());
  assert.equal(varyTokens(res).filter((value) => value.toLowerCase() === 'origin').length, 1);

  const preflight = createMockResponse();
  applyApiCors({
    method: 'OPTIONS',
    headers: sameOriginHeaders({
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'Authorization',
    }),
  }, preflight, { methods: ['GET', 'OPTIONS'], allowedHeaders: AUTH_HEADERS, env: {} });
  assert.deepEqual(varyTokens(preflight).map((value) => value.toLowerCase()).sort(), [
    'origin',
    'access-control-request-method',
    'access-control-request-headers',
  ].sort());
});

test('valid preflight returns exact CORS policy and accepts request-header case differences', async () => {
  const { applyApiCors } = await import('../api/_httpSecurity.js');
  const res = createMockResponse();
  const handled = applyApiCors({
    method: 'OPTIONS',
    headers: sameOriginHeaders({
      'access-control-request-method': 'patch',
      'access-control-request-headers': 'authorization, CONTENT-TYPE',
    }),
  }, res, { methods: ADMIN_METHODS, allowedHeaders: AUTH_HEADERS, env: {} });

  assert.equal(handled, true);
  assert.equal(res.statusCode, 204);
  assert.equal(res.body, undefined);
  assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://shop.example.com');
  assert.equal(res.getHeader('Access-Control-Allow-Methods'), 'GET, POST, PATCH, DELETE, OPTIONS');
  assert.equal(res.getHeader('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
  assert.equal(res.getHeader('Access-Control-Max-Age'), '600');
});

test('preflight denies unsupported method/header and admin x-admin-key without entering route logic', async () => {
  const { applyApiCors } = await import('../api/_httpSecurity.js');

  for (const headers of [
    sameOriginHeaders({ 'access-control-request-method': 'PUT' }),
    sameOriginHeaders({
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type, X-Unsupported',
    }),
    sameOriginHeaders({
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'x-admin-key',
    }),
  ]) {
    const res = createMockResponse();
    const handled = applyApiCors({ method: 'OPTIONS', headers }, res, {
      methods: ADMIN_METHODS,
      allowedHeaders: AUTH_HEADERS,
      env: {},
    });
    assert.equal(handled, true);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      error: 'cors_preflight_denied',
      message: 'Preflight CORS não autorizado.',
    });
  }

  const untrusted = createMockResponse();
  applyApiCors({
    method: 'OPTIONS',
    headers: hostileOriginHeaders({ 'access-control-request-method': 'POST' }),
  }, untrusted, { methods: ADMIN_METHODS, allowedHeaders: AUTH_HEADERS, env: {} });
  assert.equal(untrusted.statusCode, 403);
  assert.equal(untrusted.body?.error, 'origin_not_allowed');
  assert.equal(untrusted.getHeader('Access-Control-Allow-Origin'), undefined);
});

test('allowed-origin OPTIONS without Access-Control-Request-Method remains harmless 204', async () => {
  const { applyApiCors } = await import('../api/_httpSecurity.js');
  const res = createMockResponse();
  const handled = applyApiCors({ method: 'OPTIONS', headers: sameOriginHeaders() }, res, {
    methods: ADMIN_METHODS,
    allowedHeaders: AUTH_HEADERS,
    env: {},
  });
  assert.equal(handled, true);
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://shop.example.com');
});

test('admin CORS runs before manager auth and enforces the declared preflight surface', async () => {
  const hostile = createMockResponse();
  await adminHandler({ method: 'GET', headers: hostileOriginHeaders(), query: { resource: 'products' } }, hostile);
  assert.equal(hostile.statusCode, 403);
  assert.equal(hostile.body?.error, 'origin_not_allowed');

  const allowed = createMockResponse();
  await adminHandler({ method: 'GET', headers: sameOriginHeaders(), query: { resource: 'products' } }, allowed);
  assert.equal(allowed.statusCode, 401, 'allowed origin must resume existing auth behavior');

  const preflight = createMockResponse();
  await adminHandler({
    method: 'OPTIONS',
    headers: sameOriginHeaders({
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'Authorization, Content-Type',
    }),
    query: {},
  }, preflight);
  assert.equal(preflight.statusCode, 204);

  const legacyKey = createMockResponse();
  await adminHandler({
    method: 'OPTIONS',
    headers: sameOriginHeaders({
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'x-admin-key',
    }),
    query: {},
  }, legacyKey);
  assert.equal(legacyKey.statusCode, 403);
  assert.equal(legacyKey.body?.error, 'cors_preflight_denied');
});

test('checkout rejects hostile Origin before auth, limiter, idempotency, inventory, shipping, or Asaas work', async () => {
  const calls = [];
  const handler = createOrdersHandler({
    verifyUser: async () => { calls.push('verifyUser'); return { user: null }; },
    getSupabase: () => { calls.push('getSupabase'); return {}; },
    consumeRateLimits: async () => { calls.push('limiter'); return { allowed: true }; },
    findIdempotentOrder: async () => { calls.push('idempotency'); return { data: null, error: null }; },
    reserveOrderInventory: async () => { calls.push('inventory'); },
    resolveCatalogItems: async () => { calls.push('catalog'); },
    calculateAuthoritativeShipping: async () => { calls.push('shipping'); },
    createAsaasOrderPayment: async () => { calls.push('asaas'); },
    recoverAsaasOrderPayment: async () => { calls.push('asaas-recovery'); },
  });
  const res = createMockResponse();
  await handler({ method: 'POST', headers: hostileOriginHeaders(), body: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(calls, []);
});

test('shipping, newsletter, and profile-avatar reject hostile Origin before dependencies', async () => {
  const shippingCalls = [];
  const shipping = createShippingQuoteHandler({
    getSupabase: () => { shippingCalls.push('getSupabase'); return {}; },
    consumeRateLimits: async () => { shippingCalls.push('limiter'); return { allowed: true }; },
    resolveCatalogItems: async () => { shippingCalls.push('catalog'); return { resolvedItems: [] }; },
    calculateAuthoritativeShipping: async () => { shippingCalls.push('provider'); return {}; },
  });
  const shippingRes = createMockResponse();
  await shipping({ method: 'POST', headers: hostileOriginHeaders(), body: {} }, shippingRes);
  assert.equal(shippingRes.statusCode, 403);
  assert.deepEqual(shippingCalls, []);

  const newsletterCalls = [];
  const newsletter = createNewsletterHandler({
    getSupabase: () => { newsletterCalls.push('getSupabase'); return {}; },
    consumeRateLimits: async () => { newsletterCalls.push('limiter'); return { allowed: true }; },
  });
  const newsletterRes = createMockResponse();
  await newsletter({ method: 'POST', headers: hostileOriginHeaders(), body: { email: 'test@example.com' } }, newsletterRes);
  assert.equal(newsletterRes.statusCode, 403);
  assert.deepEqual(newsletterCalls, []);

  const avatarCalls = [];
  const avatar = createProfileAvatarHandler({
    verifyUser: async () => { avatarCalls.push('verifyUser'); return { user: null }; },
    getSupabase: () => { avatarCalls.push('getSupabase'); return {}; },
    consumeRateLimits: async () => { avatarCalls.push('limiter'); return { allowed: true }; },
    ensureBucket: async () => { avatarCalls.push('storage'); },
  });
  const avatarRes = createMockResponse();
  await avatar({ method: 'POST', headers: hostileOriginHeaders(), body: {} }, avatarRes);
  assert.equal(avatarRes.statusCode, 403);
  assert.deepEqual(avatarCalls, []);
});

test('shipping preflight allows Content-Type and Authorization only for an allowed Origin', async () => {
  const shipping = createShippingQuoteHandler();
  const allowed = createMockResponse();
  await shipping({
    method: 'OPTIONS',
    headers: sameOriginHeaders({
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type, Authorization',
    }),
    query: {},
  }, allowed);
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.getHeader('Access-Control-Allow-Headers'), 'Content-Type, Authorization');

  const hostile = createMockResponse();
  await shipping({
    method: 'OPTIONS',
    headers: hostileOriginHeaders({
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type, Authorization',
    }),
    query: {},
  }, hostile);
  assert.equal(hostile.statusCode, 403);
  assert.equal(hostile.body?.error, 'origin_not_allowed');
});

test('public route rejects hostile Origin before Supabase/business routing', async () => {
  const res = createMockResponse();
  await publicHandler({
    method: 'POST',
    headers: hostileOriginHeaders(),
    query: { resource: 'cancel-order' },
    body: {},
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'origin_not_allowed');
});

test('missing Origin preserves normal route behavior and does not emit ACAO', async () => {
  const checkoutCalls = [];
  const checkout = createOrdersHandler({
    verifyUser: async () => { checkoutCalls.push('verifyUser'); return { user: null }; },
  });
  const checkoutRes = createMockResponse();
  await checkout({ method: 'POST', headers: {}, body: {} }, checkoutRes);
  assert.equal(checkoutRes.statusCode, 401);
  assert.deepEqual(checkoutCalls, ['verifyUser']);
  assert.equal(checkoutRes.getHeader('Access-Control-Allow-Origin'), undefined);

  const avatarCalls = [];
  const avatar = createProfileAvatarHandler({
    verifyUser: async () => { avatarCalls.push('verifyUser'); return { user: null }; },
  });
  const avatarRes = createMockResponse();
  await avatar({ method: 'POST', headers: {}, body: {} }, avatarRes);
  assert.equal(avatarRes.statusCode, 401);
  assert.deepEqual(avatarCalls, ['verifyUser']);
  assert.equal(avatarRes.getHeader('Access-Control-Allow-Origin'), undefined);
});

test('vercel.json preserves rewrites and defines the exact global browser security posture', async () => {
  const config = JSON.parse(await readText('vercel.json'));
  assert.deepEqual(config.rewrites, [
    { source: '/robots.txt', destination: '/api/robots' },
    { source: '/sitemap.xml', destination: '/api/sitemap' },
    { source: '/api/(.*)', destination: '/api/$1' },
    { source: '/(.*)', destination: '/index.html' },
  ]);

  const globalRule = config.headers?.find((entry) => entry.source === '/(.*)');
  assert.ok(globalRule, 'missing global /(.*) headers rule');
  const headers = new Map(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));

  assert.equal(headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');

  const permissions = headers.get('permissions-policy') || '';
  for (const directive of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()']) {
    assert.match(permissions, new RegExp(`(?:^|,\\s*)${directive.replace(/[()]/g, '\\$&')}(?:,|$)`));
  }

  assert.equal(headers.has('content-security-policy-report-only'), false);
  const cspValue = headers.get('content-security-policy');
  assert.ok(cspValue, 'enforce-mode CSP is required');
  assert.equal(cspValue.includes("'unsafe-eval'"), false);

  const csp = parseCsp(cspValue);
  assert.deepEqual(csp.get('default-src'), ["'self'"]);
  assert.deepEqual(csp.get('base-uri'), ["'self'"]);
  assert.deepEqual(csp.get('object-src'), ["'none'"]);
  assert.deepEqual(csp.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(csp.get('form-action'), ["'self'"]);
  assert.deepEqual(csp.get('script-src'), ["'self'"]);
  assert.equal(csp.get('script-src').includes("'unsafe-inline'"), false);
  assert.deepEqual(csp.get('style-src'), ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
  assert.deepEqual(csp.get('font-src'), ["'self'", 'https://fonts.gstatic.com', 'data:']);
  assert.deepEqual(csp.get('img-src'), ["'self'", 'data:', 'blob:', 'https:']);
  assert.deepEqual(csp.get('connect-src'), ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://viacep.com.br']);
  assert.equal(csp.get('connect-src').includes('https:'), false);
  assert.equal(cspValue.includes('asaas.com'), false);
  assert.equal(cspValue.includes('melhorenvio.com.br'), false);
  assert.deepEqual(csp.get('worker-src'), ["'self'", 'blob:']);
  assert.deepEqual(csp.get('manifest-src'), ["'self'"]);
  assert.deepEqual(csp.get('media-src'), ["'self'", 'blob:', 'https:']);
  assert.deepEqual(csp.get('upgrade-insecure-requests'), []);
});

test('theme bootstrap is external, blocking in head, and module entry remains intact', async () => {
  const html = await readText('index.html');
  const themeTag = '<script src="/theme-init.js"></script>';
  const tagIndex = html.indexOf(themeTag);
  const headEnd = html.indexOf('</head>');
  assert.notEqual(tagIndex, -1, 'missing /theme-init.js');
  assert.ok(tagIndex < headEnd, 'theme bootstrap must remain in head');
  assert.equal(/<script[^>]+src=["']\/theme-init\.js["'][^>]+(?:defer|async)/i.test(html), false);

  const inlineExecutableScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]) && match[2].trim().length > 0);
  assert.equal(inlineExecutableScripts.length, 0, 'executable inline script remains');
  assert.match(html, /<script\s+type=["']module["']\s+src=["']\/src\/main\.jsx["']><\/script>/i);
});

test('external theme bootstrap preserves stored/system dark behavior and safely swallows errors', async () => {
  const source = await readText('public/theme-init.js');
  assert.match(source, /nobre_amor_v1_theme/);
  assert.match(source, /#1C1720/);

  const storedDark = runThemeScript(source, { stored: 'dark', prefersDark: false });
  assert.deepEqual(storedDark.added, ['dark']);
  assert.equal(storedDark.meta.content, '#1C1720');

  const systemDark = runThemeScript(source, { stored: null, prefersDark: true });
  assert.deepEqual(systemDark.added, ['dark']);
  assert.equal(systemDark.meta.content, '#1C1720');

  const explicitLight = runThemeScript(source, { stored: 'light', prefersDark: true });
  assert.deepEqual(explicitLight.added, []);
  assert.equal(explicitLight.meta.content, '#F0DAE8');

  const storageFailure = runThemeScript(source, { storageThrows: true });
  assert.deepEqual(storageFailure.added, []);

  const mediaFailure = runThemeScript(source, { stored: null, mediaThrows: true });
  assert.deepEqual(mediaFailure.added, []);
});
