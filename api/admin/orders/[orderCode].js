/**
 * /api/admin/orders/[orderCode]
 *   GET   — single order detail (protected)
 *   PATCH — update status / notes (protected)
 *
 * Returns 200: { order: { ...orderFields, items: [...] } }
 * Errors:  400 / 401 / 404 / 405 / 500 — always JSON
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

const ALLOWED_STATUSES = ['new', 'confirmed', 'rejected'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or PATCH.' });
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

    /* ── PATCH: update order ────────────────────── */
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const updates = {};

      // Status change
      if (body.status !== undefined) {
        if (!ALLOWED_STATUSES.includes(body.status)) {
          return json(res, 400, {
            error: 'invalid_status',
            message: `Status inválido. Permitidos: ${ALLOWED_STATUSES.join(', ')}`,
          });
        }

        updates.status = body.status;

        if (body.status === 'confirmed') {
          updates.confirmed_at = new Date().toISOString();
          updates.rejected_at = null;
          updates.rejected_reason = null;
        } else if (body.status === 'rejected') {
          const reason = (body.rejected_reason || '').trim();
          if (!reason) {
            return json(res, 400, {
              error: 'missing_reason',
              message: 'rejected_reason é obrigatório ao recusar um pedido.',
            });
          }
          updates.rejected_at = new Date().toISOString();
          updates.confirmed_at = null;
          updates.rejected_reason = reason;
        } else if (body.status === 'new') {
          updates.confirmed_at = null;
          updates.rejected_at = null;
          updates.rejected_reason = null;
        }
      }

      // Manager notes (optional, can be sent alone)
      if (body.manager_notes !== undefined) {
        updates.manager_notes = body.manager_notes;
      }

      if (Object.keys(updates).length === 0) {
        return json(res, 400, { error: 'no_changes', message: 'Nenhum campo enviado para atualizar.' });
      }

      updates.updated_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from('orders')
        .update(updates)
        .eq('order_code', orderCode);

      if (updateErr) {
        console.error('[admin/orders/patch] update error:', updateErr);
        return json(res, 500, { error: 'db_error', message: 'Falha ao atualizar pedido.' });
      }

      // Fall through to fetch and return updated order
    }

    /* ── GET / return updated order ─────────────── */
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
