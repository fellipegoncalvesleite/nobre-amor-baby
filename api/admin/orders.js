/**
 * GET /api/admin/orders — list orders (protected by x-admin-key).
 *
 * Query params:
 *   status  — filter by status (optional)
 *   q       — search order_code, customer_name, customer_phone (optional)
 *   limit   — max rows (default 50, max 200)
 *
 * Response 200: { orders: [...] }
 * Errors:  401 / 405 / 500 — always JSON
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
    console.error('[admin/orders] ADMIN_API_KEY not set');
    return json(res, 500, { error: 'missing_env', message: 'Admin key not configured.' });
  }
  const provided = req.headers['x-admin-key'];
  if (provided !== adminKey) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid or missing x-admin-key.' });
  }

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) {
      return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
    }
    const supabase = createClient(sbUrl, sbKey);

    const { status: filterStatus, q, limit: limitStr } = req.query || {};
    const limit = Math.min(Number(limitStr) || 50, 200);

    let query = supabase
      .from('orders')
      .select('id, order_code, created_at, status, customer_name, customer_phone, total_cents, payment_method')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filterStatus && filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    if (q && q.trim().length > 0) {
      const search = q.trim();
      // Supabase OR filter: search in order_code, customer_name, customer_phone
      query = query.or(
        `order_code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[admin/orders] query error:', error);
      return json(res, 500, { error: 'db_error', message: 'Failed to fetch orders.' });
    }

    return json(res, 200, { orders: data || [] });
  } catch (err) {
    console.error('[admin/orders] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}
