import { asaasRequest, mapAsaasStatusToPaymentState } from './_asaas.js';
import { applyAsaasWebhookAtomically } from './_atomicPaymentWebhook.js';

const TERMINAL_ACTION_STATES = new Set(['completed', 'superseded']);
const PAID_PROVIDER_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const CANCELLED_PROVIDER_STATUSES = new Set(['DELETED', 'CANCELLED']);
const REFUNDED_PROVIDER_STATUSES = new Set(['REFUNDED']);

function rpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function dbError(error, fallbackCode = 'payment_resolution_db_error') {
  const wrapped = new Error(error?.message || 'Falha ao persistir resolução financeira.');
  wrapped.code = error?.code || fallbackCode;
  wrapped.details = error?.details;
  wrapped.hint = error?.hint;
  return wrapped;
}

function isAmbiguousProviderError(error) {
  const status = Number(error?.status);
  return Boolean(error?.asaasTransportFailure || status === 408 || status >= 500);
}

function currencyToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function refundItems(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function refundMarker(item) {
  return String(item?.description || item?.externalReference || item?.notes || '').trim();
}

function refundStatus(item) {
  return String(item?.status || '').toUpperCase();
}

function refundCents(item) {
  return currencyToCents(item?.value ?? item?.amount ?? item?.refundedValue);
}


export function classifyProviderStatusForResolution(status) {
  const normalized = String(status || '').toUpperCase();
  if (['REFUND_REQUESTED', 'REFUND_IN_PROGRESS'].includes(normalized)) return 'provider_pending';
  if (['PARTIALLY_REFUNDED', 'REFUND_DENIED'].includes(normalized)) return 'manual_review';
  if (REFUNDED_PROVIDER_STATUSES.has(normalized)) return 'refunded';
  if (CANCELLED_PROVIDER_STATUSES.has(normalized)) return 'cancelled';
  return mapAsaasStatusToPaymentState(normalized);
}

export async function retrieveAsaasPayment({ providerPaymentId, requestImpl = asaasRequest }) {
  return requestImpl(`/payments/${encodeURIComponent(providerPaymentId)}`);
}

export async function retrieveAsaasPaymentRefunds({ providerPaymentId, requestImpl = asaasRequest }) {
  return requestImpl(`/payments/${encodeURIComponent(providerPaymentId)}/refunds`);
}

export async function deleteAsaasPayment({ providerPaymentId, requestImpl = asaasRequest }) {
  try {
    const response = await requestImpl(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'DELETE' });
    const responsePaymentId = String(response?.id || response?.payment?.id || response?.paymentId || '').trim();
    if (response?.deleted === true && responsePaymentId === String(providerPaymentId)) {
      return { kind: 'provider_pending', response };
    }
    return { kind: 'provider_uncertain', errorCode: 'provider_delete_acceptance_unverified', response };
  } catch (error) {
    if (isAmbiguousProviderError(error)) return { kind: 'provider_uncertain', error };
    return { kind: 'failed', error, errorCode: 'provider_delete_rejected' };
  }
}

