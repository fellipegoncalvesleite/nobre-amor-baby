/**
 * /api/admin/products/[id]
 *   PATCH  — update a product
 *   DELETE — delete a product
 *
 * Protected by x-admin-key header.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use PATCH or DELETE.' });
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

    const { id } = req.query;
    if (!id) return json(res, 400, { error: 'bad_request', message: 'Product id is required.' });

    /* ── DELETE ──────────────────────────────────── */
    if (req.method === 'DELETE') {
      const { error: delErr } = await supabase.from('products').delete().eq('id', id);
      if (delErr) {
        console.error('[admin/products/delete] error:', delErr);
        return json(res, 500, { error: 'db_error', message: 'Falha ao excluir produto.' });
      }
      return json(res, 200, { deleted: true });
    }

    /* ── PATCH ───────────────────────────────────── */
    const body = req.body || {};
    const updates = {};

    const fields = [
      'name', 'slug', 'description', 'tag', 'category_slug', 'size_group',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f]?.trim?.() ?? body[f];
    }

    const intFields = [
      'price_cents', 'old_price_cents', 'stock_count', 'age_min_months',
      'age_max_months', 'weight_grams',
    ];
    for (const f of intFields) {
      if (body[f] !== undefined) updates[f] = body[f] != null ? parseInt(body[f]) : null;
    }

    const boolFields = ['featured', 'is_public', 'in_stock'];
    for (const f of boolFields) {
      if (body[f] !== undefined) updates[f] = !!body[f];
    }

    if (body.size_options !== undefined) updates.size_options = body.size_options;
    if (body.image_urls !== undefined) updates.image_urls = body.image_urls;
    if (body.collection_id !== undefined) updates.collection_id = body.collection_id || null;

    if (Object.keys(updates).length === 0) {
      return json(res, 400, { error: 'no_changes', message: 'Nenhum campo para atualizar.' });
    }

    const { data, error: updateErr } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin/products/patch] error:', updateErr);
      if (updateErr.code === '23505') {
        return json(res, 409, { error: 'duplicate_slug', message: 'Slug já existe.' });
      }
      return json(res, 500, { error: 'db_error', message: 'Falha ao atualizar produto.' });
    }

    if (!data) return json(res, 404, { error: 'not_found', message: 'Produto não encontrado.' });

    return json(res, 200, { product: data });
  } catch (err) {
    console.error('[admin/products/id] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}
