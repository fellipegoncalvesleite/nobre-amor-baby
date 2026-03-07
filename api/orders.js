/**
 * POST /api/orders — create a new order in Supabase.
 *
 * Public endpoint (no admin key), called from the checkout flow.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Request body (JSON):
 *   {
 *     customer: { name, phone, email, message? },
 *     address:  { cep, street, number, complement?, neighborhood, city, uf },
 *     shipping: { feeCents, etaText, provider? },
 *     payment:  { method, paidTotalCents?, ref? },
 *     items:    [{ productId, productName, size, qty, unitPriceCents }],
 *   }
 *
 * Response 201: { orderId, orderCode, status: "new" }
 * Errors:  400 / 405 / 500 — always JSON
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

/* ── helpers ─────────────────────────────────────────── */

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

/** Generate order code: NA-YYYYMMDD-XXXXXX (timestamp + random) */
function generateOrderCode() {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `NA-${date}-${rand}`;
}

export default async function handler(req, res) {
  /* ── CORS ──────────────────────────────────────── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  try {
    /* ── env ──────────────────────────────────────── */
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) {
      console.error('[orders] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
    }

    const supabase = createClient(sbUrl, sbKey);

    /* ── validate body ───────────────────────────── */
    const body = req.body || {};
    const { customer, address: addr, shipping, payment, items } = body;

    if (!customer || !customer.name) {
      return json(res, 400, { error: 'invalid_request', message: 'customer.name is required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return json(res, 400, { error: 'invalid_request', message: 'items array is required and must not be empty.' });
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.qty || it.qty < 1) {
        return json(res, 400, { error: 'invalid_request', message: `items[${i}].qty must be >= 1.` });
      }
      if (it.unitPriceCents == null || it.unitPriceCents < 0) {
        return json(res, 400, { error: 'invalid_request', message: `items[${i}].unitPriceCents is required.` });
      }
    }

    /* ── compute totals server-side ──────────────── */
    const subtotalCents = items.reduce(
      (sum, it) => sum + Math.round(Number(it.unitPriceCents)) * Math.max(1, Number(it.qty)),
      0,
    );
    const shippingFeeCents = Number(shipping?.feeCents) || 0;
    const totalCents = subtotalCents + shippingFeeCents;

    /* ── generate unique order code (retry on collision) ── */
    let orderCode;
    let collision = true;
    for (let attempt = 0; attempt < 5 && collision; attempt++) {
      orderCode = generateOrderCode();
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('order_code', orderCode)
        .maybeSingle();
      if (!existing) collision = false;
    }
    if (collision) {
      return json(res, 500, { error: 'code_collision', message: 'Could not generate unique order code.' });
    }

    /* ── insert order ────────────────────────────── */
    const orderRow = {
      order_code:           orderCode,
      status:               'new',
      customer_name:        customer.name || null,
      customer_phone:       customer.phone || null,
      customer_email:       customer.email || null,
      customer_message:     customer.message || null,
      address_cep:          addr?.cep || null,
      address_street:       addr?.street || null,
      address_number:       addr?.number || null,
      address_complement:   addr?.complement || null,
      address_neighborhood: addr?.neighborhood || null,
      address_city:         addr?.city || null,
      address_uf:           addr?.uf || null,
      shipping_fee_cents:   shippingFeeCents,
      shipping_eta_text:    shipping?.etaText || null,
      shipping_provider:    shipping?.provider || shipping?.source || null,
      subtotal_cents:       subtotalCents,
      total_cents:          totalCents,
      paid_total_cents:     payment?.paidTotalCents ?? null,
      payment_method:       payment?.method || null,
      payment_ref:          payment?.ref || payment?.pixId || null,
    };

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert(orderRow)
      .select('id, order_code')
      .single();

    if (orderErr) {
      console.error('[orders] insert order error:', orderErr);
      return json(res, 500, { error: 'db_error', message: 'Failed to create order.' });
    }

    /* ── insert items ────────────────────────────── */
    const itemRows = items.map((it) => ({
      order_id:         order.id,
      product_id:       String(it.productId ?? it.id ?? ''),
      product_name:     it.productName ?? it.name ?? '',
      size:             it.size || '',
      qty:              Math.max(1, Number(it.qty)),
      unit_price_cents: Math.round(Number(it.unitPriceCents)),
      line_total_cents: Math.round(Number(it.unitPriceCents)) * Math.max(1, Number(it.qty)),
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
    if (itemsErr) {
      console.error('[orders] insert items error:', itemsErr);
      // Order was created but items failed — log but still return order info
    }

    console.log('[orders] created %s (id=%s, items=%d, total=%d)',
      orderCode, order.id, itemRows.length, totalCents);

    return json(res, 201, {
      orderId: order.id,
      orderCode: order.order_code,
      status: 'new',
    });
  } catch (err) {
    console.error('[orders] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao criar pedido.' });
  }
}