export async function requestFullAsaasRefund({
  providerPaymentId,
  providerMarker,
  paymentAmountCents,
  allowMutation = true,
  requestImpl = asaasRequest,
}) {
  let history;
  try {
    history = refundItems(await retrieveAsaasPaymentRefunds({ providerPaymentId, requestImpl }));
  } catch (error) {
    if (isAmbiguousProviderError(error)) return { kind: 'provider_uncertain', error };
    return { kind: 'failed', error, errorCode: 'provider_refund_reconciliation_failed' };
  }

  const matching = history.find((item) => refundMarker(item) === providerMarker);
  if (matching) {
    const status = refundStatus(matching);
    const amountCents = refundCents(matching);
    if (status === 'DONE') {
      if (amountCents === paymentAmountCents) return { kind: 'completed', refund: matching };
      return { kind: 'manual_review', errorCode: 'provider_refund_amount_mismatch', refund: matching };
    }
    if (status === 'PENDING') {
      if (amountCents !== null && amountCents !== paymentAmountCents) {
        return { kind: 'manual_review', errorCode: 'provider_partial_refund_detected', refund: matching };
      }
      return { kind: 'provider_pending', refund: matching };
    }
    if (status === 'CANCELLED') return { kind: 'manual_review', errorCode: 'provider_refund_cancelled', refund: matching };
    return { kind: 'manual_review', errorCode: 'provider_refund_unknown_state', refund: matching };
  }

  const completedOtherRefundCents = history.reduce((sum, item) => {
    if (refundStatus(item) !== 'DONE') return sum;
    const cents = refundCents(item);
    return cents === null ? sum : sum + cents;
  }, 0);
  if (completedOtherRefundCents > 0) {
    return {
      kind: 'manual_review',
      errorCode: completedOtherRefundCents < paymentAmountCents
        ? 'provider_partial_refund_detected'
        : 'provider_unmatched_refund_detected',
    };
  }
  if (history.length > 0) {
    return { kind: 'manual_review', errorCode: 'provider_unmatched_refund_detected' };
  }

  if (!allowMutation) return { kind: 'not_found' };

  try {
    const refund = await requestImpl(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
      method: 'POST',
      body: { description: providerMarker },
    });
    return { kind: 'provider_pending', refund };
  } catch (error) {
    if (isAmbiguousProviderError(error)) return { kind: 'provider_uncertain', error };
    return { kind: 'failed', error, errorCode: 'provider_refund_rejected' };
  }
}

async function selectOpenClosure(supabase, orderId) {
  return supabase
    .from('order_closure_requests')
    .select('*')
    .eq('order_id', orderId)
    .neq('state', 'completed')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function hasOpenOrderClosure(supabase, orderId) {
  const { data, error } = await selectOpenClosure(supabase, orderId);
  if (error) throw dbError(error);
  return data || null;
}

async function requestClosureRow(supabase, { orderId, targetStatus, reason }) {
  const { data, error } = await supabase.rpc('request_order_closure', {
    p_order_id: orderId,
    p_target_status: targetStatus,
    p_reason: reason,
  });
  if (error) throw dbError(error);
  const closure = rpcRow(data);
  if (!closure) throw dbError({ message: 'order closure RPC returned no row' });
  return closure;
}

async function ensureResolutionAction(supabase, {
  orderId,
  attemptId,
  closureRequestId = null,
  kind,
  providerAction,
  providerPaymentId,
}) {
  const { data, error } = await supabase.rpc('ensure_payment_resolution_action', {
    p_order_id: orderId,
    p_payment_attempt_id: attemptId,
    p_closure_request_id: closureRequestId,
    p_kind: kind,
    p_provider_action: providerAction,
    p_provider_payment_id: providerPaymentId,
  });
  if (error) throw dbError(error);
  const action = rpcRow(data);
  if (!action) throw dbError({ message: 'payment resolution action RPC returned no row' });
  return action;
}

async function claimResolutionExecution(supabase, actionId) {
  const { data, error } = await supabase.rpc('claim_payment_resolution_execution', {
    p_action_id: actionId,
  });
  if (error) throw dbError(error);
  return rpcRow(data) || null;
}

async function updateAction(
  supabase,
  actionId,
  update,
  expectedStates = ['claimed', 'provider_call_in_flight', 'provider_pending', 'provider_uncertain'],
) {
  let query = supabase
    .from('payment_resolution_actions')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', actionId);
  if (expectedStates?.length) query = query.in('state', expectedStates);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw dbError(error);
  if (data) return data;
  return loadAction(supabase, actionId);
}

async function updateClosure(supabase, closureId, update) {
  if (!closureId) return null;
  const { data, error } = await supabase
    .from('order_closure_requests')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', closureId)
    .neq('state', 'completed')
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error);
  if (data) return data;
  return loadClosure(supabase, closureId);
}

