/**
 * /api/public — unified public read-only router
 *
 * Routes by ?resource=xxx:
 *   resource=home        GET homepage config with resolved collections/featured
 *   resource=products    GET public product list (supports collection, featured, slug, search, limit)
 *   resource=collections GET active collections list (supports ?slug=xxx)
 *
 * No auth required. Cached for 60s.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET.' });
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
  const supabase = createClient(sbUrl, sbKey);

  const { resource } = req.query;

  try {
    switch (resource) {
      case 'home':
        return await handleHome(req, res, supabase);
      case 'products':
        return await handleProducts(req, res, supabase);
      case 'collections':
        return await handleCollections(req, res, supabase);
      default:
        return json(res, 400, { error: 'bad_request', message: 'Missing or invalid ?resource= parameter. Use: home, products, collections.' });
    }
  } catch (err) {
    console.error(`[public/${resource}] error:`, err);
    return json(res, 500, { error: 'internal_error', message: err.message });
  }
}

/* ══════════════════════════════════════════════════
   HOME — homepage config with resolved data
   ══════════════════════════════════════════════════ */
async function handleHome(req, res, supabase) {
  const HOME_DEFAULTS = {
    collections_enabled: true,
    featured_enabled: true,
    collections_title: 'Coleções',
    featured_title: 'Destaques',
    collections_order: [],
    featured_order: [],
  };

  // 1. Homepage settings
  const { data: settings, error: sErr } = await supabase
    .from('homepage_settings')
    .select('*')
    .eq('key', 'home')
    .maybeSingle();

  if (sErr) {
    // Table missing — return sensible defaults so storefront still works
    const isTableMissing =
      sErr.code === '42P01' ||
      sErr.code === 'PGRST204' ||
      /does not exist|not found.*relation|homepage_settings/i.test(sErr.message || '');

    if (isTableMissing) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      return json(res, 200, {
        ...HOME_DEFAULTS,
        collections: [],
        featured: [],
      });
    }
    return json(res, 500, { error: 'db_error', message: sErr.message });
  }

  // Use row data or defaults if row is missing
  const cfg = settings || HOME_DEFAULTS;

  const result = {
    collections_enabled: cfg.collections_enabled,
    featured_enabled: cfg.featured_enabled,
    collections_title: cfg.collections_title,
    featured_title: cfg.featured_title,
    collections: [],
    featured: [],
  };

  // 2. Resolve collections
  if (cfg.collections_enabled) {
    let query = supabase.from('collections').select('*').eq('is_active', true);

    if (cfg.collections_order?.length) {
      const { data: colls } = await query.in('id', cfg.collections_order);
      const orderMap = {};
      cfg.collections_order.forEach((id, i) => { orderMap[id] = i; });
      result.collections = (colls || []).sort(
        (a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)
      );
    } else {
      const { data: colls } = await query.order('name');
      result.collections = colls || [];
    }
  }

  // 3. Resolve featured products
  if (cfg.featured_enabled) {
    let query = supabase.from('products').select('*')
      .eq('is_public', true)
      .eq('in_stock', true);

    if (cfg.featured_order?.length) {
      const { data: prods } = await query.in('id', cfg.featured_order);
      const orderMap = {};
      cfg.featured_order.forEach((id, i) => { orderMap[id] = i; });
      result.featured = (prods || []).sort(
        (a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)
      );
    } else {
      const { data: prods } = await query.eq('featured', true).order('created_at', { ascending: false }).limit(12);
      result.featured = prods || [];
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return json(res, 200, result);
}

/* ══════════════════════════════════════════════════
   PRODUCTS — public product list
   ══════════════════════════════════════════════════ */
async function handleProducts(req, res, supabase) {
  const { collection, featured, slug, search, limit } = req.query;

  // Single product by slug
  if (slug) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .single();

    if (error || !data) return json(res, 404, { error: 'not_found', message: 'Product not found' });
    return json(res, 200, { product: data });
  }

  let query = supabase
    .from('products')
    .select('*')
    .eq('is_public', true);

  if (collection) {
    query = query.eq('collection_id', collection);
  }

  if (featured === 'true') {
    query = query.eq('featured', true);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  const max = Math.min(parseInt(limit) || 50, 200);
  query = query.order('created_at', { ascending: false }).limit(max);

  const { data, error } = await query;
  if (error) return json(res, 500, { error: 'db_error', message: error.message });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return json(res, 200, { products: data || [] });
}

/* ══════════════════════════════════════════════════
   COLLECTIONS — active collections
   ══════════════════════════════════════════════════ */
async function handleCollections(req, res, supabase) {
  const { slug } = req.query;

  if (slug) {
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !data) return json(res, 404, { error: 'not_found', message: 'Collection not found' });

    // Also get products for this collection
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('collection_id', data.id)
      .eq('is_public', true)
      .eq('in_stock', true)
      .order('created_at', { ascending: false });

    return json(res, 200, { collection: data, products: products || [] });
  }

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) return json(res, 500, { error: 'db_error', message: error.message });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return json(res, 200, { collections: data || [] });
}
