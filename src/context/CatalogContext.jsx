/**
 * CatalogContext — unified single source of truth for products + collections.
 *
 * Loading strategy:
 *   1. Try admin API (all products + all collections)
 *   2. On failure or empty → fallback to seed data
 *
 * Provides:
 *   products, collections  — arrays (normalized with camelCase compat)
 *   mode                   — "db" | "seed"
 *   isLoading, error
 *   getProductById, getProductBySlug, getCollectionBySlug
 *   upsertProduct, removeProduct
 *   upsertCollection, removeCollection
 *   setStock, decrementStock, incrementStock
 *   refresh, resetCatalog
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  listProducts as apiListProducts,
  listCollections as apiListCollections,
  createProduct as apiCreateProduct,
  updateProduct as apiUpdateProduct,
  deleteProduct as apiDeleteProduct,
  createCollection as apiCreateCollection,
  updateCollection as apiUpdateCollection,
  deleteCollection as apiDeleteCollection,
} from '../lib/adminApi';
import { getSeededProducts } from '../adminSeeds/seedProducts';
import { getSeededCollections } from '../adminSeeds/seedCollections';

/* ── Product normalisation ────────────────────────────── */

/**
 * Normalise a product from any source (DB row, seed, or legacy format)
 * so both admin (snake_case) and public pages (camelCase) can read it.
 */
function normalizeProduct(p, collections) {
  if (p._normalized) return p;

  const priceCents = p.price_cents ?? Math.round((p.price || 0) * 100);
  const oldPriceCents = p.old_price_cents ?? (p.oldPrice ? Math.round(p.oldPrice * 100) : null);
  const price = priceCents / 100;
  const oldPrice = oldPriceCents && oldPriceCents > priceCents ? oldPriceCents / 100 : null;

  const rawImg = p.image_urls || (Array.isArray(p.images) ? p.images : []);
  const images = rawImg.map((i) => (typeof i === 'string' ? i : i?.src || ''));

  const rawSizeOpts = p.size_options || p.sizeOptions || [];
  const sizeOptions = rawSizeOpts.map((opt) => {
    if (typeof opt === 'string') return { label: opt };
    return opt;
  });
  const sizes = sizeOptions.map((o) => o.label);

  const stockCount = p.stock_count ?? p.stockCount ?? 99;
  const inStock = p.in_stock ?? p.inStock ?? stockCount > 0;

  const coll = collections?.find((c) => c.id === p.collection_id) ?? null;

  return {
    ...p,
    /* canonical (snake_case) */
    price_cents: priceCents,
    old_price_cents: oldPriceCents,
    image_urls: images,
    in_stock: inStock,
    stock_count: stockCount,
    size_group: p.size_group || p.sizeGroup || 'roupa',
    size_options: sizes,
    weight_grams: p.weight_grams || p.weightGrams || 200,
    is_public: p.is_public ?? p.isPublic ?? true,
    featured: p.featured ?? false,
    age_min_months: p.age_min_months ?? p.ageMinMonths ?? null,
    age_max_months: p.age_max_months ?? p.ageMaxMonths ?? null,
    collection_id: p.collection_id || null,
    /* computed (camelCase) — public page compat */
    price,
    oldPrice,
    images,
    inStock,
    stockCount: stockCount,
    sizeGroup: p.size_group || p.sizeGroup || 'roupa',
    sizeOptions,
    sizes,
    category: coll?.slug || p.category_slug || p.category || '',
    isNew: /novo/i.test(p.tag || ''),
    isPromo: oldPrice != null && oldPrice > 0,
    weightGrams: p.weight_grams || p.weightGrams || 200,
    packGroup: p.pack_group || p.packGroup || 'roupa',
    description: p.description || '',
    details: p.details || [],
    tag: p.tag || null,
    slug: p.slug || '',
    name: p.name || '',
    ageMinMonths: p.age_min_months ?? p.ageMinMonths ?? null,
    ageMaxMonths: p.age_max_months ?? p.ageMaxMonths ?? null,
    _normalized: true,
  };
}

/* ── Collection normalisation ─────────────────────────── */

function normalizeCollection(c) {
  return {
    ...c,
    name: c.name || '',
    slug: c.slug || '',
    description: c.description || '',
    is_active: c.is_active !== false,
    image_url: c.image_url || c.image || '',
    /* compat for Categories/ColecoesPage */
    label: c.label || c.name || '',
    image: c.image || c.image_url || '',
  };
}

