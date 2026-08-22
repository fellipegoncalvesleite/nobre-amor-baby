import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import adminHandler from '../api/admin.js';

const USERS = {
  manager: {
    id: '10000000-0000-0000-0000-000000000001',
    email: 'manager@example.com',
    user_metadata: {},
    role: 'manager',
  },
  debug: {
    id: '10000000-0000-0000-0000-000000000002',
    email: 'debug@example.com',
    user_metadata: {},
    role: 'debug',
  },
  customer: {
    id: '10000000-0000-0000-0000-000000000003',
    email: 'customer@example.com',
    user_metadata: {},
    role: 'customer',
  },
  missing: {
    id: '10000000-0000-0000-0000-000000000004',
    email: 'missing@example.com',
    user_metadata: {},
    role: null,
  },
  spoofed: {
    id: '10000000-0000-0000-0000-000000000005',
    email: 'spoofed@example.com',
    user_metadata: { role: 'manager' },
    role: 'customer',
  },
  historical: {
    id: '10000000-0000-0000-0000-000000000006',
    email: 'nobreamorbaby@gmail.com',
    user_metadata: {},
    role: 'customer',
  },
};

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function createHarness(t) {
  const requests = [];
  let productMutationCount = 0;

  const server = http.createServer(async (req, res) => {
    let rawBody = '';
    for await (const chunk of req) rawBody += chunk;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: rawBody });

    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/auth/v1/user' && req.method === 'GET') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const fixture = USERS[token];
      if (!fixture) {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: 'invalid token' }));
        return;
      }
      res.end(JSON.stringify({
        id: fixture.id,
        email: fixture.email,
        user_metadata: fixture.user_metadata,
      }));
      return;
    }

    if (req.url.startsWith('/rest/v1/profiles') && req.method === 'GET') {
      const idMatch = req.url.match(/id=eq\.([^&]+)/);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : '';
      const fixture = Object.values(USERS).find((candidate) => candidate.id === id);
      if (!fixture || fixture.role == null) {
        res.statusCode = 406;
        res.end(JSON.stringify({ code: 'PGRST116', details: '0 rows' }));
        return;
      }
      res.end(JSON.stringify({ id: fixture.id, email: fixture.email, role: fixture.role }));
      return;
    }

    if (req.url.startsWith('/rest/v1/products') && req.method === 'GET') {
      res.end(JSON.stringify([]));
      return;
    }

    if (req.url.startsWith('/rest/v1/products') && req.method === 'POST') {
      productMutationCount += 1;
      const body = rawBody ? JSON.parse(rawBody) : {};
      res.statusCode = 201;
      res.end(JSON.stringify({ ...body, id: '20000000-0000-0000-0000-000000000001' }));
      return;
    }

    if (req.url.startsWith('/rest/v1/payment_resolution_actions') && req.method === 'GET') {
      res.end(JSON.stringify([]));
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

  return {
    requests,
    get productMutationCount() { return productMutationCount; },
  };
}

async function invoke({ method = 'GET', headers = {}, query = { resource: 'products' }, body = undefined } = {}) {
  const res = createMockResponse();
  await adminHandler({ method, headers, query, body }, res);
  return res;
}

test('no auth is rejected before admin business queries', async (t) => {
  const harness = await createHarness(t);
  const res = await invoke();
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
  assert.equal(harness.requests.some((request) => request.url.startsWith('/rest/v1/products')), false);
});

test('legacy x-admin-key is rejected even when ADMIN_API_KEY matches', async (t) => {
  const harness = await createHarness(t);
  const res = await invoke({ headers: { 'x-admin-key': 'test-admin-key' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
  assert.equal(harness.requests.some((request) => request.url.startsWith('/rest/v1/products')), false);
});

test('wrong legacy x-admin-key behaves like no credential', async (t) => {
  const harness = await createHarness(t);
  const res = await invoke({ headers: { 'x-admin-key': 'wrong' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
  assert.equal(harness.requests.some((request) => request.url.startsWith('/rest/v1/products')), false);
});

test('invalid bearer token is unauthorized', async (t) => {
  await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer invalid-token' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
});

test('customer profile is forbidden', async (t) => {
  await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer customer' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'forbidden');
});

test('valid user with missing profile is forbidden', async (t) => {
  await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer missing' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'forbidden');
});

test('manager profile can reach admin route', async (t) => {
  const harness = await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer manager' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { products: [] });
  assert.equal(harness.requests.some((request) => request.url.startsWith('/rest/v1/products')), true);
});

test('debug profile can reach admin route', async (t) => {
  const harness = await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer debug' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { products: [] });
  assert.equal(harness.requests.some((request) => request.url.startsWith('/rest/v1/products')), true);
});

test('user_metadata manager spoof cannot override customer profile role', async (t) => {
  await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer spoofed' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'forbidden');
});

test('historical privileged email cannot override customer profile role', async (t) => {
  await createHarness(t);
  const res = await invoke({ headers: { authorization: 'Bearer historical' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'forbidden');
});

test('payment resolutions reject legacy key and accept manager JWT', async (t) => {
  await createHarness(t);
  const legacy = await invoke({
    headers: { 'x-admin-key': 'test-admin-key' },
    query: { resource: 'payment-resolutions' },
  });
  assert.equal(legacy.statusCode, 401);
  assert.equal(legacy.body?.error, 'unauthorized');

  const manager = await invoke({
    headers: { authorization: 'Bearer manager' },
    query: { resource: 'payment-resolutions' },
  });
  assert.equal(manager.statusCode, 200);
});

test('unauthenticated representative product write is rejected before mutation', async (t) => {
  const harness = await createHarness(t);
  const res = await invoke({
    method: 'POST',
    headers: { 'x-admin-key': 'test-admin-key' },
    query: { resource: 'products' },
    body: { name: 'Blocked', price_cents: 1000, size_group: 'roupa' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'unauthorized');
  assert.equal(harness.productMutationCount, 0);
});

test('OPTIONS allows Authorization but does not advertise x-admin-key', async () => {
  const res = await invoke({ method: 'OPTIONS' });
  assert.equal(res.statusCode, 204);
  const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
  assert.match(allowed, /authorization/);
  assert.doesNotMatch(allowed, /x-admin-key/);
});
