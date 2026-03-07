/**
 * /api/admin/products
 *   GET  — list products (with optional search, status, collection_id, limit)
 *   POST — create a new product
 *
 * Protected by x-admin-key header.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or POST.' });
  }

  /* ── auth ──────────────────────────────────────── */
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return json(res, 500, { error: 'missing_env', message: 'Admin key not configured.' });
  if (req.headers['x-admin-key'] !== adminKey) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid or missing x-admin-key.' });
  }

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
    const supabase = createClient(sbUrl, sbKey);

    /* ── GET: list ──────────────────────────────── */
    if (req.method === 'GET') {
      const { search, status, collection_id, limit: rawLimit } = req.query;
      const limit = Math.min(parseInt(rawLimit) || 100, 500);

      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (search) {
        query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
      }
      if (status === 'public') query = query.eq('is_public', true);
      if (status === 'private') query = query.eq('is_public', false);
      if (status === 'in_stock') query = query.eq('in_stock', true);
      if (status === 'out_of_stock') query = query.eq('in_stock', false);
      if (collection_id) query = query.eq('collection_id', collection_id);

      const { data, error: queryErr } = await query;
      if (queryErr) {
        console.error('[admin/products] list error:', queryErr);
        return json(res, 500, { error: 'db_error', message: 'Falha ao listar produtos.' });
      }

      return json(res, 200, { products: data || [] });
    }

    /* ── POST: create ───────────────────────────── */
    if (req.method === 'POST') {
      const body = req.body || {};
      const { name, slug: rawSlug, description, price_cents, old_price_cents, tag, featured,
              is_public, in_stock, stock_count, size_group, size_options, age_min_months,
              age_max_months, category_slug, collection_id, image_urls, weight_grams } = body;

      if (!name?.trim()) return json(res, 400, { error: 'validation', message: 'Nome é obrigatório.' });
      if (!price_cents || price_cents <= 0) return json(res, 400, { error: 'validation', message: 'Preço inválido.' });
      if (!size_group?.trim()) return json(res, 400, { error: 'validation', message: 'Grupo de tamanho é obrigatório.' });

      const slug = rawSlug?.trim() || slugify(name);

      const row = {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        price_cents: parseInt(price_cents),
        old_price_cents: old_price_cents ? parseInt(old_price_cents) : null,
        tag: tag?.trim() || null,
        featured: featured === true,
        is_public: is_public === true,
        in_stock: in_stock !== false,
        stock_count: typeof stock_count === 'number' ? stock_count : 99,
        size_group: size_group.trim(),
        size_options: Array.isArray(size_options) ? size_options : [],
        age_min_months: age_min_months != null ? parseInt(age_min_months) : null,
        age_max_months: age_max_months != null ? parseInt(age_max_months) : null,
        category_slug: category_slug?.trim() || null,
        collection_id: collection_id || null,
        image_urls: Array.isArray(image_urls) ? image_urls : [],
        weight_grams: weight_grams ? parseInt(weight_grams) : 200,
      };

      const { data, error: insertErr } = await supabase
        .from('products')
        .insert(row)
        .select()
        .single();

      if (insertErr) {
        console.error('[admin/products] insert error:', insertErr);
        if (insertErr.code === '23505') {
          return json(res, 409, { error: 'duplicate_slug', message: 'Slug já existe.' });
        }
        return json(res, 500, { error: 'db_error', message: 'Falha ao criar produto.' });
      }

      return json(res, 201, { product: data });
    }
  } catch (err) {
    console.error('[admin/products] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}
