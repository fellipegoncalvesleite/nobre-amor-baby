/**
 * CatalogContext — live product catalog with localStorage override.
 *
 * Initialises from localStorage (`nobre_amor_v1_products_override`).
 * Falls back to the static default catalogue from `data/products.js`.
 *
 * Provides:
 *   products          — fully merged array (default + overrides)
 *   getProductById    — lookup helper
 *   getProductBySlug  — lookup helper
 *   updateProduct     — partial update by id  (manager/debug)
 *   resetCatalog      — drop all overrides     (manager/debug)
 *   setStock          — set stockCount for a product
 *   decrementStock    — decrease stockCount (clamps at 0)
 *   incrementStock    — increase stockCount
 */

import { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { defaultProducts } from '../data/products';

/* ── localStorage helpers ─────────────────────────────── */

const STORAGE_VERSION = 'v1';
const storageKey = `nobre_amor_${STORAGE_VERSION}_products_override`;

function loadOverrides() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides) {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(overrides));
    }
  } catch {
    /* quota exceeded — silently ignore */
  }
}

/* ── Stock normalisation ──────────────────────────────── */

/**
 * Ensure a product has a valid numeric `stockCount` and derive `inStock`.
 * Migration: if only boolean `inStock` exists, convert → stockCount.
 */
function normalizeStock(product) {
  let count = product.stockCount;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    // Migration from boolean-only override
    count = product.inStock === false ? 0 : 99;
  }
  count = Math.max(0, Math.round(count));
  return { ...product, stockCount: count, inStock: count > 0 };
}

/* ── Merge logic ──────────────────────────────────────── */

/**
 * Merge the default static catalogue with per-product overrides.
 * Whitelisted override fields: stockCount (integer).
 * `inStock` is always derived from `stockCount > 0`.
 */
function mergeProducts(overrides) {
  return defaultProducts.map((p) => {
    const ov = overrides[p.id];
    if (!ov) return normalizeStock(p);
    const merged = { ...p };
    if (typeof ov.stockCount === 'number') merged.stockCount = ov.stockCount;
    // Legacy migration: boolean-only override
    else if (typeof ov.inStock === 'boolean' && ov.inStock === false) merged.stockCount = 0;
    return normalizeStock(merged);
  });
}

/* ── Reducer ──────────────────────────────────────────── */

function reducer(state, action) {
  switch (action.type) {
    case 'UPDATE_PRODUCT': {
      const { id, changes } = action.payload;
      const prev = state.overrides[id] ?? {};
      const next = { ...prev };
      // Whitelist: stockCount (integer)
      if (typeof changes.stockCount === 'number') {
        next.stockCount = Math.max(0, Math.round(changes.stockCount));
        delete next.inStock; // derived
      }
      // Legacy compat: if only inStock boolean passed, convert
      else if (typeof changes.inStock === 'boolean') {
        next.stockCount = changes.inStock ? 99 : 0;
        delete next.inStock;
      }
      const overrides = { ...state.overrides, [id]: next };
      return { overrides, products: mergeProducts(overrides) };
    }

    case 'SET_STOCK': {
      const { id, count } = action.payload;
      const prev = state.overrides[id] ?? {};
      const overrides = {
        ...state.overrides,
        [id]: { ...prev, stockCount: Math.max(0, Math.round(count)) },
      };
      return { overrides, products: mergeProducts(overrides) };
    }

    case 'DECREMENT_STOCK': {
      const { id, amount = 1 } = action.payload;
      const current = state.products.find((p) => p.id === String(id));
      const curCount = current?.stockCount ?? 0;
      const prev = state.overrides[id] ?? {};
      const overrides = {
        ...state.overrides,
        [id]: { ...prev, stockCount: Math.max(0, curCount - amount) },
      };
      return { overrides, products: mergeProducts(overrides) };
    }

    case 'INCREMENT_STOCK': {
      const { id, amount = 1 } = action.payload;
      const current = state.products.find((p) => p.id === String(id));
      const curCount = current?.stockCount ?? 0;
      const prev = state.overrides[id] ?? {};
      const overrides = {
        ...state.overrides,
        [id]: { ...prev, stockCount: curCount + amount },
      };
      return { overrides, products: mergeProducts(overrides) };
    }

    case 'RESET_CATALOG':
      return { overrides: {}, products: mergeProducts({}) };

    default:
      return state;
  }
}

/* ── Context ──────────────────────────────────────────── */

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const initialOverrides = loadOverrides();
  const [state, dispatch] = useReducer(reducer, {
    overrides: initialOverrides,
    products: mergeProducts(initialOverrides),
  });

  // Persist overrides on every change
  useEffect(() => {
    saveOverrides(state.overrides);
  }, [state.overrides]);

  /* ── Actions ─────────────────────────────────────── */

  const updateProduct = useCallback(
    (id, changes) => dispatch({ type: 'UPDATE_PRODUCT', payload: { id, changes } }),
    [],
  );

  const setStock = useCallback(
    (id, count) => dispatch({ type: 'SET_STOCK', payload: { id, count } }),
    [],
  );

  const decrementStock = useCallback(
    (id, amount = 1) => dispatch({ type: 'DECREMENT_STOCK', payload: { id, amount } }),
    [],
  );

  const incrementStock = useCallback(
    (id, amount = 1) => dispatch({ type: 'INCREMENT_STOCK', payload: { id, amount } }),
    [],
  );

  const resetCatalog = useCallback(
    () => dispatch({ type: 'RESET_CATALOG' }),
    [],
  );

  /* ── Lookup helpers ──────────────────────────────── */

  const getProductById = useCallback(
    (id) => state.products.find((p) => p.id === String(id)) ?? null,
    [state.products],
  );

  const getProductBySlug = useCallback(
    (slug) => state.products.find((p) => p.slug === slug) ?? null,
    [state.products],
  );

  const value = useMemo(
    () => ({
      products: state.products,
      getProductById,
      getProductBySlug,
      updateProduct,
      resetCatalog,
      setStock,
      decrementStock,
      incrementStock,
    }),
    [state.products, getProductById, getProductBySlug, updateProduct, resetCatalog, setStock, decrementStock, incrementStock],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}
