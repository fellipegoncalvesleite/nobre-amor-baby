const BRAND = 'Nobre Amor Baby';
const DEFAULT_DESCRIPTION = 'Nobre Amor Baby - Roupas de bebê premium com tecidos macios e designs delicados. Confira nossa coleção de macacões de algodão orgânico, casaquinhos de tricô e looks adoráveis para recém-nascidos até 12 meses.';
const STORE_FALLBACK_DESCRIPTION = 'Conheça os produtos e coleções disponíveis na Nobre Amor Baby.';

const STATIC_ROUTES = new Map([
  ['/', {
    title: 'Nobre Amor Baby | Roupas de Bebê Premium',
    description: DEFAULT_DESCRIPTION,
  }],
  ['/produtos', {
    title: 'Produtos | Nobre Amor Baby',
    description: 'Conheça os produtos disponíveis na Nobre Amor Baby.',
  }],
  ['/novidades', {
    title: 'Novidades | Nobre Amor Baby',
    description: 'Os lançamentos mais recentes da nossa coleção.',
  }],
  ['/promocoes', {
    title: 'Promoções | Nobre Amor Baby',
    description: 'Ofertas especiais disponíveis na Nobre Amor Baby.',
  }],
  ['/colecoes', {
    title: 'Coleções | Nobre Amor Baby',
    description: 'Conheça as coleções disponíveis na Nobre Amor Baby.',
  }],
  ['/sobre', {
    title: 'Sobre a Loja | Nobre Amor Baby',
    description: 'Conheça a história, a proposta e os canais de contato da Nobre Amor Baby.',
  }],
  ['/faq', {
    title: 'Perguntas Frequentes | Nobre Amor Baby',
    description: 'Respostas sobre pagamentos, envios, trocas, devoluções e retirada de pedidos.',
  }],
  ['/guia-de-tamanhos', {
    title: 'Guia de Tamanhos | Nobre Amor Baby',
    description: 'Consulte referências de tamanho, idade, peso e altura para escolher peças infantis.',
  }],
  ['/envio-e-trocas', {
    title: 'Envio, Trocas e Devoluções | Nobre Amor Baby',
    description: 'Consulte informações sobre envio, retirada, trocas, devoluções e produtos com defeito.',
  }],
  ['/privacidade', {
    title: 'Política de Privacidade | Nobre Amor Baby',
    description: 'Saiba quais dados pessoais a Nobre Amor Baby coleta e como eles são utilizados.',
  }],
  ['/termos', {
    title: 'Termos de Uso | Nobre Amor Baby',
    description: 'Consulte os termos aplicáveis ao uso da loja e aos pedidos realizados no site.',
  }],
]);

const PRIVATE_EXACT_ROUTES = new Set([
  '/favoritos',
  '/carrinho',
  '/checkout',
  '/pedido-enviado',
  '/meus-pedidos',
  '/minha-conta',
  '/entrar',
  '/auth/callback',
  '/redefinir-senha',
  '/admin',
  '/debug',
]);

const PLACEHOLDER_PARTS = [
  'your-project',
  'your-public',
  'your-service',
  'your-asaas',
  'your-melhor',
  'your-site-domain',
];

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function hasPlaceholder(value) {
  const lower = cleanText(value).toLowerCase();
  return PLACEHOLDER_PARTS.some((part) => lower.includes(part));
}

export function normalizeSiteOrigin(value) {
  const raw = cleanText(value);
  if (!raw || hasPlaceholder(raw)) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (raw.includes('?') || raw.includes('#')) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return null;

  return url.origin;
}

