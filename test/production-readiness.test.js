import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  seo: resolve(ROOT, 'src/lib/seo.js'),
  seoHead: resolve(ROOT, 'src/lib/seoHead.js'),
  seoManager: resolve(ROOT, 'src/components/SeoManager.jsx'),
  robots: resolve(ROOT, 'api/robots.js'),
  sitemap: resolve(ROOT, 'api/sitemap.js'),
  checker: resolve(ROOT, 'scripts/check-production-config.mjs'),
};

async function source(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

async function importFresh(path) {
  return import(`${pathToFileURL(path).href}?test=${Date.now()}-${Math.random()}`);
}

function safeEnv(overrides = {}) {
  return {
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key-fixture',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture',
    ASAAS_API_KEY: 'asaas-key-fixture',
    ASAAS_API_URL: 'https://api.asaas.com/v3',
    ASAAS_WEBHOOK_TOKEN: 'webhook-token-fixture',
    MELHOR_ENVIO_TOKEN: 'melhor-envio-fixture',
    SITE_URL: 'https://shop.example.com',
    VITE_SITE_URL: 'https://shop.example.com/',
    VITE_WA_TEST: '',
    VITE_WA_TEST_NUMBER: '',
    CORS_ALLOWED_ORIGINS: '',
    ...overrides,
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = '') {
      this.body = String(value);
      this.ended = true;
    },
  };
}

function selectorMatches(element, selector) {
  const tagMatch = selector.match(/^([a-z]+)?/i)?.[0] || '';
  if (tagMatch && element.tagName.toLowerCase() !== tagMatch.toLowerCase()) return false;
  const attrs = [...selector.matchAll(/\[([^=\]]+)=['"]([^'"]*)['"]\]/g)];
  return attrs.every(([, name, value]) => element.getAttribute(name) === value);
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  remove() {
    const index = this.ownerDocument.head.children.indexOf(this);
    if (index >= 0) this.ownerDocument.head.children.splice(index, 1);
  }
}

function makeFakeDocument() {
  const doc = {
    title: 'fallback',
    createElement(tagName) {
      return new FakeElement(tagName, doc);
    },
  };
  doc.head = {
    children: [],
    appendChild(element) {
      this.children.push(element);
      return element;
    },
    querySelector(selector) {
      return this.children.find((element) => selectorMatches(element, selector)) ?? null;
    },
    querySelectorAll(selector) {
      return this.children.filter((element) => selectorMatches(element, selector));
    },
  };
  doc.querySelector = (selector) => doc.head.querySelector(selector);
  doc.querySelectorAll = (selector) => doc.head.querySelectorAll(selector);
  return doc;
}

const FROZEN_SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://viacep.com.br; worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: https:; upgrade-insecure-requests",
};

test('RED 1 — SEO implementation is present and integrated', async () => {
  assert.equal(existsSync(paths.seo), true, 'src/lib/seo.js must exist');
  assert.equal(existsSync(paths.seoManager), true, 'src/components/SeoManager.jsx must exist');
  const app = await source('src/App.jsx');
  assert.match(app, /<SeoManager\s*\/>/);
  assert.match(await source('src/lib/seo.js'), /VITE_SITE_URL|siteOrigin/);
});

test('RED 2 — robots, sitemap and crawler rewrites are present', async () => {
  assert.equal(existsSync(paths.robots), true, 'api/robots.js must exist');
  assert.equal(existsSync(paths.sitemap), true, 'api/sitemap.js must exist');
  const vercel = JSON.parse(await source('vercel.json'));
  assert.deepEqual(vercel.rewrites.slice(0, 4).map((entry) => entry.source), [
    '/robots.txt',
    '/sitemap.xml',
    '/api/(.*)',
    '/(.*)',
  ]);
});

test('RED 3 — production config checker is present', async () => {
  assert.equal(existsSync(paths.checker), true, 'scripts/check-production-config.mjs must exist');
  const pkg = JSON.parse(await source('package.json'));
  assert.equal(pkg.scripts['check:production-config'], 'node scripts/check-production-config.mjs');
});

