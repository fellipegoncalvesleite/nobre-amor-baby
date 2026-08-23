const MANAGED_ATTR = 'data-nobre-seo';
const MANAGED_VALUE = 'managed';

function matchingElements(documentLike, selector) {
  return Array.from(documentLike.head.querySelectorAll(selector));
}

function upsertMeta(documentLike, attribute, key, content) {
  const selector = `meta[${attribute}="${key}"]`;
  const matches = matchingElements(documentLike, selector);

  if (!content) {
    for (const element of matches) element.remove();
    return null;
  }

  const element = matches.shift() ?? documentLike.createElement('meta');
  for (const duplicate of matches) duplicate.remove();

  element.setAttribute(attribute, key);
  element.setAttribute('content', content);
  element.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
  if (!element.parentNode && !documentLike.head.children?.includes?.(element)) {
    documentLike.head.appendChild(element);
  }
  return element;
}

function upsertCanonical(documentLike, canonical) {
  const selector = 'link[rel="canonical"]';
  const matches = matchingElements(documentLike, selector);

  if (!canonical) {
    for (const element of matches) element.remove();
    return null;
  }

  const element = matches.shift() ?? documentLike.createElement('link');
  for (const duplicate of matches) duplicate.remove();

  element.setAttribute('rel', 'canonical');
  element.setAttribute('href', canonical);
  element.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
  if (!element.parentNode && !documentLike.head.children?.includes?.(element)) {
    documentLike.head.appendChild(element);
  }
  return element;
}

export function applySeoToDocument(documentLike, seo) {
  if (!documentLike?.head || !seo) return;

  documentLike.title = seo.title;

  upsertMeta(documentLike, 'name', 'description', seo.description);
  upsertMeta(documentLike, 'name', 'robots', seo.robots);

  upsertMeta(documentLike, 'property', 'og:title', seo.ogTitle);
  upsertMeta(documentLike, 'property', 'og:description', seo.ogDescription);
  upsertMeta(documentLike, 'property', 'og:type', seo.ogType);
  upsertMeta(documentLike, 'property', 'og:url', seo.ogUrl);
  upsertMeta(documentLike, 'property', 'og:site_name', seo.ogSiteName);
  upsertMeta(documentLike, 'property', 'og:image', seo.image);

  upsertMeta(documentLike, 'name', 'twitter:card', seo.twitterCard);
  upsertMeta(documentLike, 'name', 'twitter:title', seo.ogTitle);
  upsertMeta(documentLike, 'name', 'twitter:description', seo.ogDescription);
  upsertMeta(documentLike, 'name', 'twitter:image', seo.image);

  upsertCanonical(documentLike, seo.canonical);
}
