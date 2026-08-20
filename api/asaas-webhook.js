import { getSupabase } from './_supabaseAdmin.js';
import { getAsaasConfig, mapAsaasEventToPaymentState, mapAsaasStatusToPaymentState } from './_asaas.js';
import { preservePaymentState } from './_commerceSecurity.js';
import {
  decidePaymentOrderTransition,
  ensureOriginalPaymentAttempt,
  findOtherPaidPaymentForOrder,
  isStalePaymentAttemptTransition,
  persistPaymentAttemptIdentity,
  validatePaidPaymentAmount,
} from './_paymentLedger.js';

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

const ORDER_WEBHOOK_SELECT = 'id, order_code, active_payment_attempt_id, payment_external_id, payment_last_event, payment_state, payment_method, payment_link_url, paid_at, paid_total_cents, total_cents';
const ATTEMPT_WEBHOOK_SELECT = 'id, order_id, attempt_key, attempt_kind, external_reference, payment_method, state, provider, provider_payment_id, last_event_id';

async function lookupOne(supabase, table, select, column, value) {
  if (!value) return { data: null, error: null };
  return supabase
    .from(table)
    .select(select)
    .eq(column, value)
    .maybeSingle();
}

async function attachActiveAttempt(supabase, order) {
  if (!order?.active_payment_attempt_id) return { order, attempt: null, error: null };
  const { data: attempt, error } = await lookupOne(
    supabase,
    'payment_attempts',
    ATTEMPT_WEBHOOK_SELECT,
    'id',
    order.active_payment_attempt_id,
  );
  return { order, attempt, error };
}

export async function findPaymentContextForWebhook(supabase, payment) {
  const paymentId = String(payment?.id || '').trim();
  const externalReference = String(payment?.externalReference || '').trim();

  if (paymentId) {
    const directOrder = await lookupOne(
      supabase,
      'orders',
      ORDER_WEBHOOK_SELECT,
      'payment_external_id',
      paymentId,
    );
    if (directOrder.error) return { order: null, attempt: null, lookup: null, error: directOrder.error };
    if (directOrder.data) {
      const attached = await attachActiveAttempt(supabase, directOrder.data);
      return {
        ...attached,
        lookup: 'order_payment_external_id',
      };
    }

    const byProviderId = await lookupOne(
      supabase,
      'payment_attempts',
      ATTEMPT_WEBHOOK_SELECT,
      'provider_payment_id',
      paymentId,
    );
    if (byProviderId.error) return { order: null, attempt: null, lookup: null, error: byProviderId.error };
    if (byProviderId.data) {
      const orderResult = await lookupOne(
        supabase,
        'orders',
        ORDER_WEBHOOK_SELECT,
        'id',
        byProviderId.data.order_id,
      );
      return {
        order: orderResult.data,
        attempt: byProviderId.data,
        lookup: 'attempt_provider_payment_id',
        error: orderResult.error,
      };
    }
  }

  if (externalReference) {
    const byExternalReference = await lookupOne(
      supabase,
      'payment_attempts',
      ATTEMPT_WEBHOOK_SELECT,
      'external_reference',
      externalReference,
    );
    if (byExternalReference.error) {
      return { order: null, attempt: null, lookup: null, error: byExternalReference.error };
    }
    if (byExternalReference.data) {
      const orderResult = await lookupOne(
        supabase,
        'orders',
        ORDER_WEBHOOK_SELECT,
        'id',
        byExternalReference.data.order_id,
      );
      return {
        order: orderResult.data,
        attempt: byExternalReference.data,
        lookup: 'attempt_external_reference',
        error: orderResult.error,
      };
    }

    const originalOrder = await lookupOne(
      supabase,
      'orders',
      ORDER_WEBHOOK_SELECT,
      'order_code',
      externalReference,
    );
    if (originalOrder.error) return { order: null, attempt: null, lookup: null, error: originalOrder.error };
    if (originalOrder.data) {
      return {
        order: originalOrder.data,
        attempt: null,
        lookup: 'order_external_reference',
        error: null,
      };
    }
  }

  return { order: null, attempt: null, lookup: null, error: null };
}

export async function findOtherPaidAttemptForWebhook(supabase, orderId, excludedAttemptId) {
  const result = await findOtherPaidPaymentForOrder(supabase, orderId, excludedAttemptId);
  return { attempt: result.payment, error: result.error };
}