test('SEO canonical origin validation matrix', async (t) => {
  assert.equal(existsSync(paths.seo), true);
  const { normalizeSiteOrigin } = await importFresh(paths.seo);
  const cases = [
    ['valid HTTPS production site URL', 'https://shop.example.com', 'https://shop.example.com'],
    ['root trailing slash normalization', 'https://shop.example.com/', 'https://shop.example.com'],
    ['HTTP rejected', 'http://shop.example.com', null],
    ['localhost rejected', 'https://localhost', null],
    ['127.0.0.1 rejected', 'https://127.0.0.1', null],
    ['credentials rejected', 'https://user:pass@shop.example.com', null],
    ['query rejected', 'https://shop.example.com/?x=1', null],
    ['fragment rejected', 'https://shop.example.com/#x', null],
    ['non-root base path rejected', 'https://shop.example.com/store', null],
    ['obvious placeholder rejected', 'https://your-site-domain.com', null],
  ];
  for (const [name, value, expected] of cases) {
    await t.test(name, () => assert.equal(normalizeSiteOrigin(value), expected));
  }
});

test('SEO canonical URLs discard query/hash and preserve homepage slash', async (t) => {
  const { buildCanonicalUrl } = await importFresh(paths.seo);
  await t.test('canonical ignores query/hash', () => {
    assert.equal(buildCanonicalUrl('https://shop.example.com', '/produtos?utm_source=x#top'), 'https://shop.example.com/produtos');
  });
  await t.test('homepage canonical has slash', () => {
    assert.equal(buildCanonicalUrl('https://shop.example.com', '/'), 'https://shop.example.com/');
  });
});

test('SEO route matrix covers public, private, admin, debug and unknown routes', async (t) => {
  const { getRouteSeo } = await importFresh(paths.seo);
  const siteOrigin = 'https://shop.example.com';
  const publicRoutes = [
    ['/', 'Nobre Amor Baby | Roupas de Bebê Premium'],
    ['/produtos', 'Produtos | Nobre Amor Baby'],
    ['/novidades', 'Novidades | Nobre Amor Baby'],
    ['/promocoes', 'Promoções | Nobre Amor Baby'],
    ['/colecoes', 'Coleções | Nobre Amor Baby'],
    ['/sobre', 'Sobre a Loja | Nobre Amor Baby'],
    ['/faq', 'Perguntas Frequentes | Nobre Amor Baby'],
    ['/guia-de-tamanhos', 'Guia de Tamanhos | Nobre Amor Baby'],
    ['/envio-e-trocas', 'Envio, Trocas e Devoluções | Nobre Amor Baby'],
    ['/privacidade', 'Política de Privacidade | Nobre Amor Baby'],
    ['/termos', 'Termos de Uso | Nobre Amor Baby'],
  ];
  for (const [pathname, title] of publicRoutes) {
    await t.test(`${pathname} is indexable`, () => {
      const seo = getRouteSeo({ pathname, siteOrigin, isCatalogLoading: false });
      assert.equal(seo.robots, 'index,follow');
      assert.equal(seo.title, title);
      assert.equal(seo.canonical, buildExpected(siteOrigin, pathname));
    });
  }

  const privateRoutes = [
    '/favoritos', '/carrinho', '/checkout', '/pedido-enviado', '/meus-pedidos',
    '/meus-pedidos/ABC123', '/minha-conta', '/entrar', '/auth/callback',
    '/redefinir-senha', '/admin', '/admin/pedidos', '/admin/catalogo', '/debug',
  ];
  for (const pathname of privateRoutes) {
    await t.test(`${pathname} is noindex`, () => {
      const seo = getRouteSeo({ pathname, siteOrigin, isCatalogLoading: false });
      assert.equal(seo.robots, 'noindex,nofollow');
      assert.equal(seo.canonical, null);
      assert.equal(seo.ogUrl, null);
    });
  }

  await t.test('unknown route is noindex with not-found title', () => {
    const seo = getRouteSeo({ pathname: '/definitely-missing', siteOrigin, isCatalogLoading: false });
    assert.equal(seo.title, 'Página não encontrada | Nobre Amor Baby');
    assert.equal(seo.robots, 'noindex,nofollow');
    assert.equal(seo.canonical, null);
  });
});

function buildExpected(origin, pathname) {
  return pathname === '/' ? `${origin}/` : `${origin}${pathname}`;
}