async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) throw dbError(error || { message: 'order_not_found', code: 'P0002' });
  return data;
}

async function loadAttempts(supabase, orderId) {
  const { data, error } = await supabase
    .from('payment_attempts')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw dbError(error);
  return data || [];
}

async function loadActions(supabase, orderId) {
  const { data, error } = await supabase
    .from('payment_resolution_actions')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw dbError(error);
  return data || [];
}

async function loadAction(supabase, actionId) {
  const { data, error } = await supabase
    .from('payment_resolution_actions')
    .select('*')
    .eq('id', actionId)
    .single();
  if (error || !data) throw dbError(error || { message: 'payment_resolution_action_not_found', code: 'P0002' });
  return data;
}

async function loadClosure(supabase, closureId) {
  const { data, error } = await supabase
    .from('order_closure_requests')
    .select('*')
    .eq('id', closureId)
    .single();
  if (error || !data) throw dbError(error || { message: 'order_closure_not_found', code: 'P0002' });
  return data;
}

async function applySyntheticProviderState(supabase, { order, attempt, action, proposedState, payment = null }) {
  const providerPayment = payment || {
    id: attempt.provider_payment_id,
    value: Number(order.total_cents || 0) / 100,
  };
  return applyAsaasWebhookAtomically(supabase, {
    orderId: order.id,
    attemptId: attempt.id,
    eventId: `reconcile:${action.id}:${proposedState}`,
    payment: providerPayment,
    proposedState,
    paymentMethod: attempt.payment_method || order.payment_method || null,
    paymentLinkUrl: null,
    paymentExpiresAt: null,
    paidAt: null,
  });
}

async function markActionCompleted(supabase, action, { lastProviderStatus = null } = {}) {
  if (action.state === 'completed') return action;
  return updateAction(supabase, action.id, {
    state: 'completed',
    completed_at: new Date().toISOString(),
    last_provider_status: lastProviderStatus,
    last_error_code: null,
  }, ['claimed', 'provider_call_in_flight', 'provider_pending', 'provider_uncertain', 'failed', 'manual_review']);
}

async function finalizeClosure(supabase, closureId) {
  const { data, error } = await supabase.rpc('finalize_order_closure_if_resolved', {
    p_closure_request_id: closureId,
  });
  if (error) {
    const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    if (text.includes('payment_resolution_incomplete')) {
      const closure = await updateClosure(supabase, closureId, { state: 'waiting_provider' });
      return { resolutionPending: true, closure, order: null };
    }
    throw dbError(error);
  }
  return { resolutionPending: false, closure: await loadClosure(supabase, closureId), order: rpcRow(data) };
}