export async function ensurePaymentRecordForWebhook(supabase, { order, attempt, lookup, payment }) {
  if (attempt) return attempt;

  const directOrderPaymentWithoutActiveLedger = Boolean(
    lookup === 'order_payment_external_id' &&
    !order?.active_payment_attempt_id &&
    payment?.id &&
    String(payment.id) === String(order?.payment_external_id),
  );
  const explicitOriginalReference = Boolean(
    payment?.externalReference &&
    String(payment.externalReference) === String(order?.order_code),
  );
  const isOriginalReference = lookup === 'order_external_reference' ||
    directOrderPaymentWithoutActiveLedger ||
    (lookup === 'order_payment_external_id' && explicitOriginalReference);

  if (!isOriginalReference) {
    if (lookup === 'order_payment_external_id') {
      const error = new Error('O pedido aponta para um pagamento sem proprietário financeiro persistido.');
      error.code = 'payment_ownership_missing';
      throw error;
    }
    return null;
  }

  return ensureOriginalPaymentAttempt(supabase, order, {
    providerPaymentId: payment?.id || null,
  });
}

async function updateAttemptForWebhook(supabase, attempt, payment, eventId, proposedState) {
  const nextState = preservePaymentState(attempt.state, proposedState);
  try {
    const updatedAttempt = await persistPaymentAttemptIdentity(supabase, attempt, {
      providerPaymentId: payment.id || attempt.provider_payment_id || null,
      state: nextState,
      lastEventId: eventId,
    });
    return { error: null, nextState, attempt: updatedAttempt };
  } catch (error) {
    return { error, nextState, attempt };
  }
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
    const { order, attempt: locatedAttempt, lookup, error: orderErr } = await findPaymentContextForWebhook(supabase, payment);
    if (orderErr) {
      console.error('[asaas-webhook] payment context lookup error:', orderErr);
      return json(res, 500, { error: 'db_error', message: 'Erro ao localizar pedido.' });
    }
    if (!order) {
      return json(res, 200, { ok: true, ignored: true, reason: 'order_not_found' });
    }

    const proposedState = payment.status
      ? mapAsaasStatusToPaymentState(payment.status)
      : mapAsaasEventToPaymentState(event);

    let attempt;
    try {
      attempt = await ensurePaymentRecordForWebhook(supabase, {
        order,
        attempt: locatedAttempt,
        lookup,
        payment,
      });
    } catch (ownershipError) {
      console.error('[asaas-webhook] payment ownership persistence error:', {
        orderCode: order.order_code,
        code: ownershipError?.code,
        message: ownershipError?.message,
      });
      const status = ownershipError?.code === 'payment_reference_conflict' ? 409 : 500;
      return json(res, status, {
        error: ownershipError?.code || 'db_error',
        message: ownershipError?.code === 'payment_reference_conflict'
          ? 'O pagamento já está vinculado a outro registro financeiro.'
          : 'Falha ao persistir a identidade do pagamento.',
      });
    }

    if (attempt) {
      if (
        attempt.provider_payment_id &&
        payment.id &&
        String(attempt.provider_payment_id) !== String(payment.id)
      ) {
        console.error('[asaas-webhook] payment attempt reference conflict:', {
          orderCode: order.order_code,
          attemptId: attempt.id,
        });
        return json(res, 409, {
          error: 'payment_reference_conflict',
          message: 'A tentativa de cobrança já está vinculada a outro pagamento.',
        });
      }
      if (attempt.last_event_id === eventId) {
        return json(res, 200, { ok: true, duplicate: true });
      }
    } else {
      if (order.payment_last_event === eventId) {
        return json(res, 200, { ok: true, duplicate: true });
      }
    }

    if (attempt) {
      const attemptUpdate = await updateAttemptForWebhook(supabase, attempt, payment, eventId, proposedState);
      if (attemptUpdate.error) {
        console.error('[asaas-webhook] payment attempt update error:', {
          orderCode: order.order_code,
          attemptId: attempt.id,
          code: attemptUpdate.error?.code,
          message: attemptUpdate.error?.message,
        });
        const status = attemptUpdate.error?.code === 'payment_reference_conflict' ? 409 : 500;
        return json(res, status, {
          error: attemptUpdate.error?.code || 'db_error',
          message: attemptUpdate.error?.code === 'payment_reference_conflict'
            ? 'O pagamento já está vinculado a outro registro financeiro.'
            : 'Falha ao atualizar tentativa de pagamento.',
        });
      }
      attempt = attemptUpdate.attempt;

      if (isStalePaymentAttemptTransition({ proposedState, persistedState: attemptUpdate.nextState })) {
        return json(res, 200, {
          ok: true,
          orderCode: order.order_code,
          ignored: true,
          reason: 'stale_payment_transition',
          attemptState: attemptUpdate.nextState,
        });
      }

      if (proposedState === 'paid') {
        const amountCheck = validatePaidPaymentAmount(payment.value, order.total_cents);
        if (!amountCheck.ok) {
          console.error('[asaas-webhook] paid payment amount mismatch:', {
            orderCode: order.order_code,
            attemptId: attempt.id,
            paymentId: payment.id || null,
            providerAmountCents: amountCheck.cents,
            authoritativeTotalCents: order.total_cents,
            error: amountCheck.error,
          });
          return json(res, 409, {
            error: amountCheck.error,
            message: 'O valor pago informado pelo provedor não corresponde ao total autoritativo do pedido.',
          });
        }
      }

      const isActiveAttempt = String(order.active_payment_attempt_id || '') === String(attempt.id) || Boolean(
        !order.active_payment_attempt_id && attempt.attempt_kind === 'original'
      );

      let otherPaidPayment = null;
      if (proposedState === 'refunded' && isActiveAttempt) {
        const otherPaid = await findOtherPaidAttemptForWebhook(supabase, order.id, attempt.id);
        if (otherPaid.error) {
          console.error('[asaas-webhook] paid-payment fallback lookup error:', otherPaid.error);
          return json(res, 500, { error: 'db_error', message: 'Falha ao reconciliar pagamentos do pedido.' });
        }
        otherPaidPayment = otherPaid.attempt;
      }

      const additionalPaidAttempt =
        proposedState === 'paid' &&
        order.payment_state === 'paid' &&
        order.payment_external_id &&
        payment.id &&
        String(order.payment_external_id) !== String(payment.id);

      if (additionalPaidAttempt) {
        console.error('[asaas-webhook] additional paid payment received:', {
          orderCode: order.order_code,
          ledgerIds: [order.active_payment_attempt_id, attempt.id].filter(Boolean),
          providerPaymentIds: [order.payment_external_id, payment.id].filter(Boolean),
        });
        return json(res, 200, {
          ok: true,
          orderCode: order.order_code,
          paymentState: order.payment_state,
          additionalPaidAttempt: true,
        });
      }

      const transition = decidePaymentOrderTransition({
        order,
        paymentRecord: attempt,
        proposedState,
        otherPaidPayment,
      });

      if (transition.action === 'switch_to_paid') {
        const fallback = transition.activePayment;
        const { error: fallbackErr } = await supabase
          .from('orders')
          .update({
            payment_provider: 'asaas',
            payment_method: fallback.payment_method || order.payment_method,
            payment_ref: fallback.provider_payment_id || order.payment_external_id || null,
            payment_state: 'paid',
            payment_external_id: fallback.provider_payment_id || order.payment_external_id || null,
            active_payment_attempt_id: fallback.id,
            payment_last_event: eventId,
          })
          .eq('id', order.id);
        if (fallbackErr) {
          console.error('[asaas-webhook] paid-payment fallback update error:', fallbackErr);
          return json(res, 500, { error: 'db_error', message: 'Falha ao preservar pagamento confirmado.' });
        }
        return json(res, 200, {
          ok: true,
          orderCode: order.order_code,
          paymentState: 'paid',
          switchedToPaidAttempt: true,
        });
      }

      if (transition.action === 'ignore') {
        return json(res, 200, {
          ok: true,
          orderCode: order.order_code,
          ignored: true,
          reason: 'stale_payment_attempt',
          attemptState: attemptUpdate.nextState,
        });
      }

    }

    const nextState = preservePaymentState(order.payment_state, proposedState);
    const becamePaid = nextState === 'paid' && order.payment_state !== 'paid';

    const paidAt = becamePaid
      ? order.paid_at || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString()
      : order.paid_at;
    const paidTotalCents = becamePaid
      ? validatePaidPaymentAmount(payment.value, order.total_cents).cents
      : order.paid_total_cents;

    const updates = {
      payment_provider: 'asaas',
      payment_method: attempt?.payment_method || order.payment_method || billingTypeToMethod(payment.billingType),
      payment_ref: payment.id || order.payment_external_id || null,
      payment_state: nextState,
      payment_external_id: payment.id || order.payment_external_id || null,
      payment_link_url: payment.invoiceUrl || order.payment_link_url || null,
      payment_expires_at: toIsoTimestamp(payment.dueDate),
      paid_at: paidAt,
      paid_total_cents: paidTotalCents,
      payment_last_event: eventId,
      ...(attempt ? { active_payment_attempt_id: attempt.id } : {}),
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
      reconciledByPaymentAttempt: Boolean(attempt),
      reconciledByExternalReference: lookup === 'attempt_external_reference' || lookup === 'order_external_reference',
    });
  } catch (err) {
    console.error('[asaas-webhook] unhandled:', { code: err?.code, message: err?.message });
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao processar webhook.' });
  }
}