test('product SEO uses catalog data and waits for catalog loading before declaring missing', async (t) => {
  const { getRouteSeo } = await importFresh(paths.seo);
  const common = { pathname: '/produto/42', siteOrigin: 'https://shop.example.com' };
  const product = {
    id: 42,
    name: 'Macacão Nuvem',
    description: 'Macacão macio para bebê.',
    images: ['/images/nuvem.jpg'],
  };

  await t.test('existing product gets title, description, canonical and image', () => {
    const seo = getRouteSeo({ ...common, product, isCatalogLoading: false });
    assert.equal(seo.title, 'Macacão Nuvem | Nobre Amor Baby');
    assert.equal(seo.description, product.description);
    assert.equal(seo.canonical, 'https://shop.example.com/produto/42');
    assert.equal(seo.image, 'https://shop.example.com/images/nuvem.jpg');
    assert.equal(seo.robots, 'index,follow');
  });

  await t.test('missing loaded product is noindex with no canonical', () => {
    const seo = getRouteSeo({ ...common, product: null, isCatalogLoading: false });
    assert.equal(seo.title, 'Produto não encontrado | Nobre Amor Baby');
    assert.equal(seo.robots, 'noindex,nofollow');
    assert.equal(seo.canonical, null);
  });

  await t.test('loading product is not prematurely marked missing', () => {
    const seo = getRouteSeo({ ...common, product: null, isCatalogLoading: true });
    assert.notEqual(seo.title, 'Produto não encontrado | Nobre Amor Baby');
    assert.equal(seo.robots, 'index,follow');
    assert.equal(seo.canonical, 'https://shop.example.com/produto/42');
  });
});

test('collection SEO uses active catalog collection and noindexes missing/inactive loaded collection', async (t) => {
  const { getRouteSeo } = await importFresh(paths.seo);
  const common = { pathname: '/colecoes/essenciais', siteOrigin: 'https://shop.example.com' };
  const active = { name: 'Essenciais', slug: 'essenciais', description: 'Peças essenciais para o dia a dia.', is_active: true };

  await t.test('active collection gets metadata', () => {
    const seo = getRouteSeo({ ...common, collection: active, isCatalogLoading: false });
    assert.equal(seo.title, 'Essenciais | Nobre Amor Baby');
    assert.equal(seo.description, active.description);
    assert.equal(seo.canonical, 'https://shop.example.com/colecoes/essenciais');
    assert.equal(seo.robots, 'index,follow');
  });

  for (const [name, collection] of [['missing', null], ['inactive', { ...active, is_active: false }]]) {
    await t.test(`${name} loaded collection is noindex`, () => {
      const seo = getRouteSeo({ ...common, collection, isCatalogLoading: false });
      assert.equal(seo.robots, 'noindex,nofollow');
      assert.equal(seo.canonical, null);
    });
  }
});

test('social image normalization accepts HTTPS and same-origin paths and rejects unsafe schemes', async (t) => {
  const { normalizeSeoImage } = await importFresh(paths.seo);
  await t.test('HTTPS accepted', () => {
    assert.equal(normalizeSeoImage('https://cdn.example.com/a.jpg', 'https://shop.example.com'), 'https://cdn.example.com/a.jpg');
  });
  await t.test('same-origin path converted to absolute', () => {
    assert.equal(normalizeSeoImage('/images/a.jpg', 'https://shop.example.com'), 'https://shop.example.com/images/a.jpg');
  });
  for (const scheme of ['javascript:alert(1)', 'data:image/png;base64,AA', 'blob:https://shop.example.com/id']) {
    await t.test(`${scheme.split(':')[0]} rejected`, () => {
      assert.equal(normalizeSeoImage(scheme, 'https://shop.example.com'), null);
    });
  }
});