async function reconcileDeleteAction(supabase, { action, attempt, order, requestImpl }) {
  let payment;
  try {
    payment = await retrieveAsaasPayment({ providerPaymentId: action.provider_payment_id, requestImpl });
  } catch (error) {
    if (Number(error?.status) === 404) {
      if (action.provider_accepted_at) {
        await applySyntheticProviderState(supabase, { order, attempt, action, proposedState: 'cancelled' });
        return markActionCompleted(supabase, action, { lastProviderStatus: 'DELETED' });
      }
      return updateAction(supabase, action.id, {
        state: 'provider_uncertain',
        last_provider_status: null,
        last_error_code: 'provider_delete_404_unverified',
      });
    }
    if (isAmbiguousProviderError(error)) {
      return updateAction(supabase, action.id, { state: 'provider_uncertain', last_error_code: 'provider_delete_reconciliation_uncertain' });
    }
    return updateAction(supabase, action.id, { state: 'manual_review', last_error_code: 'provider_delete_reconciliation_failed' });
  }

  const status = String(payment?.status || '').toUpperCase();
  if (CANCELLED_PROVIDER_STATUSES.has(status)) {
    await applySyntheticProviderState(supabase, { order, attempt, action, proposedState: 'cancelled', payment });
    return markActionCompleted(supabase, action, { lastProviderStatus: status });
  }
  if (REFUNDED_PROVIDER_STATUSES.has(status)) {
    await applySyntheticProviderState(supabase, { order, attempt, action, proposedState: 'refunded', payment });
    return markActionCompleted(supabase, action, { lastProviderStatus: status });
  }
  if (PAID_PROVIDER_STATUSES.has(status)) {
    await applyAsaasWebhookAtomically(supabase, {
      orderId: order.id,
      attemptId: attempt.id,
      eventId: `reconcile:${action.id}:paid`,
      payment,
      proposedState: 'paid',
      paymentMethod: attempt.payment_method || order.payment_method || null,
      paymentLinkUrl: payment?.invoiceUrl || null,
      paymentExpiresAt: null,
      paidAt: payment?.clientPaymentDate || payment?.paymentDate || null,
    });
    const superseded = await updateAction(supabase, action.id, {
      state: 'superseded',
      completed_at: new Date().toISOString(),
      last_provider_status: status,
      last_error_code: null,
    });
    await ensureResolutionAction(supabase, {
      orderId: order.id,
      attemptId: attempt.id,
      closureRequestId: action.closure_request_id,
      kind: 'order_close_refund',
      providerAction: 'refund',
      providerPaymentId: action.provider_payment_id,
    });
    return superseded;
  }

  if (action.state === 'provider_uncertain') {
    return updateAction(supabase, action.id, {
      state: 'manual_review',
      last_provider_status: status || null,
      last_error_code: 'provider_delete_uncertainty_unresolved',
    });
  }
  return updateAction(supabase, action.id, {
    state: 'provider_pending',
    last_provider_status: status || null,
    last_error_code: null,
  });
}

