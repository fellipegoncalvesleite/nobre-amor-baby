/**
 * /api/admin — unified admin mega-router
 *
 * Routes by ?resource=xxx&id=yyy:
 *   resource=orders       GET list, POST (none)
 *   resource=orders&id=X  GET detail, PATCH update
 *   resource=products     GET list, POST create
 *   resource=products&id=X PATCH update, DELETE
 *   resource=collections  GET list, POST create
 *   resource=collections&id=X PATCH update, DELETE
 *   resource=home         GET settings, PATCH update
 *   resource=upload       POST upload image
 *
 * All protected by x-admin-key header.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

/* ── helpers ─────────────────────────────────────── */

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

function sanitizeFilename(name) {
  return (name || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .slice(0, 60);
}

const ALLOWED_STATUSES = ['new', 'confirmed', 'rejected', 'cancelled', 'packing', 'shipped', 'done'];

/* ── handler ─────────────────────────────────────── */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  /* ── auth ──────────────────────────────────────── */
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return json(res, 500, { error: 'missing_env', message: 'Admin key not configured.' });
  if (req.headers['x-admin-key'] !== adminKey) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid or missing x-admin-key.' });
  }

  /* ── supabase ──────────────────────────────────── */
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
  const supabase = createClient(sbUrl, sbKey);

  const { resource, id, action } = req.query;

  try {
    switch (resource) {
      case 'orders':
        return id ? await handleOrderDetail(req, res, supabase, id) : await handleOrders(req, res, supabase);
      case 'products':
        return id ? await handleProductDetail(req, res, supabase, id) : await handleProducts(req, res, supabase);
      case 'collections':
        return id ? await handleCollectionDetail(req, res, supabase, id) : await handleCollections(req, res, supabase);
      case 'home':
        return await handleHome(req, res, supabase);
      case 'upload':
        return await handleUpload(req, res, supabase);
      default:
        return json(res, 400, { error: 'bad_request', message: 'Missing or invalid ?resource= parameter. Use: orders, products, collections, home, upload.' });
    }
  } catch (err) {
    console.error(`[admin/${resource}] unhandled:`, err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}

/* ══════════════════════════════════════════════════
   ORDERS — list
   ══════════════════════════════════════════════════ */
async function handleOrders(req, res, supabase) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET.' });
  }

  const { status, q, limit } = req.query;

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (q) {
    query = query.or(
      `order_code.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`
    );
  }

  const max = Math.min(parseInt(limit) || 50, 200);
  query = query.limit(max);

  const { data, error: queryErr } = await query;

  if (queryErr) {
    console.error('[admin/orders] list error:', queryErr);
    return json(res, 500, { error: 'db_error', message: 'Falha ao listar pedidos.' });
  }

  return json(res, 200, { orders: data || [] });
}

/* ══════════════════════════════════════════════════
   ORDERS — detail (GET / PATCH)
   ══════════════════════════════════════════════════ */