test('DOM head application updates metadata without duplicates or stale canonical/images', async (t) => {
  assert.equal(existsSync(paths.seoHead), true, 'src/lib/seoHead.js must exist');
  const { applySeoToDocument } = await importFresh(paths.seoHead);
  const doc = makeFakeDocument();
  const base = {
    title: 'Product | Nobre Amor Baby',
    description: 'Description',
    robots: 'index,follow',
    canonical: 'https://shop.example.com/produto/1',
    ogTitle: 'Product | Nobre Amor Baby',
    ogDescription: 'Description',
    ogType: 'website',
    ogUrl: 'https://shop.example.com/produto/1',
    ogSiteName: 'Nobre Amor Baby',
    image: 'https://shop.example.com/image.jpg',
    twitterCard: 'summary_large_image',
  };

  applySeoToDocument(doc, base);
  applySeoToDocument(doc, base);

  await t.test('repeated application creates one canonical', () => {
    assert.equal(doc.head.querySelectorAll('link[rel="canonical"]').length, 1);
  });
  await t.test('repeated application creates no duplicate managed meta tags', () => {
    const managed = doc.head.querySelectorAll('meta[data-nobre-seo="managed"]');
    const identities = managed.map((element) => element.getAttribute('name') || element.getAttribute('property'));
    assert.equal(new Set(identities).size, identities.length);
  });
  await t.test('product page creates OG and Twitter image tags', () => {
    assert.equal(doc.head.querySelector('meta[property="og:image"]')?.getAttribute('content'), base.image);
    assert.equal(doc.head.querySelector('meta[name="twitter:image"]')?.getAttribute('content'), base.image);
  });
  await t.test('title and robots update', () => {
    assert.equal(doc.title, base.title);
    assert.equal(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content'), 'index,follow');
  });

  const privateSeo = {
    ...base,
    title: 'Carrinho | Nobre Amor Baby',
    robots: 'noindex,nofollow',
    canonical: null,
    ogUrl: null,
    image: null,
    twitterCard: 'summary',
  };
  applySeoToDocument(doc, privateSeo);

  await t.test('navigation without image removes stale social images', () => {
    assert.equal(doc.head.querySelector('meta[property="og:image"]'), null);
    assert.equal(doc.head.querySelector('meta[name="twitter:image"]'), null);
  });
  await t.test('navigation public to private removes canonical', () => {
    assert.equal(doc.head.querySelector('link[rel="canonical"]'), null);
  });
  await t.test('private navigation updates title and robots', () => {
    assert.equal(doc.title, privateSeo.title);
    assert.equal(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex,nofollow');
  });
});

test('SeoManager is outside route Suspense and uses route/catalog state', async () => {
  const app = await source('src/App.jsx');
  const managerIndex = app.indexOf('<SeoManager />');
  const suspenseIndex = app.indexOf('<Suspense');
  assert.ok(managerIndex >= 0 && suspenseIndex >= 0 && managerIndex < suspenseIndex);
  const manager = await source('src/components/SeoManager.jsx');
  assert.match(manager, /useLocation/);
  assert.match(manager, /useCatalog/);
  assert.match(manager, /getProductById/);
  assert.match(manager, /getCollectionBySlug/);
  assert.match(manager, /import\.meta\.env\.VITE_SITE_URL/);
});

test('robots production, preview, misconfiguration and method matrix', async (t) => {
  const { default: handler } = await importFresh(paths.robots);

  async function invoke(method, env) {
    const previous = { VERCEL_ENV: process.env.VERCEL_ENV, SITE_URL: process.env.SITE_URL };
    Object.assign(process.env, env);
    if (!('VERCEL_ENV' in env)) delete process.env.VERCEL_ENV;
    if (!('SITE_URL' in env)) delete process.env.SITE_URL;
    const res = makeResponse();
    try {
      await handler({ method }, res);
      return res;
    } finally {
      if (previous.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.VERCEL_ENV;
      if (previous.SITE_URL === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = previous.SITE_URL;
    }
  }

  const production = await invoke('GET', { VERCEL_ENV: 'production', SITE_URL: 'https://shop.example.com/' });
  await t.test('production valid SITE_URL returns 200 text and crawl policy', () => {
    assert.equal(production.statusCode, 200);
    assert.equal(production.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(production.headers.get('cache-control'), 'public, s-maxage=3600, stale-while-revalidate=86400');
    assert.match(production.body, /User-agent: \*/);
    assert.match(production.body, /Allow: \//);
    for (const route of ['/admin', '/debug', '/checkout', '/pedido-enviado', '/meus-pedidos', '/minha-conta', '/auth', '/redefinir-senha', '/entrar', '/carrinho', '/favoritos']) {
      assert.match(production.body, new RegExp(`Disallow: ${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    assert.match(production.body, /Sitemap: https:\/\/shop\.example\.com\/sitemap\.xml/);
    assert.doesNotMatch(production.body, /secret|token|key/i);
  });

  for (const vercelEnv of ['preview', 'development']) {
    await t.test(`${vercelEnv} disallows all and advertises no sitemap`, async () => {
      const res = await invoke('GET', { VERCEL_ENV: vercelEnv, SITE_URL: 'https://shop.example.com' });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.body.trim(), 'User-agent: *\nDisallow: /');
      assert.doesNotMatch(res.body, /Sitemap:/);
    });
  }

  for (const siteUrl of [undefined, 'http://shop.example.com', 'https://your-site-domain.com']) {
    await t.test(`production invalid SITE_URL (${String(siteUrl)}) fails closed`, async () => {
      const env = { VERCEL_ENV: 'production' };
      if (siteUrl !== undefined) env.SITE_URL = siteUrl;
      const res = await invoke('GET', env);
      assert.equal(res.statusCode, 503);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.body.trim(), 'User-agent: *\nDisallow: /');
    });
  }

  await t.test('HEAD has same status/headers and no body', async () => {
    const res = await invoke('HEAD', { VERCEL_ENV: 'production', SITE_URL: 'https://shop.example.com' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(res.body, '');
  });

  await t.test('unsupported method returns 405 + Allow', async () => {
    const res = await invoke('POST', { VERCEL_ENV: 'production', SITE_URL: 'https://shop.example.com' });
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  });
});

test('sitemap production, preview, misconfiguration, method and XML matrix', async (t) => {
  const sitemapModule = await importFresh(paths.sitemap);
  const handler = sitemapModule.default;

  async function invoke(method, env) {
    const previous = { VERCEL_ENV: process.env.VERCEL_ENV, SITE_URL: process.env.SITE_URL };
    Object.assign(process.env, env);
    if (!('VERCEL_ENV' in env)) delete process.env.VERCEL_ENV;
    if (!('SITE_URL' in env)) delete process.env.SITE_URL;
    const res = makeResponse();
    try {
      await handler({ method }, res);
      return res;
    } finally {
      if (previous.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.VERCEL_ENV;
      if (previous.SITE_URL === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = previous.SITE_URL;
    }
  }

  const production = await invoke('GET', { VERCEL_ENV: 'production', SITE_URL: 'https://shop.example.com' });
  await t.test('production sitemap has correct status, content type, cache and stable URLs', () => {
    assert.equal(production.statusCode, 200);
    assert.equal(production.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(production.headers.get('cache-control'), 'public, s-maxage=3600, stale-while-revalidate=86400');
    for (const route of ['/', '/produtos', '/novidades', '/promocoes', '/colecoes', '/sobre', '/faq', '/guia-de-tamanhos', '/envio-e-trocas', '/privacidade', '/termos']) {
      const loc = route === '/' ? 'https://shop.example.com/' : `https://shop.example.com${route}`;
      assert.match(production.body, new RegExp(`<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
    }
  });
  await t.test('private/admin/debug/auth/cart/favorites and dynamic placeholders are absent', () => {
    for (const value of ['/checkout', '/meus-pedidos', '/admin', '/debug', '/auth', '/carrinho', '/favoritos', ':id', ':slug']) {
      assert.doesNotMatch(production.body, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(production.body, /<lastmod>|<changefreq>|<priority>/);
    assert.doesNotMatch(production.body, /your-site-domain/);
  });
  await t.test('XML escaping helper escapes sensitive characters', () => {
    assert.equal(sitemapModule.escapeXml('https://x.example/?a=1&b=<tag>"\''), 'https://x.example/?a=1&amp;b=&lt;tag&gt;&quot;&apos;');
  });
  await t.test('preview returns 404 no-store', async () => {
    const res = await invoke('GET', { VERCEL_ENV: 'preview', SITE_URL: 'https://shop.example.com' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
  await t.test('production missing SITE_URL returns 503 no-store', async () => {
    const res = await invoke('GET', { VERCEL_ENV: 'production' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(res.body, /<loc>/);
  });
  await t.test('HEAD returns empty body', async () => {
    const res = await invoke('HEAD', { VERCEL_ENV: 'production', SITE_URL: 'https://shop.example.com' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '');
  });
  await t.test('unsupported method returns 405 + Allow', async () => {
    const res = await invoke('PUT', { VERCEL_ENV: 'production', SITE_URL: 'https://shop.example.com' });
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  });
});

test('Vercel rewrite ordering is exact and frozen security headers are byte-value equivalent', async () => {
  const vercel = JSON.parse(await source('vercel.json'));
  assert.deepEqual(vercel.rewrites, [
    { source: '/robots.txt', destination: '/api/robots' },
    { source: '/sitemap.xml', destination: '/api/sitemap' },
    { source: '/api/(.*)', destination: '/api/$1' },
    { source: '/(.*)', destination: '/index.html' },
  ]);
  const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]));
  assert.deepEqual(headers, FROZEN_SECURITY_HEADERS);
});

test('production config validator matrix', async (t) => {
  const { validateProductionConfig } = await importFresh(paths.checker);

  function expectFailure(overrides, variable, reasonPattern) {
    const result = validateProductionConfig(safeEnv(overrides));
    assert.equal(result.ok, false);
    const issue = result.errors.find((entry) => entry.variable === variable);
    assert.ok(issue, `expected an issue for ${variable}`);
    if (reasonPattern) assert.match(issue.reason, reasonPattern);
    return result;
  }

  await t.test('complete safe fixture passes', () => {
    const result = validateProductionConfig(safeEnv());
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  for (const variable of [
    'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'ASAAS_API_KEY', 'ASAAS_API_URL', 'ASAAS_WEBHOOK_TOKEN', 'MELHOR_ENVIO_TOKEN', 'SITE_URL', 'VITE_SITE_URL',
  ]) {
    await t.test(`missing ${variable} fails`, () => {
      expectFailure({ [variable]: '' }, variable, /required|configured|missing/i);
    });
  }

  await t.test('SITE_URL / VITE_SITE_URL mismatch fails', () => {
    expectFailure({ VITE_SITE_URL: 'https://other.example.com' }, 'VITE_SITE_URL', /match|same/i);
  });
  await t.test('Supabase URL mismatch fails', () => {
    expectFailure({ VITE_SUPABASE_URL: 'https://other.supabase.co' }, 'VITE_SUPABASE_URL', /match|same/i);
  });
  await t.test('SITE_URL HTTP fails', () => {
    expectFailure({ SITE_URL: 'http://shop.example.com', VITE_SITE_URL: 'http://shop.example.com' }, 'SITE_URL', /HTTPS/i);
  });
  await t.test('SITE_URL localhost fails', () => {
    expectFailure({ SITE_URL: 'https://localhost', VITE_SITE_URL: 'https://localhost' }, 'SITE_URL', /localhost|production/i);
  });
  await t.test('SITE_URL path fails', () => {
    expectFailure({ SITE_URL: 'https://shop.example.com/store', VITE_SITE_URL: 'https://shop.example.com/store' }, 'SITE_URL', /path|origin/i);
  });
  await t.test('SITE_URL credentials fail', () => {
    expectFailure({ SITE_URL: 'https://user:pass@shop.example.com', VITE_SITE_URL: 'https://user:pass@shop.example.com' }, 'SITE_URL', /credentials|username|password/i);
  });
  await t.test('Asaas sandbox URL fails', () => {
    expectFailure({ ASAAS_API_URL: 'https://sandbox.asaas.com/api/v3' }, 'ASAAS_API_URL', /sandbox/i);
  });
  await t.test('non-sandbox HTTPS Asaas URL passes', () => {
    assert.equal(validateProductionConfig(safeEnv({ ASAAS_API_URL: 'https://payments.asaas.com/api/v3' })).ok, true);
  });
  await t.test('VITE_WA_TEST=true fails', () => {
    expectFailure({ VITE_WA_TEST: 'true' }, 'VITE_WA_TEST', /disabled|test mode/i);
  });
  await t.test('VITE_WA_TEST_NUMBER non-empty fails', () => {
    expectFailure({ VITE_WA_TEST_NUMBER: '5511999999999' }, 'VITE_WA_TEST_NUMBER', /empty|test/i);
  });
  await t.test('placeholders fail', () => {
    expectFailure({ MELHOR_ENVIO_TOKEN: 'your-melhor-token' }, 'MELHOR_ENVIO_TOKEN', /placeholder/i);
  });
  await t.test('CORS wildcard fails', () => {
    expectFailure({ CORS_ALLOWED_ORIGINS: '*' }, 'CORS_ALLOWED_ORIGINS', /wildcard/i);
  });
  await t.test('malformed CORS origin fails', () => {
    expectFailure({ CORS_ALLOWED_ORIGINS: 'https://example.com/path' }, 'CORS_ALLOWED_ORIGINS', /origin|path/i);
  });
  await t.test('valid exact additional CORS origins pass', () => {
    const result = validateProductionConfig(safeEnv({ CORS_ALLOWED_ORIGINS: 'https://preview.example.com,http://127.0.0.2:8080' }));
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });
  await t.test('validator result never contains secret values', () => {
    const sentinels = ['super-secret-service-role', 'super-secret-asaas-key', 'super-secret-webhook-token', 'super-secret-melhor-token'];
    const result = validateProductionConfig(safeEnv({
      SUPABASE_SERVICE_ROLE_KEY: sentinels[0],
      ASAAS_API_KEY: sentinels[1],
      ASAAS_WEBHOOK_TOKEN: sentinels[2],
      MELHOR_ENVIO_TOKEN: sentinels[3],
      VITE_WA_TEST: 'true',
    }));
    const serialized = JSON.stringify(result);
    for (const secret of sentinels) assert.equal(serialized.includes(secret), false);
  });
});

test('production config CLI does not leak sentinel secrets on failure', () => {
  const sentinels = ['super-secret-service-role', 'super-secret-asaas-key', 'super-secret-webhook-token', 'super-secret-melhor-token'];
  const result = spawnSync(process.execPath, [paths.checker], {
    cwd: ROOT,
    encoding: 'utf8',
    env: safeEnv({
      PATH: process.env.PATH,
      SUPABASE_SERVICE_ROLE_KEY: sentinels[0],
      ASAAS_API_KEY: sentinels[1],
      ASAAS_WEBHOOK_TOKEN: sentinels[2],
      MELHOR_ENVIO_TOKEN: sentinels[3],
      VITE_WA_TEST: 'true',
    }),
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  for (const secret of sentinels) assert.equal(output.includes(secret), false);
  assert.match(output, /PRODUCTION CONFIG: FAIL/);
});

test('index.html retains safe fallback metadata without canonical or JSON-LD', async () => {
  const html = await source('index.html');
  assert.match(html, /<title>Nobre Amor Baby \| Roupas de Bebê Premium<\/title>/);
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<script src="\/theme-init\.js"><\/script>/);
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
  for (const marker of ['og:site_name', 'og:type', 'og:title', 'og:description', 'twitter:card', 'twitter:title', 'twitter:description']) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(html, /rel=["']canonical["']/i);
  assert.doesNotMatch(html, /property=["']og:url["']/i);
  assert.doesNotMatch(html, /application\/ld\+json/i);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>\s*\{[^<]*@context/i);
});

test('environment example and package script document site URL and dev-only WhatsApp switches without real values', async () => {
  const env = await source('.env.example');
  assert.match(env, /^VITE_SITE_URL=https:\/\/your-site-domain\.com$/m);
  assert.match(env, /^SITE_URL=https:\/\/your-site-domain\.com$/m);
  assert.match(env, /^VITE_WA_TEST=$/m);
  assert.match(env, /^VITE_WA_TEST_NUMBER=$/m);
  const pkg = JSON.parse(await source('package.json'));
  assert.equal(pkg.scripts['check:production-config'], 'node scripts/check-production-config.mjs');
});

test('README documents release gates and SPA HTTP-404 limitation without deployment claims', async () => {
  const readme = await source('README.md');
  for (const command of ['npm run check:production-config', 'npm audit --audit-level=low', 'npm test', 'npm run lint', 'npm run build:budget']) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(readme, /SITE_URL\/VITE_SITE_URL|SITE_URL.*VITE_SITE_URL/s);
  assert.match(readme, /Asaas.*sandbox|sandbox.*Asaas/is);
  assert.match(readme, /WhatsApp.*teste|teste.*WhatsApp/is);
  assert.match(readme, /HTTP 200/i);
  assert.match(readme, /HTTP 404/i);
  assert.match(readme, /server|edge/i);
  assert.doesNotMatch(readme, /produção (?:já )?(?:está|foi) (?:configurada|publicada|deployada)/i);
});