async function executeResolutionAction(supabase, action, { requestImpl = asaasRequest } = {}) {
  if (TERMINAL_ACTION_STATES.has(action.state) || action.state === 'manual_review' || action.state === 'failed') return action;
  const [order, attempts] = await Promise.all([
    loadOrder(supabase, action.order_id),
    loadAttempts(supabase, action.order_id),
  ]);
  const attempt = attempts.find((candidate) => candidate.id === action.payment_attempt_id);
  if (!attempt) throw dbError({ message: 'payment_attempt_not_found', code: 'P0002' });

  if (action.provider_action === 'refund') {
    const reconciliation = await requestFullAsaasRefund({
      providerPaymentId: action.provider_payment_id,
      providerMarker: action.provider_marker,
      paymentAmountCents: Number(order.total_cents),
      allowMutation: false,
      requestImpl,
    });

    if (reconciliation.kind === 'completed') {
      await applySyntheticProviderState(supabase, { order, attempt, action, proposedState: 'refunded' });
      return markActionCompleted(supabase, action, { lastProviderStatus: 'DONE' });
    }
    if (reconciliation.kind === 'provider_pending') {
      return updateAction(supabase, action.id, { state: 'provider_pending', last_provider_status: 'PENDING', last_error_code: null });
    }
    if (reconciliation.kind === 'manual_review' || reconciliation.kind === 'failed') {
      return updateAction(supabase, action.id, {
        state: reconciliation.kind === 'failed' ? 'failed' : 'manual_review',
        last_error_code: reconciliation.errorCode || 'provider_refund_reconciliation_failed',
      });
    }
    if (reconciliation.kind === 'provider_uncertain') {
      return updateAction(supabase, action.id, { state: 'provider_uncertain', last_error_code: 'provider_refund_reconciliation_uncertain' });
    }

    if (action.state === 'provider_uncertain') {
      return updateAction(supabase, action.id, { state: 'manual_review', last_error_code: 'provider_refund_uncertainty_unresolved' });
    }
    if (action.state === 'provider_pending') return action;
    if (action.state === 'provider_call_in_flight') {
      return updateAction(supabase, action.id, { state: 'provider_uncertain', last_error_code: 'provider_refund_in_flight_recovery_required' });
    }

    try {
      const providerPayment = await retrieveAsaasPayment({ providerPaymentId: action.provider_payment_id, requestImpl });
      const providerResolutionState = classifyProviderStatusForResolution(providerPayment?.status);
      if (providerResolutionState === 'provider_pending') {
        return updateAction(supabase, action.id, {
          state: 'provider_pending',
          last_provider_status: String(providerPayment?.status || '').toUpperCase() || null,
          last_error_code: null,
        });
      }
      if (providerResolutionState === 'manual_review') {
        return updateAction(supabase, action.id, {
          state: 'manual_review',
          last_provider_status: String(providerPayment?.status || '').toUpperCase() || null,
          last_error_code: 'provider_refund_state_requires_review',
        });
      }
      if (providerResolutionState === 'refunded') {
        await applySyntheticProviderState(supabase, { order, attempt, action, proposedState: 'refunded', payment: providerPayment });
        return markActionCompleted(supabase, action, { lastProviderStatus: 'REFUNDED' });
      }
      if (providerResolutionState !== 'paid') {
        return updateAction(supabase, action.id, {
          state: 'manual_review',
          last_provider_status: String(providerPayment?.status || '').toUpperCase() || null,
          last_error_code: 'provider_refund_state_not_paid',
        });
      }
    } catch (error) {
      if (isAmbiguousProviderError(error)) {
        return updateAction(supabase, action.id, { state: 'provider_uncertain', last_error_code: 'provider_refund_status_uncertain' });
      }
      return updateAction(supabase, action.id, { state: 'manual_review', last_error_code: 'provider_refund_status_failed' });
    }

    const claimed = await claimResolutionExecution(supabase, action.id);
    if (!claimed) return loadAction(supabase, action.id);
    const result = await requestFullAsaasRefund({
      providerPaymentId: claimed.provider_payment_id,
      providerMarker: claimed.provider_marker,
      paymentAmountCents: Number(order.total_cents),
      allowMutation: true,
      requestImpl,
    });
    if (result.kind === 'completed') {
      await applySyntheticProviderState(supabase, { order, attempt, action: claimed, proposedState: 'refunded' });
      return markActionCompleted(supabase, claimed, { lastProviderStatus: 'DONE' });
    }
    if (result.kind === 'provider_pending') {
      return updateAction(supabase, claimed.id, {
        state: 'provider_pending',
        provider_accepted_at: new Date().toISOString(),
        last_provider_status: 'PENDING',
        last_error_code: null,
      });
    }
    if (result.kind === 'provider_uncertain') {
      return updateAction(supabase, claimed.id, { state: 'provider_uncertain', last_error_code: 'provider_refund_uncertain' });
    }
    return updateAction(supabase, claimed.id, {
      state: result.kind === 'manual_review' ? 'manual_review' : 'failed',
      last_error_code: result.errorCode || 'provider_refund_rejected',
    });
  }

  if (action.provider_action === 'delete') {
    if (action.state === 'provider_pending' || action.state === 'provider_uncertain' || action.state === 'provider_call_in_flight') {
      return reconcileDeleteAction(supabase, { action, attempt, order, requestImpl });
    }
    const claimed = await claimResolutionExecution(supabase, action.id);
    if (!claimed) return loadAction(supabase, action.id);
    const result = await deleteAsaasPayment({ providerPaymentId: claimed.provider_payment_id, requestImpl });
    if (result.kind === 'provider_pending') {
      return updateAction(supabase, claimed.id, {
        state: 'provider_pending',
        provider_accepted_at: new Date().toISOString(),
        last_error_code: null,
      });
    }
    if (result.kind === 'provider_uncertain') {
      return updateAction(supabase, claimed.id, {
        state: 'provider_uncertain',
        last_error_code: result.errorCode || 'provider_delete_uncertain',
      });
    }
    return updateAction(supabase, claimed.id, { state: 'failed', last_error_code: result.errorCode || 'provider_delete_rejected' });
  }

  return updateAction(supabase, action.id, { state: 'manual_review', last_error_code: 'unsupported_provider_action' });
}

