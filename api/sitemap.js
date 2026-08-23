import { normalizeSiteOrigin } from '../src/lib/seo.js';

const PRODUCTION_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
const NO_STORE = 'no-store';
const STABLE_ROUTES = [
  '/',
  '/produtos',
  '/novidades',
  '/promocoes',
  '/colecoes',
  '/sobre',
  '/faq',
  '/guia-de-tamanhos',
  '/envio-e-trocas',
  '/privacidade',
  '/termos',
];

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildSitemap(origin) {
  const urls = STABLE_ROUTES.map((route) => {
    const url = route === '/' ? `${origin}/` : `${origin}${route}`;
    return `  <url><loc>${escapeXml(url)}</loc></url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export default function handler(req, res) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', NO_STORE);
    res.end('Method Not Allowed\n');
    return;
  }

  const isHead = method === 'HEAD';

  if (process.env.VERCEL_ENV !== 'production') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', NO_STORE);
    res.end(isHead ? '' : 'Not Found\n');
    return;
  }

  const origin = normalizeSiteOrigin(process.env.SITE_URL);
  if (!origin) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', NO_STORE);
    res.end(isHead ? '' : 'Service Unavailable\n');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', PRODUCTION_CACHE);
  res.end(isHead ? '' : buildSitemap(origin));
}