async function handleOrderDetail(req, res, supabase, orderCode) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or PATCH.' });
  }

  /* ── GET ───────────────────────────────────────── */
  if (req.method === 'GET') {
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('order_code', orderCode)
      .single();

    if (orderErr || !order) {
      return json(res, 404, { error: 'not_found', message: `Pedido "${orderCode}" não encontrado.` });
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .order('id', { ascending: true });

    order.items = items || [];
    return json(res, 200, { order });
  }

  /* ── PATCH ─────────────────────────────────────── */
  const body = req.body || {};
  const updates = {};

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return json(res, 400, {
        error: 'invalid_status',
        message: `Status inválido. Use: ${ALLOWED_STATUSES.join(', ')}.`
      });
    }
    updates.status = body.status;

    if (body.status === 'rejected') {
      if (!body.rejected_reason?.trim()) {
        return json(res, 400, {
          error: 'missing_reason',
          message: 'Motivo de rejeição é obrigatório.'
        });
      }
      updates.rejected_reason = body.rejected_reason.trim();
      updates.rejected_at = new Date().toISOString();
    }

    if (body.status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString();
    }

    // Reset timestamps when going back to 'new'
    if (body.status === 'new') {
      updates.rejected_reason = null;
      updates.rejected_at = null;
      updates.confirmed_at = null;
      updates.cancel_reason = null;
      updates.cancelled_at = null;
    }
  }

  if (body.manager_notes !== undefined) {
    updates.manager_notes = body.manager_notes;
  }

  if (Object.keys(updates).length === 0) {
    return json(res, 400, { error: 'no_changes', message: 'Nenhum campo para atualizar.' });
  }

  // Get current order (for stock management)
  const { data: currentOrder, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('order_code', orderCode)
    .single();

  if (fetchErr || !currentOrder) {
    return json(res, 404, { error: 'not_found', message: `Pedido "${orderCode}" não encontrado.` });
  }

  // Stock management
  if (updates.status) {
    const oldStatus = currentOrder.status;
    const newStatus = updates.status;

    // Confirming → decrement stock
    if (newStatus === 'confirmed' && oldStatus !== 'confirmed') {
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, qty')
        .eq('order_id', currentOrder.id);

      if (items?.length) {
        for (const item of items) {
          if (item.product_id) {
            const { error: stockErr } = await supabase.rpc('decrement_stock', {
              p_product_id: item.product_id,
              p_qty: item.qty,
            });
            if (stockErr) console.error('[stock] decrement error:', stockErr);
          }
        }
      }
    }

    // Un-confirming → increment stock back
    if (oldStatus === 'confirmed' && newStatus !== 'confirmed') {
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, qty')
        .eq('order_id', currentOrder.id);

      if (items?.length) {
        for (const item of items) {
          if (item.product_id) {
            const { error: stockErr } = await supabase.rpc('increment_stock', {
              p_product_id: item.product_id,
              p_qty: item.qty,
            });
            if (stockErr) console.error('[stock] increment error:', stockErr);
          }
        }
      }
    }
  }

  // Try update — if it fails due to missing columns, retry with only core fields
  let updated, updateErr;

  ({ data: updated, error: updateErr } = await supabase
    .from('orders')
    .update(updates)
    .eq('order_code', orderCode)
    .select()
    .single());

  // Retry without optional timestamp/reason columns if they don't exist yet
  if (updateErr) {
    const errMsg = (updateErr.message || '').toLowerCase();
    const isColumnError = errMsg.includes('column') || errMsg.includes('rejected_reason')
      || errMsg.includes('confirmed_at') || errMsg.includes('rejected_at')
      || errMsg.includes('cancel_reason') || errMsg.includes('cancelled_at');

    if (isColumnError) {
      console.warn('[admin/orders/patch] Column missing, retrying with core fields only:', updateErr.message);
      const coreUpdates = {};
      if (updates.status) coreUpdates.status = updates.status;
      if (updates.manager_notes !== undefined) coreUpdates.manager_notes = updates.manager_notes;

      if (Object.keys(coreUpdates).length > 0) {
        ({ data: updated, error: updateErr } = await supabase
          .from('orders')
          .update(coreUpdates)
          .eq('order_code', orderCode)
          .select()
          .single());
      }
    }
  }

  if (updateErr) {
    console.error('[admin/orders/patch] error:', updateErr);
    return json(res, 500, {
      error: 'db_error',
      message: 'Falha ao atualizar pedido.',
      detail: updateErr.message || String(updateErr),
    });
  }

  // Fetch items for the response
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', updated.id)
    .order('id', { ascending: true });

  updated.items = items || [];
  return json(res, 200, { order: updated });
}

/* ══════════════════════════════════════════════════
   PRODUCTS — list / create
   ══════════════════════════════════════════════════ */