/* ── Context ──────────────────────────────────────────── */

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('seed');

  const modeRef = useRef('seed');
  const collectionsRef = useRef([]);

  /* ── Seed fallback ─────────────────────────────── */

  const loadSeeds = useCallback(() => {
    const seedColls = getSeededCollections().map(normalizeCollection);
    const seedProds = getSeededProducts().map((p) => normalizeProduct(p, seedColls));
    setCollections(seedColls);
    setProducts(seedProds);
    setMode('seed');
    modeRef.current = 'seed';
    collectionsRef.current = seedColls;
  }, []);

  /* ── Load catalog ──────────────────────────────── */

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [prods, colls] = await Promise.all([
        apiListProducts({}),
        apiListCollections(),
      ]);

      if ((prods && prods.length > 0) || (colls && colls.length > 0)) {
        const normColls = (colls || []).map(normalizeCollection);
        const normProds = (prods || []).map((p) => normalizeProduct(p, normColls));
        setCollections(normColls);
        setProducts(normProds);
        setMode('db');
        modeRef.current = 'db';
        collectionsRef.current = normColls;
      } else {
        loadSeeds();
      }
    } catch {
      loadSeeds();
    } finally {
      setIsLoading(false);
    }
  }, [loadSeeds]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  /* ── Refresh (public) ──────────────────────────── */

  const refresh = useCallback(() => loadCatalog(), [loadCatalog]);

  const resetCatalog = useCallback(() => {
    loadSeeds();
  }, [loadSeeds]);

  /* ── Lookup helpers ────────────────────────────── */

  const getProductById = useCallback(
    (id) => products.find((p) => String(p.id) === String(id)) ?? null,
    [products],
  );

  const getProductBySlug = useCallback(
    (slug) => products.find((p) => p.slug === slug) ?? null,
    [products],
  );

  const getCollectionBySlug = useCallback(
    (slug) => collections.find((c) => c.slug === slug) ?? null,
    [collections],
  );

  /* ── Product mutations ─────────────────────────── */

  const upsertProduct = useCallback(async (product) => {
    if (modeRef.current === 'db') {
      const isExisting = product.id && !String(product.id).startsWith('seed-') && !String(product.id).startsWith('local-');
      if (isExisting) {
        await apiUpdateProduct(product.id, product);
      } else {
        await apiCreateProduct(product);
      }
      await loadCatalog();
    } else {
      const colls = collectionsRef.current;
      setProducts((prev) => {
        const normalized = normalizeProduct(
          { ...product, id: product.id || `local-${Date.now()}`, updated_at: new Date().toISOString() },
          colls,
        );
        const idx = prev.findIndex((p) => p.id === product.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...normalized, _normalized: true };
          return copy;
        }
        return [normalized, ...prev];
      });
    }
  }, [loadCatalog]);

  const removeProduct = useCallback(async (id) => {
    if (modeRef.current === 'db') {
      await apiDeleteProduct(id);
      await loadCatalog();
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }, [loadCatalog]);

  /* ── Collection mutations ──────────────────────── */

  const upsertCollection = useCallback(async (collection) => {
    if (modeRef.current === 'db') {
      const isExisting = collection.id && !String(collection.id).startsWith('seed-') && !String(collection.id).startsWith('local-');
      if (isExisting) {
        await apiUpdateCollection(collection.id, collection);
      } else {
        await apiCreateCollection(collection);
      }
      await loadCatalog();
    } else {
      setCollections((prev) => {
        const normalized = normalizeCollection(
          { ...collection, id: collection.id || `local-${Date.now()}`, updated_at: new Date().toISOString() },
        );
        const idx = prev.findIndex((c) => c.id === collection.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...normalized };
          return copy;
        }
        return [normalized, ...prev];
      });
    }
  }, [loadCatalog]);

  const removeCollection = useCallback(async (id) => {
    if (modeRef.current === 'db') {
      await apiDeleteCollection(id);
      await loadCatalog();
    } else {
      setCollections((prev) => prev.filter((c) => c.id !== id));
    }
  }, [loadCatalog]);

  /* ── Stock helpers (compat with Debug/Checkout) ── */

  const setStock = useCallback((id, count) => {
    const clamped = Math.max(0, Math.round(count));
    setProducts((prev) =>
      prev.map((p) =>
        String(p.id) === String(id)
          ? { ...p, stockCount: clamped, stock_count: clamped, inStock: clamped > 0, in_stock: clamped > 0 }
          : p,
      ),
    );
  }, []);

  const decrementStock = useCallback((id, amount = 1) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (String(p.id) !== String(id)) return p;
        const newCount = Math.max(0, (p.stockCount ?? 0) - amount);
        return { ...p, stockCount: newCount, stock_count: newCount, inStock: newCount > 0, in_stock: newCount > 0 };
      }),
    );
  }, []);

  const incrementStock = useCallback((id, amount = 1) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (String(p.id) !== String(id)) return p;
        const newCount = (p.stockCount ?? 0) + amount;
        return { ...p, stockCount: newCount, stock_count: newCount, inStock: true, in_stock: true };
      }),
    );
  }, []);

  /* ── Memoised value ────────────────────────────── */

  const value = useMemo(
    () => ({
      products,
      collections,
      isLoading,
      error,
      mode,
      getProductById,
      getProductBySlug,
      getCollectionBySlug,
      upsertProduct,
      removeProduct,
      upsertCollection,
      removeCollection,
      setStock,
      decrementStock,
      incrementStock,
      refresh,
      resetCatalog,
      /* legacy aliases */
      updateProduct: (id, changes) => {
        const existing = products.find((p) => String(p.id) === String(id));
        if (!existing) return;
        upsertProduct({ ...existing, ...changes });
      },
    }),
    [products, collections, isLoading, error, mode, getProductById, getProductBySlug, getCollectionBySlug,
     upsertProduct, removeProduct, upsertCollection, removeCollection,
     setStock, decrementStock, incrementStock, refresh, resetCatalog],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}
