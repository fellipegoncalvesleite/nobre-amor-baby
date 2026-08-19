import { getSupabase } from './_supabaseAdmin.js';
import { getAsaasConfig, mapAsaasEventToPaymentState, mapAsaasStatusToPaymentState } from './_asaas.js';
import { getWebhookLookupSequence, preservePaymentState } from './_commerceSecurity.js';

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

async function findOrderForWebhook(supabase, payment) {
  const lookupSequence = getWebhookLookupSequence(payment);
  for (const lookup of lookupSequence) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_code, payment_external_id, payment_last_event, payment_state, payment_method, payment_link_url, paid_at, paid_total_cents, total_cents')
      .eq(lookup.column, lookup.value)
      .maybeSingle();

    if (error) return { order: null, lookup: null, error };
    if (data) return { order: data, lookup, error: null };
  }
  return { order: null, lookup: null, error: null };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, asaas-access-token');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  const { webhookToken } = getAsaasConfig();
  if (!webhookToken) {
    console.error('[asaas-webhook] refusing webhook because ASAAS_WEBHOOK_TOKEN is not configured');
    return json(res, 500, {
      error: 'webhook_not_configured',
      message: 'Webhook authentication is not configured.',
    });
  }

  const receivedToken = req.headers['asaas-access-token'];
  if (receivedToken !== webhookToken) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid webhook token.' });
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
    const { order, lookup, error: orderErr } = await findOrderForWebhook(supabase, payment);
    if (orderErr) {
      console.error('[asaas-webhook] order lookup error:', orderErr);
      return json(res, 500, { error: 'db_error', message: 'Erro ao localizar pedido.' });
    }
    if (!order) {
      return json(res, 200, { ok: true, ignored: true, reason: 'order_not_found' });
    }

    const usedExternalReferenceFallback = lookup?.column === 'order_code' && Boolean(payment.id);
    if (
      usedExternalReferenceFallback &&
      order.payment_external_id &&
      order.payment_external_id !== payment.id
    ) {
      console.error('[asaas-webhook] payment reference conflict for order:', order.order_code);
      return json(res, 409, {
        error: 'payment_reference_conflict',
        message: 'O pedido já está vinculado a outra cobrança.',
      });
    }

    if (order.payment_last_event === eventId) {
      return json(res, 200, { ok: true, duplicate: true });
    }

    const proposedState = payment.status
      ? mapAsaasStatusToPaymentState(payment.status)
      : mapAsaasEventToPaymentState(event);
    const nextState = preservePaymentState(order.payment_state, proposedState);
    const becamePaid = nextState === 'paid' && order.payment_state !== 'paid';

    const paidAt = becamePaid
      ? order.paid_at || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString()
      : order.paid_at;
    const paidTotalCents = becamePaid
      ? Math.round(Number(payment.value || order.total_cents / 100) * 100)
      : order.paid_total_cents;

    const updates = {
      payment_provider: 'asaas',
      payment_method: order.payment_method || billingTypeToMethod(payment.billingType),
      payment_ref: payment.id || order.payment_external_id || null,
      payment_state: nextState,
      payment_external_id: payment.id || order.payment_external_id || null,
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

    return json(res, 200, {
      ok: true,
      orderCode: order.order_code,
      paymentState: nextState,
      preservedState: nextState !== proposedState,
      reconciledByExternalReference: usedExternalReferenceFallback,
    });
  } catch (err) {
    console.error('[asaas-webhook] unhandled:', { code: err?.code, message: err?.message });
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao processar webhook.' });
  }
}