async function handleProducts(req, res, supabase) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or POST.' });
  }

  /* ── GET: list ───────────────────────────────── */
  if (req.method === 'GET') {
    const { search, status: statusFilter, collection_id, limit } = req.query;

    let query = supabase.from('products').select('*');

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    if (statusFilter === 'public') query = query.eq('is_public', true);
    else if (statusFilter === 'private') query = query.eq('is_public', false);
    else if (statusFilter === 'in_stock') query = query.eq('in_stock', true);
    else if (statusFilter === 'out_of_stock') query = query.eq('in_stock', false);

    if (collection_id) query = query.eq('collection_id', collection_id);

    const max = Math.min(parseInt(limit) || 50, 200);
    query = query.order('created_at', { ascending: false }).limit(max);

    const { data, error: queryErr } = await query;

    if (queryErr) {
      console.error('[admin/products] list error:', queryErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao listar produtos.' });
    }

    return json(res, 200, { products: data || [] });
  }

  /* ── POST: create ──────────────────────────────── */
  const body = req.body || {};
  const { name, slug: rawSlug, description, tag, category_slug, size_group,
    price_cents, old_price_cents, stock_count, in_stock, featured, is_public,
    image_urls, size_options, collection_id,
    age_min_months, age_max_months, weight_grams } = body;

  if (!name?.trim()) return json(res, 400, { error: 'validation', message: 'Nome é obrigatório.' });
  if (!price_cents || price_cents <= 0) return json(res, 400, { error: 'validation', message: 'Preço deve ser > 0.' });
  if (!size_group?.trim()) return json(res, 400, { error: 'validation', message: 'size_group é obrigatório.' });

  const slug = rawSlug?.trim() || slugify(name);

  const row = {
    name: name.trim(),
    slug,
    description: description?.trim() || null,
    tag: tag?.trim() || null,
    category_slug: category_slug?.trim() || null,
    size_group: size_group.trim(),
    price_cents: parseInt(price_cents),
    old_price_cents: old_price_cents ? parseInt(old_price_cents) : null,
    stock_count: stock_count != null ? parseInt(stock_count) : 10,
    in_stock: in_stock !== false,
    featured: !!featured,
    is_public: is_public !== false,
    image_urls: image_urls || [],
    size_options: size_options || null,
    collection_id: collection_id || null,
    age_min_months: age_min_months != null ? parseInt(age_min_months) : null,
    age_max_months: age_max_months != null ? parseInt(age_max_months) : null,
    weight_grams: weight_grams != null ? parseInt(weight_grams) : null,
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

/* ══════════════════════════════════════════════════
   PRODUCTS — detail (PATCH / DELETE)
   ══════════════════════════════════════════════════ */
async function handleProductDetail(req, res, supabase, id) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use PATCH or DELETE.' });
  }

  /* ── DELETE ─────────────────────────────────── */
  if (req.method === 'DELETE') {
    const { error: delErr } = await supabase.from('products').delete().eq('id', id);
    if (delErr) {
      console.error('[admin/products/delete] error:', delErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao excluir produto.' });
    }
    return json(res, 200, { deleted: true });
  }

  /* ── PATCH ──────────────────────────────────── */
  const body = req.body || {};
  const updates = {};

  const fields = ['name', 'slug', 'description', 'tag', 'category_slug', 'size_group'];
  for (const f of fields) {
    if (body[f] !== undefined) updates[f] = body[f]?.trim?.() ?? body[f];
  }

  const intFields = ['price_cents', 'old_price_cents', 'stock_count', 'age_min_months', 'age_max_months', 'weight_grams'];
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
}

/* ══════════════════════════════════════════════════
   COLLECTIONS — list / create
   ══════════════════════════════════════════════════ */
async function handleCollections(req, res, supabase) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or POST.' });
  }

  /* ── GET: list ───────────────────────────────── */
  if (req.method === 'GET') {
    const { data, error: queryErr } = await supabase
      .from('collections')
      .select('*')
      .order('name', { ascending: true });

    if (queryErr) {
      console.error('[admin/collections] list error:', queryErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao listar coleções.' });
    }

    return json(res, 200, { collections: data || [] });
  }

  /* ── POST: create ──────────────────────────────── */
  const body = req.body || {};
  const { name, slug: rawSlug, description, is_active, image_url } = body;

  if (!name?.trim()) return json(res, 400, { error: 'validation', message: 'Nome é obrigatório.' });

  const slug = rawSlug?.trim() || slugify(name);

  const row = {
    name: name.trim(),
    slug,
    description: description?.trim() || null,
    is_active: is_active !== false,
    image_url: image_url?.trim() || null,
  };

  const { data, error: insertErr } = await supabase
    .from('collections')
    .insert(row)
    .select()
    .single();

  if (insertErr) {
    console.error('[admin/collections] insert error:', insertErr);
    if (insertErr.code === '23505') {
      return json(res, 409, { error: 'duplicate_slug', message: 'Slug já existe.' });
    }
    return json(res, 500, { error: 'db_error', message: 'Falha ao criar coleção.' });
  }

  return json(res, 201, { collection: data });
}

/* ══════════════════════════════════════════════════
   COLLECTIONS — detail (PATCH / DELETE)
   ══════════════════════════════════════════════════ */
async function handleCollectionDetail(req, res, supabase, id) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use PATCH or DELETE.' });
  }

  /* ── DELETE ─────────────────────────────────── */
  if (req.method === 'DELETE') {
    const { error: delErr } = await supabase.from('collections').delete().eq('id', id);
    if (delErr) {
      console.error('[admin/collections/delete] error:', delErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao excluir coleção.' });
    }
    return json(res, 200, { deleted: true });
  }

  /* ── PATCH ──────────────────────────────────── */
  const body = req.body || {};
  const updates = {};

  if (body.name !== undefined) updates.name = body.name?.trim();
  if (body.slug !== undefined) updates.slug = body.slug?.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;
  if (body.image_url !== undefined) updates.image_url = body.image_url || null;

  if (Object.keys(updates).length === 0) {
    return json(res, 400, { error: 'no_changes', message: 'Nenhum campo para atualizar.' });
  }

  const { data, error: updateErr } = await supabase
    .from('collections')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    console.error('[admin/collections/patch] error:', updateErr);
    if (updateErr.code === '23505') {
      return json(res, 409, { error: 'duplicate_slug', message: 'Slug já existe.' });
    }
    return json(res, 500, { error: 'db_error', message: 'Falha ao atualizar coleção.' });
  }

  if (!data) return json(res, 404, { error: 'not_found', message: 'Coleção não encontrada.' });

  return json(res, 200, { collection: data });
}

