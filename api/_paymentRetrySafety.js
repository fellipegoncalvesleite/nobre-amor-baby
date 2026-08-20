const ATTEMPT_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const ATTEMPT_KEY_MIN_LENGTH = 16;
const ATTEMPT_KEY_MAX_LENGTH = 128;

export function normalizePaymentAttemptKey(value) {
  const key = String(value || '').trim();
  if (
    key.length < ATTEMPT_KEY_MIN_LENGTH ||
    key.length > ATTEMPT_KEY_MAX_LENGTH ||
    !ATTEMPT_KEY_PATTERN.test(key)
  ) {
    const error = new Error('Chave da tentativa de pagamento inválida.');
    error.code = 'invalid_payment_attempt_key';
    throw error;
  }
  return key;
}

export function shouldApplyAttemptEventToOrder({
  isActiveAttempt,
  proposedState,
  orderPaymentExternalId,
  providerPaymentId,
}) {
  if (proposedState === 'paid') return true;
  if (proposedState === 'refunded') {
    return Boolean(
      isActiveAttempt &&
      providerPaymentId &&
      orderPaymentExternalId &&
      String(providerPaymentId) === String(orderPaymentExternalId),
    );
  }
  return Boolean(isActiveAttempt);
}


export function shouldApplyOriginalPaymentEventToOrder({
  hasActiveRetryAttempt,
  proposedState,
  orderPaymentExternalId,
  providerPaymentId,
}) {
  if (!hasActiveRetryAttempt) return true;
  if (
    providerPaymentId &&
    orderPaymentExternalId &&
    String(providerPaymentId) === String(orderPaymentExternalId)
  ) {
    return true;
  }
  return proposedState === 'paid';
}

export async function executePaymentRetry({
  order,
  attemptKey,
  paymentMethod,
  claimAttempt,
  recoverPayment,
  createPayment,
  persistPayment,
  markAttemptUncertain,
  markAttemptFailed,
}) {
  const normalizedAttemptKey = normalizePaymentAttemptKey(attemptKey);
  const attempt = await claimAttempt({
    order,
    attemptKey: normalizedAttemptKey,
    paymentMethod,
  });

  const recovery = await recoverPayment({ order, attempt });
  if (recovery?.kind === 'conflict') {
    return {
      kind: 'conflict',
      paymentIds: recovery.paymentIds || [],
      attempt,
    };
  }

  if (recovery?.kind === 'single') {
    await persistPayment({
      order,
      attempt,
      paymentResult: recovery,
      activateOrder: true,
      recovered: true,
    });
    return { kind: 'success', attempt, paymentResult: recovery, recovered: true };
  }

  if (recovery?.kind === 'artifact_unavailable') {
    await persistPayment({
      order,
      attempt,
      paymentResult: recovery,
      activateOrder: false,
      recovered: true,
    });
    return {
      kind: 'retryable',
      error: 'payment_artifact_recovery_pending',
      attempt,
      paymentResult: recovery,
    };
  }

  // Only a freshly claimed attempt with an exact provider lookup of `none`
  // may create. Any provider identity, uncertainty, or terminal state means
  // this same attempt key is no longer eligible for another POST /payments.
  if (attempt?.provider_payment_id || ['provider_uncertain', 'pending'].includes(attempt?.state)) {
    return {
      kind: 'retryable',
      error: 'payment_reconciliation_required',
      attempt,
    };
  }

  if (attempt?.state && attempt.state !== 'claimed') {
    return {
      kind: 'terminal',
      error: `payment_attempt_${attempt.state}`,
      attempt,
    };
  }

  let paymentResult;
  try {
    paymentResult = await createPayment({
      order,
      attempt,
      externalReference: attempt.external_reference,
    });
  } catch (error) {
    if (error?.paymentOutcomeUncertain) {
      await markAttemptUncertain({ order, attempt, error });
      return {
        kind: 'retryable',
        error: 'payment_reconciliation_required',
        attempt,
      };
    }

    await markAttemptFailed({ order, attempt, error });
    return {
      kind: 'terminal',
      error: 'payment_attempt_failed',
      attempt,
      cause: error,
    };
  }

  const activateOrder = !paymentResult?.requiresReconciliation;
  await persistPayment({
    order,
    attempt,
    paymentResult,
    activateOrder,
    recovered: false,
  });

  if (!activateOrder) {
    return {
      kind: 'retryable',
      error: 'payment_artifact_recovery_pending',
      attempt,
      paymentResult,
    };
  }

  return { kind: 'success', attempt, paymentResult, recovered: false };
}