function normalizePathname(pathname) {
  const raw = typeof pathname === 'string' && pathname.trim() ? pathname.trim() : '/';
  let parsed;
  try {
    parsed = new URL(raw, 'https://route.invalid');
  } catch {
    return '/';
  }
  let path = parsed.pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

export function buildCanonicalUrl(siteOrigin, pathname) {
  const origin = normalizeSiteOrigin(siteOrigin);
  if (!origin) return null;
  const path = normalizePathname(pathname);
  return path === '/' ? `${origin}/` : `${origin}${path}`;
}

export function normalizeSeoImage(value, siteOrigin) {
  const raw = cleanText(value);
  if (!raw) return null;

  if (raw.startsWith('/')) {
    const origin = normalizeSiteOrigin(siteOrigin);
    if (!origin) return null;
    try {
      const url = new URL(raw, `${origin}/`);
      return url.protocol === 'https:' && url.origin === origin ? url.href : null;
    } catch {
      return null;
    }
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === 'https:' ? url.href : null;
}

function isPrivateRoute(pathname) {
  if (PRIVATE_EXACT_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/admin/')) return true;
  if (pathname.startsWith('/meus-pedidos/')) return true;
  return false;
}

function baseSeo({ title, description, robots, canonical, image = null }) {
  const isIndexable = robots === 'index,follow';
  return {
    title,
    description,
    robots,
    canonical: isIndexable ? canonical : null,
    ogTitle: title,
    ogDescription: description,
    ogType: 'website',
    ogUrl: isIndexable ? canonical : null,
    ogSiteName: BRAND,
    image: isIndexable ? image : null,
    twitterCard: isIndexable && image ? 'summary_large_image' : 'summary',
  };
}

function noindexSeo(title, description = STORE_FALLBACK_DESCRIPTION) {
  return baseSeo({
    title,
    description,
    robots: 'noindex,nofollow',
    canonical: null,
  });
}

export function getRouteSeo({
  pathname,
  siteOrigin,
  product = null,
  collection = null,
  isCatalogLoading = false,
} = {}) {
  const path = normalizePathname(pathname);
  const canonical = buildCanonicalUrl(siteOrigin, path);

  const staticRoute = STATIC_ROUTES.get(path);
  if (staticRoute) {
    return baseSeo({ ...staticRoute, robots: 'index,follow', canonical });
  }

  const productMatch = path.match(/^\/produto\/([^/]+)$/);
  if (productMatch) {
    if (product) {
      const name = cleanText(product.name) || 'Produto';
      const description = cleanText(product.description) || STORE_FALLBACK_DESCRIPTION;
      const image = Array.isArray(product.images)
        ? product.images.map((candidate) => normalizeSeoImage(candidate, siteOrigin)).find(Boolean) ?? null
        : null;
      return baseSeo({
        title: `${name} | ${BRAND}`,
        description,
        robots: 'index,follow',
        canonical,
        image,
      });
    }

    if (isCatalogLoading) {
      return baseSeo({
        title: 'Produtos | Nobre Amor Baby',
        description: STORE_FALLBACK_DESCRIPTION,
        robots: 'index,follow',
        canonical,
      });
    }

    return noindexSeo('Produto não encontrado | Nobre Amor Baby');
  }

  const collectionMatch = path.match(/^\/colecoes\/([^/]+)$/);
  if (collectionMatch) {
    if (collection && collection.is_active !== false) {
      const name = cleanText(collection.name) || 'Coleção';
      const description = cleanText(collection.description) || 'Conheça esta coleção da Nobre Amor Baby.';
      return baseSeo({
        title: `${name} | ${BRAND}`,
        description,
        robots: 'index,follow',
        canonical,
      });
    }

    if (isCatalogLoading) {
      return baseSeo({
        title: 'Coleções | Nobre Amor Baby',
        description: 'Conheça as coleções disponíveis na Nobre Amor Baby.',
        robots: 'index,follow',
        canonical,
      });
    }

    return noindexSeo('Coleção não encontrada | Nobre Amor Baby');
  }

  if (isPrivateRoute(path)) {
    return noindexSeo(`${BRAND}`);
  }

  return noindexSeo('Página não encontrada | Nobre Amor Baby', 'A página solicitada não foi encontrada.');
}