/* ══════════════════════════════════════════════════
   HOME — settings (GET / PATCH)
   ══════════════════════════════════════════════════ */
async function handleHome(req, res, supabase) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or PATCH.' });
  }

  const HOME_DEFAULTS = {
    key: 'home',
    collections_enabled: true,
    featured_enabled: true,
    collections_title: 'Coleções',
    featured_title: 'Destaques',
    collections_order: [],
    featured_order: [],
  };

  const isTableMissing = (err) =>
    err.code === '42P01' ||
    err.code === 'PGRST204' ||
    /does not exist|not found.*relation|homepage_settings/i.test(err.message || '');

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('homepage_settings')
      .select('*')
      .eq('key', 'home')
      .maybeSingle();

    if (error) {
      if (isTableMissing(error)) {
        return json(res, 503, { error: 'missing_table', message: 'Tabela homepage_settings não existe. Execute a migration 003_homepage_settings.sql no Supabase.' });
      }
      return json(res, 500, { error: 'db_error', message: error.message });
    }

    if (!data) {
      // Row missing — insert default and return it
      const { data: inserted, error: insertErr } = await supabase
        .from('homepage_settings')
        .insert(HOME_DEFAULTS)
        .select()
        .single();

      if (insertErr) return json(res, 500, { error: 'db_error', message: insertErr.message });
      return json(res, 200, { settings: inserted });
    }

    return json(res, 200, { settings: data });
  }

  /* ── PATCH ──────────────────────────────────── */
  const allowed = [
    'collections_enabled', 'featured_enabled',
    'collections_title', 'featured_title',
    'collections_order', 'featured_order',
  ];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }

  if (Object.keys(updates).length === 0) {
    return json(res, 400, { error: 'no_changes', message: 'No valid fields to update.' });
  }

  const { data, error } = await supabase
    .from('homepage_settings')
    .update(updates)
    .eq('key', 'home')
    .select()
    .maybeSingle();

  if (error) {
    if (isTableMissing(error)) {
      return json(res, 503, { error: 'missing_table', message: 'Tabela homepage_settings não existe. Execute a migration 003_homepage_settings.sql no Supabase.' });
    }
    return json(res, 500, { error: 'db_error', message: error.message });
  }

  if (!data) {
    // No row to update — upsert with defaults + updates
    const { data: inserted, error: insertErr } = await supabase
      .from('homepage_settings')
      .insert({ ...HOME_DEFAULTS, ...updates })
      .select()
      .single();

    if (insertErr) return json(res, 500, { error: 'db_error', message: insertErr.message });
    return json(res, 200, { settings: inserted });
  }

  return json(res, 200, { settings: data });
}

/* ══════════════════════════════════════════════════
   UPLOAD — image to Supabase Storage
   ══════════════════════════════════════════════════ */
async function handleUpload(req, res, supabase) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  const body = req.body || {};
  const { file, kind, filename } = body;

  if (!file) {
    return json(res, 400, { error: 'missing_file', message: 'Campo "file" é obrigatório (base64).' });
  }

  if (!kind || !['product', 'collection'].includes(kind)) {
    return json(res, 400, { error: 'invalid_kind', message: 'Campo "kind" deve ser "product" ou "collection".' });
  }

  // Parse base64 — support data URL format or raw base64
  let base64Data = file;
  let contentType = 'image/jpeg';
  if (file.startsWith('data:')) {
    const match = file.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return json(res, 400, { error: 'invalid_file', message: 'Formato de imagem inválido.' });
    }
    contentType = match[1];
    base64Data = match[2];
  }

  const buffer = Buffer.from(base64Data, 'base64');

  // Validate size (6MB)
  if (buffer.length > 6 * 1024 * 1024) {
    return json(res, 400, { error: 'file_too_large', message: 'Imagem excede 6MB.' });
  }

  // Generate storage path
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const safeName = sanitizeFilename(filename);
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${kind}/${yyyy}/${mm}/${uuid}_${safeName}.${ext}`;

  const bucket = kind === 'product' ? 'product-images' : 'collection-images';

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadErr) {
    console.error('[admin/upload] Supabase Storage error:', uploadErr);
    return json(res, 500, { error: 'upload_failed', message: `Falha ao enviar: ${uploadErr.message}` });
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = urlData?.publicUrl || '';

  return json(res, 200, { url, path, bucket });
}