async function ensureClosureActions(supabase, { order, closure, requestImpl }) {
  const attempts = await loadAttempts(supabase, order.id);
  for (const attempt of attempts) {
    if (attempt.state === 'refunded' || attempt.state === 'cancelled') continue;
    if (attempt.state === 'failed' && !attempt.provider_payment_id) continue;

    if (!attempt.provider_payment_id) {
      await updateClosure(supabase, closure.id, { state: 'manual_review', last_error_code: 'unresolved_payment_without_provider_identity' });
      continue;
    }

    let effectiveState = attempt.state;
    if (!['paid', 'pending', 'expired'].includes(effectiveState)) {
      try {
        const providerPayment = await retrieveAsaasPayment({ providerPaymentId: attempt.provider_payment_id, requestImpl });
        effectiveState = classifyProviderStatusForResolution(providerPayment?.status);
        const status = String(providerPayment?.status || '').toUpperCase();
        if (effectiveState === 'manual_review') {
          await updateClosure(supabase, closure.id, {
            state: 'manual_review',
            last_error_code: 'provider_refund_state_requires_review',
          });
          continue;
        }
        if (effectiveState === 'paid') {
          await applyAsaasWebhookAtomically(supabase, {
            orderId: order.id,
            attemptId: attempt.id,
            eventId: `closure:${closure.id}:${attempt.id}:paid`,
            payment: providerPayment,
            proposedState: 'paid',
            paymentMethod: attempt.payment_method || order.payment_method || null,
            paymentLinkUrl: providerPayment?.invoiceUrl || null,
            paymentExpiresAt: null,
            paidAt: providerPayment?.clientPaymentDate || providerPayment?.paymentDate || null,
          });
        } else if (CANCELLED_PROVIDER_STATUSES.has(status)) {
          const syntheticAction = { id: `closure-${closure.id}-${attempt.id}` };
          await applySyntheticProviderState(supabase, { order, attempt, action: syntheticAction, proposedState: 'cancelled', payment: providerPayment });
          continue;
        } else if (REFUNDED_PROVIDER_STATUSES.has(status)) {
          const syntheticAction = { id: `closure-${closure.id}-${attempt.id}` };
          await applySyntheticProviderState(supabase, { order, attempt, action: syntheticAction, proposedState: 'refunded', payment: providerPayment });
          continue;
        }
      } catch (error) {
        await updateClosure(supabase, closure.id, {
          state: 'manual_review',
          last_error_code: isAmbiguousProviderError(error) ? 'provider_reconciliation_uncertain' : 'provider_reconciliation_failed',
        });
        continue;
      }
    }

    if (effectiveState === 'paid' || effectiveState === 'provider_pending') {
      await ensureResolutionAction(supabase, {
        orderId: order.id,
        attemptId: attempt.id,
        closureRequestId: closure.id,
        kind: 'order_close_refund',
        providerAction: 'refund',
        providerPaymentId: attempt.provider_payment_id,
      });
    } else if (effectiveState === 'pending' || effectiveState === 'expired') {
      await ensureResolutionAction(supabase, {
        orderId: order.id,
        attemptId: attempt.id,
        closureRequestId: closure.id,
        kind: 'order_close_delete',
        providerAction: 'delete',
        providerPaymentId: attempt.provider_payment_id,
      });
    } else {
      await updateClosure(supabase, closure.id, { state: 'manual_review', last_error_code: 'unsupported_payment_resolution_state' });
    }
  }
}

