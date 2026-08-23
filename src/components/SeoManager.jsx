import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext';
import { getRouteSeo } from '../lib/seo';
import { applySeoToDocument } from '../lib/seoHead';

function decodeRouteSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function SeoManager() {
  const location = useLocation();
  const { getProductById, getCollectionBySlug, isLoading } = useCatalog();
  const siteOrigin = import.meta.env.VITE_SITE_URL;

  const seo = useMemo(() => {
    const productMatch = location.pathname.match(/^\/produto\/([^/]+)\/?$/);
    const collectionMatch = location.pathname.match(/^\/colecoes\/([^/]+)\/?$/);

    const product = productMatch
      ? getProductById(decodeRouteSegment(productMatch[1]))
      : null;
    const collection = collectionMatch
      ? getCollectionBySlug(decodeRouteSegment(collectionMatch[1]))
      : null;

    return getRouteSeo({
      pathname: location.pathname,
      siteOrigin,
      product,
      collection,
      isCatalogLoading: isLoading,
    });
  }, [location.pathname, siteOrigin, getProductById, getCollectionBySlug, isLoading]);

  useEffect(() => {
    applySeoToDocument(document, seo);
  }, [seo]);

  return null;
}
