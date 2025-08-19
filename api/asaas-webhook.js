import { getSupabase } from './_supabaseAdmin.js';
import { getAsaasConfig, mapAsaasEventToPaymentState, mapAsaasStatusToPaymentState } from './_asaas.js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function billingTypeToMethod(billingType) {
  return String(billingType || '').toUpperCase() === 'CREDIT_CARD' ? 'cartao' : 'pix';
}

function toIsoTimestamp(value) {
  if (!value) return null;
  if (String(value).includes('T')) return value;
  const parsed = new Date(`${value}T23:59:59.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, asaas-access-token');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  /* Enforce the shared token whenever it's configured (forgery protection).
     If it is NOT configured we log loudly but still process the event, so a
     deployment that hasn't set the env var yet doesn't silently stop payment
     syncing. SET ASAAS_WEBHOOK_TOKEN (here + in the Asaas dashboard) to turn
     on protection — otherwise anyone could POST a fake "payment confirmed". */
  const { webhookToken } = getAsaasConfig();
  const receivedToken = req.headers['asaas-access-token'];
  if (webhookToken) {
    if (receivedToken !== webhookToken) {
      return json(res, 401, { error: 'unauthorized', message: 'Invalid webhook token.' });
    }
  } else {
    console.error('[asaas-webhook] SECURITY: ASAAS_WEBHOOK_TOKEN not set — webhook is UNAUTHENTICATED. Set it to enable forgery protection.');
  }

  try {
    const body = req.body || {};
    const payment = body.payment || {};
    const event = String(body.event || '');
    const eventId = body.id || `${event}:${payment.id || payment.externalReference || 'unknown'}`;

    if (!payment.id && !payment.externalReference) {
      return json(res, 400, { error: 'bad_request', message: 'Webhook sem pagamento identificável.' });
    }

    const supabase = getSupabase();
    let orderQuery = supabase
      .from('orders')
      .select('id, order_code, payment_last_event, payment_method, payment_link_url, paid_at, paid_total_cents, total_cents');

    if (payment.id) {
      orderQuery = orderQuery.eq('payment_external_id', payment.id);
    } else {
      orderQuery = orderQuery.eq('order_code', payment.externalReference);
    }

    const { data: order, error: orderErr } = await orderQuery.maybeSingle();
    if (orderErr) {
      console.error('[asaas-webhook] order lookup error:', orderErr);
      return json(res, 500, { error: 'db_error', message: 'Erro ao localizar pedido.' });
    }
    if (!order) {
      return json(res, 200, { ok: true, ignored: true, reason: 'order_not_found' });
    }

    if (order.payment_last_event === eventId) {
      return json(res, 200, { ok: true, duplicate: true });
    }

    const nextState = payment.status
      ? mapAsaasStatusToPaymentState(payment.status)
      : mapAsaasEventToPaymentState(event);
    const paidAt = nextState === 'paid'
      ? order.paid_at || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString()
      : order.paid_at;

    const paidTotalCents = nextState === 'paid'
      ? Math.round(Number(payment.value || order.total_cents / 100) * 100)
      : order.paid_total_cents;

    const updates = {
      payment_provider: 'asaas',
      payment_method: order.payment_method || billingTypeToMethod(payment.billingType),
      payment_ref: payment.id || null,
      payment_state: nextState,
      payment_external_id: payment.id || null,
      payment_link_url: payment.invoiceUrl || order.payment_link_url || null,
      payment_expires_at: toIsoTimestamp(payment.dueDate),
      paid_at: paidAt,
      paid_total_cents: paidTotalCents,
      payment_last_event: eventId,
    };

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', order.id);

    if (updateErr) {
      console.error('[asaas-webhook] update error:', updateErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao atualizar pedido.' });
    }

    return json(res, 200, { ok: true, orderCode: order.order_code, paymentState: nextState });
  } catch (err) {
    console.error('[asaas-webhook] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao processar webhook.' });
  }
}