export async function requestOrderClosure(supabase, {
  order,
  targetStatus,
  reason,
  requestImpl = asaasRequest,
}) {
  let closure = await requestClosureRow(supabase, {
    orderId: order.id,
    targetStatus,
    reason,
  });
  closure = await updateClosure(supabase, closure.id, { state: 'waiting_provider', last_error_code: null });

  await ensureClosureActions(supabase, { order, closure, requestImpl });
  const actions = await loadActions(supabase, order.id);
  for (const action of actions) {
    if (!TERMINAL_ACTION_STATES.has(action.state)) {
      await executeResolutionAction(supabase, action, { requestImpl });
    }
  }

  const latestActions = await loadActions(supabase, order.id);
  const blockedAction = latestActions.find((action) => action.state === 'manual_review' || action.state === 'failed');
  if (blockedAction) {
    const blockedClosure = await updateClosure(supabase, closure.id, {
      state: 'manual_review',
      last_error_code: blockedAction.last_error_code || 'payment_resolution_requires_review',
    });
    return { resolutionPending: true, closure: blockedClosure, order };
  }

  const latestClosure = await hasOpenOrderClosure(supabase, order.id);
  if (latestClosure?.state === 'manual_review' || latestClosure?.state === 'failed') {
    return { resolutionPending: true, closure: latestClosure, order };
  }
  const finalized = await finalizeClosure(supabase, closure.id);
  return {
    resolutionPending: finalized.resolutionPending,
    closure: finalized.closure,
    order: finalized.order || order,
  };
}

async function markRelatedActionForWebhook(supabase, attemptId, providerAction, update) {
  const { data, error } = await supabase
    .from('payment_resolution_actions')
    .select('*')
    .eq('payment_attempt_id', attemptId)
    .eq('provider_action', providerAction)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return null;

  let expectedStates = ['claimed', 'provider_call_in_flight', 'provider_pending', 'provider_uncertain'];
  if (update.state === 'completed') {
    expectedStates = [...expectedStates, 'failed', 'manual_review'];
  } else if (update.state === 'manual_review') {
    expectedStates = [...expectedStates, 'failed'];
  }
  return updateAction(supabase, data.id, update, expectedStates);
}

async function advanceRelatedClosure(supabase, closureId) {
  if (!closureId) return null;
  return finalizeClosure(supabase, closureId);
}

