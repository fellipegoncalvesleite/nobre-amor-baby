import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readSource(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

const LAZY_PAGES = [
  'ProductDetailPage',
  'ProductListingPage',
  'AllProductsPage',
  'ColecoesPage',
  'WishlistPage',
  'CartPage',
  'CheckoutPage',
  'LoginPage',
  'ResetPasswordPage',
  'AuthCallbackPage',
  'AdminDashboardPage',
  'AdminOrdersPage',
  'AdminOrderDetailPage',
  'AdminCatalogPage',
  'AdminHomePage',
  'OrderSuccessPage',
  'MeusPedidosPage',
  'MinhaContaPage',
  'CustomerOrderDetailPage',
  'DebugPage',
  'StaticPage',
];

test('homepage stays eager while every non-home route page is lazy-loaded once', async () => {
  const source = await readSource('src/App.jsx');

  assert.match(source, /import HomePage from ['"]\.\/pages\/HomePage['"];?/);
  assert.doesNotMatch(source, /const\s+HomePage\s*=\s*lazy\s*\(/);

  for (const page of LAZY_PAGES) {
    const escapedPage = escapeRegExp(page);
    const lazyDeclaration = new RegExp(
      `const\\s+${escapedPage}\\s*=\\s*lazy\\s*\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]\\.\\/pages\\/${escapedPage}['"]\\s*\\)\\s*\\)\\s*;?`,
      'g',
    );
    const matches = source.match(lazyDeclaration) ?? [];
    assert.equal(matches.length, 1, `${page} should have exactly one React.lazy declaration`);
    assert.doesNotMatch(
      source,
      new RegExp(`import\\s+${escapedPage}\\s+from\\s+['"]\\.\\/pages\\/${escapedPage}['"]`),
      `${page} should not remain eagerly imported`,
    );
  }
});

test('route rendering has an in-layout Suspense boundary with an accessible fallback', async () => {
  const source = await readSource('src/App.jsx');

  assert.match(source, /import\s*\{[^}]*\blazy\b[^}]*\bSuspense\b[^}]*\buseEffect\b[^}]*\}\s*from\s*['"]react['"]/s);
  assert.match(source, /role=['"]status['"]/);
  assert.match(source, /Carregando(?:…|\.\.\.)/);
  assert.match(source, /<main[^>]*>[\s\S]*<Suspense[\s\S]*<Routes>[\s\S]*<\/Routes>[\s\S]*<\/Suspense>[\s\S]*<\/main>/);
  assert.match(source, /<Header\s*\/>[\s\S]*<main/);
  assert.match(source, /<\/main>[\s\S]*<Footer\s*\/>/);
});

test('route authorization and admin redirects remain source-level invariants', async () => {
  const source = await readSource('src/App.jsx');

  for (const path of ['/checkout', '/pedido-enviado', '/meus-pedidos', '/meus-pedidos/:orderCode', '/minha-conta']) {
    const escapedPath = escapeRegExp(path);
    assert.match(
      source,
      new RegExp(`<Route\\s+path=['"]${escapedPath}['"]\\s+element=\\{<ProtectedRoute>`),
      `${path} should remain protected by the ordinary ProtectedRoute`,
    );
  }

  assert.match(source, /<ProtectedRoute role=['"]manager['"]>/);
  assert.match(source, /<ProtectedRoute role=['"]debug['"]>/);
  assert.match(source, /<Navigate to=['"]\/admin\/catalogo\?tab=produtos['"] replace\s*\/>/);
  assert.match(source, /<Navigate to=['"]\/admin\/catalogo\?tab=colecoes['"] replace\s*\/>/);
});

test('Vite defines conservative stable vendor chunks without raising the warning limit', async () => {
  const source = await readSource('vite.config.js');

  assert.match(source, /manualChunks/);
  assert.match(source, /react-vendor/);
  for (const dependency of ['react', 'react-dom', 'react-router-dom', 'react-hot-toast']) {
    assert.match(source, new RegExp(`['"]${escapeRegExp(dependency)}['"]`), `${dependency} should be in the React vendor group`);
  }
  assert.match(source, /supabase-vendor/);
  assert.match(source, /['"]@supabase\/supabase-js['"]/);
  assert.match(source, /motion-vendor/);
  assert.match(source, /['"]framer-motion['"]/);
  assert.doesNotMatch(source, /chunkSizeWarningLimit/);
});
