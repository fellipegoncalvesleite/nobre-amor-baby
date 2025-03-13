/**
 * GET /api/admin/orders/[orderCode] — single order detail (protected).
 *
 * Returns 200: { order: { ...orderFields, items: [...] } }
 * Errors:  401 / 404 / 405 / 500 — always JSON
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET.' });
  }

  /* ── auth ──────────────────────────────────────── */
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return json(res, 500, { error: 'missing_env', message: 'Admin key not configured.' });
  }
  if (req.headers['x-admin-key'] !== adminKey) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid or missing x-admin-key.' });
  }

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) {
      return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
    }
    const supabase = createClient(sbUrl, sbKey);

    const { orderCode } = req.query;
    if (!orderCode) {
      return json(res, 400, { error: 'bad_request', message: 'orderCode is required.' });
    }

    /* ── fetch order ────────────────────────────── */
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('order_code', orderCode)
      .single();

    if (orderErr || !order) {
      return json(res, 404, { error: 'not_found', message: `Pedido ${orderCode} não encontrado.` });
    }

    /* ── fetch items ────────────────────────────── */
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .order('id', { ascending: true });

    if (itemsErr) {
      console.error('[admin/orders/detail] items query error:', itemsErr);
    }

    return json(res, 200, { order: { ...order, items: items || [] } });
  } catch (err) {
    console.error('[admin/orders/detail] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}