export async function processPaymentResolutionWebhook(supabase, {
  order,
  attempt,
  event,
  atomicResult,
  payment,
  requestImpl = asaasRequest,
}) {
  const normalizedEvent = String(event || '').toUpperCase();
  const openClosure = await hasOpenOrderClosure(supabase, order.id);
  let touchedAction = null;

  if (normalizedEvent === 'PAYMENT_DELETED') {
    touchedAction = await markRelatedActionForWebhook(supabase, attempt.id, 'delete', {
      state: 'completed',
      completed_at: new Date().toISOString(),
      last_provider_status: 'DELETED',
      last_error_code: null,
    });
  } else if (normalizedEvent === 'PAYMENT_REFUNDED') {
    touchedAction = await markRelatedActionForWebhook(supabase, attempt.id, 'refund', {
      state: 'completed',
      completed_at: new Date().toISOString(),
      last_provider_status: 'DONE',
      last_error_code: null,
    });
  } else if (
    normalizedEvent === 'PAYMENT_REFUND_REQUESTED'
    || normalizedEvent === 'PAYMENT_REFUND_IN_PROGRESS'
    || normalizedEvent === 'PAYMENT_PARTIALLY_REFUNDED'
    || normalizedEvent === 'PAYMENT_REFUND_DENIED'
  ) {
    const isPending = normalizedEvent === 'PAYMENT_REFUND_REQUESTED'
      || normalizedEvent === 'PAYMENT_REFUND_IN_PROGRESS';
    const update = isPending
      ? {
          state: 'provider_pending',
          last_provider_status: normalizedEvent,
          last_error_code: null,
        }
      : {
          state: 'manual_review',
          last_provider_status: normalizedEvent,
          last_error_code: normalizedEvent === 'PAYMENT_PARTIALLY_REFUNDED'
            ? 'provider_partial_refund_detected'
            : 'provider_refund_denied',
        };

    touchedAction = await markRelatedActionForWebhook(supabase, attempt.id, 'refund', update);
    if (!touchedAction) {
      const reviewAction = await ensureResolutionAction(supabase, {
        orderId: order.id,
        attemptId: attempt.id,
        closureRequestId: openClosure?.id || null,
        kind: 'provider_refund_review',
        providerAction: 'refund',
        providerPaymentId: attempt.provider_payment_id || payment?.id,
      });
      touchedAction = await updateAction(
        supabase,
        reviewAction.id,
        update,
        ['claimed', 'provider_call_in_flight', 'provider_pending', 'provider_uncertain', 'failed'],
      );
    }
  }

  if (atomicResult?.result === 'additional_paid') {
    const duplicateAction = await ensureResolutionAction(supabase, {
      orderId: order.id,
      attemptId: attempt.id,
      closureRequestId: openClosure?.id || null,
      kind: 'duplicate_paid_refund',
      providerAction: 'refund',
      providerPaymentId: attempt.provider_payment_id || payment?.id,
    });
    touchedAction = await executeResolutionAction(supabase, duplicateAction, { requestImpl });
  }

  if (openClosure && (atomicResult?.attempt_state === 'paid' || mapAsaasStatusToPaymentState(payment?.status) === 'paid')) {
    const { data: deleteAction, error: deleteErr } = await supabase
      .from('payment_resolution_actions')
      .select('*')
      .eq('payment_attempt_id', attempt.id)
      .eq('provider_action', 'delete')
      .maybeSingle();
    if (deleteErr) throw dbError(deleteErr);
    if (deleteAction && !TERMINAL_ACTION_STATES.has(deleteAction.state)) {
      await updateAction(supabase, deleteAction.id, {
        state: 'superseded',
        completed_at: new Date().toISOString(),
        last_provider_status: 'PAID',
        last_error_code: null,
      });
    }

    const refundAction = await ensureResolutionAction(supabase, {
      orderId: order.id,
      attemptId: attempt.id,
      closureRequestId: openClosure.id,
      kind: 'order_close_refund',
      providerAction: 'refund',
      providerPaymentId: attempt.provider_payment_id || payment?.id,
    });
    touchedAction = await executeResolutionAction(supabase, refundAction, { requestImpl });
  }

  const closureId = touchedAction?.closure_request_id || openClosure?.id || null;
  if (closureId) {
    if (touchedAction?.state === 'manual_review' || touchedAction?.state === 'failed') {
      await updateClosure(supabase, closureId, { state: 'manual_review', last_error_code: touchedAction.last_error_code });
    } else {
      await advanceRelatedClosure(supabase, closureId);
    }
  }

  return { action: touchedAction };
}

export async function listPaymentResolutions(supabase) {
  const openStates = ['claimed', 'provider_call_in_flight', 'provider_pending', 'provider_uncertain', 'failed', 'manual_review'];
  const { data, error } = await supabase
    .from('payment_resolution_actions')
    .select('id, order_id, payment_attempt_id, closure_request_id, kind, provider_action, state, provider, provider_payment_id, provider_marker, last_provider_status, last_error_code, provider_accepted_at, completed_at, created_at, updated_at')
    .in('state', openStates)
    .order('updated_at', { ascending: true });
  if (error) throw dbError(error);
  return data || [];
}

export async function reconcilePaymentResolution(supabase, actionId, { requestImpl = asaasRequest } = {}) {
  let action = await loadAction(supabase, actionId);
  action = await executeResolutionAction(supabase, action, { requestImpl });
  let closureResult = null;
  if (action.closure_request_id) {
    if (action.state === 'manual_review' || action.state === 'failed') {
      await updateClosure(supabase, action.closure_request_id, { state: 'manual_review', last_error_code: action.last_error_code });
    } else {
      closureResult = await finalizeClosure(supabase, action.closure_request_id);
    }
  }
  return { action, closureResult };
}
