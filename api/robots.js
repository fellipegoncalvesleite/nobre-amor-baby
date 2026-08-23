import { normalizeSiteOrigin } from '../src/lib/seo.js';

const PRODUCTION_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
const NO_STORE = 'no-store';
const CONTENT_TYPE = 'text/plain; charset=utf-8';

const DISALLOWED = [
  '/admin',
  '/debug',
  '/checkout',
  '/pedido-enviado',
  '/meus-pedidos',
  '/minha-conta',
  '/auth',
  '/redefinir-senha',
  '/entrar',
  '/carrinho',
  '/favoritos',
];

function productionBody(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

const BLOCK_ALL_BODY = 'User-agent: *\nDisallow: /\n';

export default function handler(req, res) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', NO_STORE);
    res.end('Method Not Allowed\n');
    return;
  }

  res.setHeader('Content-Type', CONTENT_TYPE);
  const isHead = method === 'HEAD';

  if (process.env.VERCEL_ENV !== 'production') {
    res.statusCode = 200;
    res.setHeader('Cache-Control', NO_STORE);
    res.end(isHead ? '' : BLOCK_ALL_BODY);
    return;
  }

  const origin = normalizeSiteOrigin(process.env.SITE_URL);
  if (!origin) {
    res.statusCode = 503;
    res.setHeader('Cache-Control', NO_STORE);
    res.end(isHead ? '' : BLOCK_ALL_BODY);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Cache-Control', PRODUCTION_CACHE);
  res.end(isHead ? '' : productionBody(origin));
}
