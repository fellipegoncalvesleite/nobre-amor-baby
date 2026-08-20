import { getSupabase } from './_supabaseAdmin.js';
import { getAsaasConfig, mapAsaasEventToPaymentState, mapAsaasStatusToPaymentState } from './_asaas.js';
import { applyAsaasWebhookAtomically, parseProviderPaymentAmountCents } from './_atomicPaymentWebhook.js';
import {
  ensureOriginalPaymentAttempt,
  findOtherPaidPaymentForOrder,
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
const ATTEMPT_WEBHOOK_SELECT = 'id, order_id, attempt_key, attempt_kind, external_reference, payment_method, state, provider, provider_payment_id, provider_reported_state, provider_amount_cents, amount_verification_state, last_event_id';

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

export async function ensurePaymentRecordForWebhook(supabase, {
  order,
  attempt,
  lookup,
  payment,
  deferProviderIdentity = false,
}) {
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
    providerPaymentId: deferProviderIdentity ? null : payment?.id || null,
  });
}

function classifyAtomicError(error) {
  const message = String(error?.message || '');
  if (error?.code === '23505' || message.includes('payment_reference_conflict') || message.includes('payment_webhook_event_conflict')) {
    return {
      status: 409,
      body: {
        error: 'payment_reference_conflict',
        message: 'O pagamento já está vinculado a outro registro financeiro.',
      },
    };
  }
  return {
    status: 500,
    body: { error: 'db_error', message: 'Falha ao aplicar webhook de pagamento.' },
  };
}

export function createAsaasWebhookHandler({
  getSupabaseFn = getSupabase,
  getAsaasConfigFn = getAsaasConfig,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, asaas-access-token');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
    }

    const { webhookToken } = getAsaasConfigFn();
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

      const supabase = getSupabaseFn();
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
          deferProviderIdentity: true,
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

      if (!attempt) {
        console.error('[asaas-webhook] payment ownership missing before atomic application:', {
          orderCode: order.order_code,
          paymentId: payment.id || null,
          eventId,
        });
        return json(res, 500, {
          error: 'payment_ownership_missing',
          message: 'Falha ao localizar o proprietário financeiro do pagamento.',
        });
      }

      let atomicResult;
      try {
        atomicResult = await applyAsaasWebhookAtomically(supabase, {
          orderId: order.id,
          attemptId: attempt.id,
          eventId,
          payment,
          proposedState,
          paymentMethod: attempt.payment_method || order.payment_method || billingTypeToMethod(payment.billingType),
          paymentLinkUrl: payment.invoiceUrl || order.payment_link_url || null,
          paymentExpiresAt: toIsoTimestamp(payment.dueDate),
          paidAt: payment.clientPaymentDate || payment.confirmedDate || null,
        });
      } catch (atomicError) {
        console.error('[asaas-webhook] atomic payment application error:', {
          orderCode: order.order_code,
          attemptId: attempt.id,
          paymentId: payment.id || null,
          eventId,
          code: atomicError?.code,
          message: atomicError?.message,
        });
        const classified = classifyAtomicError(atomicError);
        return json(res, classified.status, classified.body);
      }

      if (atomicResult.result === 'rejected_amount') {
        const parsedAmount = parseProviderPaymentAmountCents(payment.value);
        console.error('[asaas-webhook] paid payment amount rejected:', {
          orderCode: order.order_code,
          attemptId: attempt.id,
          paymentId: payment.id || null,
          eventId,
          providerAmountCents: parsedAmount.cents,
          authoritativeTotalCents: order.total_cents,
          error: atomicResult.error_code,
          duplicate: Boolean(atomicResult.duplicate),
        });
        return json(res, 409, {
          error: atomicResult.error_code || 'payment_amount_mismatch',
          message: 'O valor pago informado pelo provedor não corresponde ao total autoritativo do pedido.',
          duplicate: Boolean(atomicResult.duplicate),
        });
      }

      if (atomicResult.duplicate) {
        return json(res, 200, { ok: true, duplicate: true });
      }

      if (atomicResult.result === 'additional_paid') {
        console.error('[asaas-webhook] additional paid payment received:', {
          orderCode: order.order_code,
          ledgerIds: [order.active_payment_attempt_id, attempt.id].filter(Boolean),
          providerPaymentIds: [order.payment_external_id, payment.id].filter(Boolean),
          eventId,
        });
        return json(res, 200, {
          ok: true,
          orderCode: atomicResult.order_code || order.order_code,
          paymentState: atomicResult.payment_state,
          additionalPaidAttempt: true,
        });
      }

      if (atomicResult.result === 'switch_to_paid') {
        return json(res, 200, {
          ok: true,
          orderCode: atomicResult.order_code || order.order_code,
          paymentState: atomicResult.payment_state,
          switchedToPaidAttempt: true,
        });
      }

      if (atomicResult.result === 'ignored_stale' || atomicResult.result === 'ignored_non_owner') {
        return json(res, 200, {
          ok: true,
          orderCode: atomicResult.order_code || order.order_code,
          paymentState: atomicResult.payment_state,
          ignored: true,
          reason: atomicResult.result === 'ignored_stale'
            ? 'stale_payment_transition'
            : 'stale_payment_attempt',
          attemptState: atomicResult.attempt_state,
        });
      }

      return json(res, 200, {
        ok: true,
        orderCode: atomicResult.order_code || order.order_code,
        paymentState: atomicResult.payment_state,
        attemptState: atomicResult.attempt_state,
        reconciledByPaymentAttempt: true,
        reconciledByExternalReference: lookup === 'attempt_external_reference' || lookup === 'order_external_reference',
      });
    } catch (err) {
      console.error('[asaas-webhook] unhandled:', { code: err?.code, message: err?.message });
      return json(res, 500, { error: 'internal_error', message: 'Erro interno ao processar webhook.' });
    }
  };
}

export default createAsaasWebhookHandler();
