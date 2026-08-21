import { randomUUID } from 'node:crypto';

export const ORIGINAL_PAYMENT_ATTEMPT_KEY = 'original';
export const OPEN_RETRY_PAYMENT_STATES = Object.freeze(['claimed', 'provider_uncertain', 'pending']);
export const PAYMENT_ATTEMPT_SELECT = 'id, order_id, attempt_key, attempt_kind, external_reference, payment_method, state, provider, provider_payment_id, provider_reported_state, provider_amount_cents, amount_verification_state, last_event_id, created_at, updated_at';

function paymentReferenceConflict(message = 'O registro de pagamento já está vinculado a outro pagamento do provedor.') {
  const error = new Error(message);
  error.code = 'payment_reference_conflict';
  return error;
}

function paymentAttemptInProgress(openAttempt) {
  const error = new Error('Já existe uma tentativa de pagamento em andamento para este pedido.');
  error.code = 'payment_attempt_in_progress';
  error.openAttempt = openAttempt || null;
  return error;
}

function isRetryAttempt(row) {
  return (row?.attempt_kind || 'retry') === 'retry';
}

async function findAttemptByKey(supabase, orderId, attemptKey) {
  return supabase
    .from('payment_attempts')
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq('order_id', orderId)
    .eq('attempt_key', attemptKey)
    .maybeSingle();
}

export async function findOpenRetryPaymentAttempt(supabase, orderId) {
  const { data, error } = await supabase
    .from('payment_attempts')
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq('order_id', orderId)
    .eq('attempt_kind', 'retry')
    .in('state', OPEN_RETRY_PAYMENT_STATES)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { payment: null, error };
  return { payment: data?.[0] || null, error: null };
}

export async function claimRetryPaymentAttempt(supabase, order, attemptKey, paymentMethod) {
  const { data: existing, error: existingError } = await findAttemptByKey(supabase, order.id, attemptKey);
  if (existingError) throw existingError;
  if (existing) {
    if (!isRetryAttempt(existing)) {
      throw paymentReferenceConflict('A chave desta tentativa pertence a outro tipo de pagamento.');
    }
    if (existing.payment_method !== paymentMethod) {
      const error = new Error('A tentativa de pagamento já foi vinculada a outro método.');
      error.code = 'payment_attempt_method_conflict';
      throw error;
    }
    return existing;
  }

  const openLookup = await findOpenRetryPaymentAttempt(supabase, order.id);
  if (openLookup.error) throw openLookup.error;
  if (openLookup.payment) throw paymentAttemptInProgress(openLookup.payment);

  const row = {
    order_id: order.id,
    attempt_key: attemptKey,
    attempt_kind: 'retry',
    external_reference: `NA-RETRY-${randomUUID()}`,
    payment_method: paymentMethod,
    state: 'claimed',
    provider: 'asaas',
  };

  const { data, error } = await supabase
    .from('payment_attempts')
    .insert(row)
    .select(PAYMENT_ATTEMPT_SELECT)
    .single();

  if (error?.code === '23505') {
    const sameKey = await findAttemptByKey(supabase, order.id, attemptKey);
    if (sameKey.error) throw sameKey.error;
    if (sameKey.data) {
      if (sameKey.data.payment_method !== paymentMethod) {
        const methodError = new Error('A tentativa de pagamento já foi vinculada a outro método.');
        methodError.code = 'payment_attempt_method_conflict';
        throw methodError;
      }
      return sameKey.data;
    }

    const racedOpen = await findOpenRetryPaymentAttempt(supabase, order.id);
    if (racedOpen.error) throw racedOpen.error;
    if (racedOpen.payment) throw paymentAttemptInProgress(racedOpen.payment);
  }

  if (error || !data) throw error || new Error('Falha ao registrar a tentativa de pagamento.');
  return data;
}

function assertVerifiedPaidWrite({ state, providerReportedState, providerAmountCents, amountVerificationState }) {
  if (state !== 'paid') return;
  if (
    providerReportedState !== 'paid' ||
    amountVerificationState !== 'verified' ||
    !Number.isSafeInteger(providerAmountCents) ||
    providerAmountCents < 0
  ) {
    const error = new Error('Um pagamento só pode entrar no estado paid após validação autoritativa do valor.');
    error.code = 'unverified_paid_state';
    throw error;
  }
}

export async function persistPaymentAttemptIdentity(supabase, attempt, {
  providerPaymentId = null,
  state,
  lastEventId,
  providerReportedState,
  providerAmountCents,
  amountVerificationState,
} = {}) {
  assertVerifiedPaidWrite({ state, providerReportedState, providerAmountCents, amountVerificationState });
  if (
    attempt?.provider_payment_id &&
    providerPaymentId &&
    String(attempt.provider_payment_id) !== String(providerPaymentId)
  ) {
    throw paymentReferenceConflict();
  }

  const update = {
    ...(providerPaymentId ? { provider_payment_id: providerPaymentId } : {}),
    ...(state ? { state } : {}),
    ...(lastEventId !== undefined ? { last_event_id: lastEventId } : {}),
    ...(providerReportedState !== undefined ? { provider_reported_state: providerReportedState } : {}),
    ...(providerAmountCents !== undefined ? { provider_amount_cents: providerAmountCents } : {}),
    ...(amountVerificationState !== undefined ? { amount_verification_state: amountVerificationState } : {}),
    updated_at: new Date().toISOString(),
  };

  const result = await supabase
    .from('payment_attempts')
    .update(update)
    .eq('id', attempt.id);

  if (result?.error?.code === '23505') {
    throw paymentReferenceConflict('Este pagamento do provedor já pertence a outro registro financeiro.');
  }
  if (result?.error) throw result.error;
  return { ...attempt, ...update };
}

export async function ensureOriginalPaymentAttempt(supabase, order, {
  providerPaymentId = null,
  state,
  lastEventId,
  providerReportedState,
  providerAmountCents,
  amountVerificationState,
} = {}) {
  assertVerifiedPaidWrite({ state, providerReportedState, providerAmountCents, amountVerificationState });
  const { data: existing, error: existingError } = await findAttemptByKey(
    supabase,
    order.id,
    ORIGINAL_PAYMENT_ATTEMPT_KEY,
  );
  if (existingError) throw existingError;

  if (existing) {
    if ((existing.attempt_kind || 'retry') !== 'original') {
      throw paymentReferenceConflict('O registro reservado ao pagamento original já pertence a outra tentativa.');
    }
    const persisted = await persistPaymentAttemptIdentity(supabase, existing, {
      providerPaymentId,
      state,
      lastEventId,
      providerReportedState,
      providerAmountCents,
      amountVerificationState,
    });
    return { ...persisted, checkoutClaimCreated: false };
  }

  const row = {
    order_id: order.id,
    attempt_key: ORIGINAL_PAYMENT_ATTEMPT_KEY,
    attempt_kind: 'original',
    external_reference: order.order_code,
    payment_method: order.payment_method,
    state: state || 'claimed',
    provider: 'asaas',
    provider_payment_id: providerPaymentId || null,
    provider_reported_state: providerReportedState || null,
    provider_amount_cents: providerAmountCents ?? null,
    amount_verification_state: amountVerificationState || 'not_applicable',
    last_event_id: lastEventId || null,
  };

  const { data, error } = await supabase
    .from('payment_attempts')
    .insert(row)
    .select(PAYMENT_ATTEMPT_SELECT)
    .single();

  if (error?.code === '23505') {
    const raced = await findAttemptByKey(supabase, order.id, ORIGINAL_PAYMENT_ATTEMPT_KEY);
    if (raced.error) throw raced.error;
    if (raced.data) {
      if ((raced.data.attempt_kind || 'retry') !== 'original') {
        throw paymentReferenceConflict('O registro reservado ao pagamento original já pertence a outra tentativa.');
      }
      const persisted = await persistPaymentAttemptIdentity(supabase, raced.data, {
        providerPaymentId,
        state,
        lastEventId,
        providerReportedState,
        providerAmountCents,
        amountVerificationState,
      });
      return { ...persisted, checkoutClaimCreated: false };
    }
    if (providerPaymentId) {
      const { data: providerOwner, error: providerLookupError } = await supabase
        .from('payment_attempts')
        .select(PAYMENT_ATTEMPT_SELECT)
        .eq('provider', 'asaas')
        .eq('provider_payment_id', providerPaymentId)
        .maybeSingle();
      if (providerLookupError) throw providerLookupError;
      if (providerOwner) throw paymentReferenceConflict('Este pagamento do provedor já pertence a outro registro financeiro.');
    }
  }

  if (error || !data) throw error || new Error('Falha ao registrar o pagamento original.');
  return { ...data, checkoutClaimCreated: true };
}

export async function findOtherPaidPaymentForOrder(supabase, orderId, excludedPaymentRecordId) {
  const { data, error } = await supabase
    .from('payment_attempts')
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq('order_id', orderId)
    .eq('state', 'paid')
    .eq('amount_verification_state', 'verified')
    .limit(20);
  if (error) return { payment: null, error };
  const payment = (data || []).find((candidate) => String(candidate.id) !== String(excludedPaymentRecordId)) || null;
  return { payment, error: null };
}

export function decidePaymentOrderTransition({
  order,
  paymentRecord,
  proposedState,
  otherPaidPayment = null,
}) {
  const isActive = String(order?.active_payment_attempt_id || '') === String(paymentRecord?.id || '');
  const isImplicitOriginalOwner = !order?.active_payment_attempt_id && paymentRecord?.attempt_kind === 'original';
  const ownsOrder = isActive || isImplicitOriginalOwner;

  if (proposedState === 'paid') {
    return { action: 'apply', nextState: 'paid', activePayment: paymentRecord };
  }

  if (proposedState === 'refunded') {
    if (!ownsOrder) return { action: 'ignore', nextState: order?.payment_state, activePayment: null };
    if (otherPaidPayment) {
      return { action: 'switch_to_paid', nextState: 'paid', activePayment: otherPaidPayment };
    }
    return { action: 'apply', nextState: 'refunded', activePayment: paymentRecord };
  }

  if (!ownsOrder) {
    return { action: 'ignore', nextState: order?.payment_state, activePayment: null };
  }

  return { action: 'apply', nextState: proposedState, activePayment: paymentRecord };
}


export function isStalePaymentAttemptTransition({ proposedState, persistedState }) {
  return Boolean(
    proposedState &&
    persistedState &&
    String(proposedState) !== String(persistedState)
  );
}

function verificationFromCents(state, providerAmountCents, authoritativeTotalCents, invalidAmount = false) {
  const normalizedState = String(state || 'pending').toLowerCase();
  if (normalizedState !== 'paid') {
    return {
      state: normalizedState,
      providerReportedState: normalizedState,
      providerAmountCents: null,
      amountVerificationState: 'not_applicable',
      error: null,
    };
  }

  const validCents = Number.isSafeInteger(providerAmountCents) && providerAmountCents >= 0;
  const validTotal = Number.isSafeInteger(authoritativeTotalCents) && authoritativeTotalCents >= 0;
  if (!invalidAmount && validCents && validTotal && providerAmountCents === authoritativeTotalCents) {
    return {
      state: 'paid',
      providerReportedState: 'paid',
      providerAmountCents,
      amountVerificationState: 'verified',
      error: null,
    };
  }

  const error = invalidAmount || !validCents ? 'payment_amount_invalid' : 'payment_amount_mismatch';
  return {
    state: 'payment_review',
    providerReportedState: 'paid',
    providerAmountCents: validCents ? providerAmountCents : null,
    amountVerificationState: error === 'payment_amount_mismatch' ? 'mismatch' : 'invalid',
    error,
  };
}

export function derivePaymentAttemptVerification(state, providerValue, authoritativeTotalCents) {
  const normalizedState = String(state || 'pending').toLowerCase();
  if (normalizedState !== 'paid') return verificationFromCents(normalizedState, null, authoritativeTotalCents);
  const amountCheck = validatePaidPaymentAmount(providerValue, authoritativeTotalCents);
  return verificationFromCents('paid', amountCheck.cents, authoritativeTotalCents, !amountCheck.ok && amountCheck.error === 'payment_amount_invalid');
}

export function derivePaymentAttemptVerificationFromCents(state, providerAmountCents, authoritativeTotalCents) {
  return verificationFromCents(state, providerAmountCents, authoritativeTotalCents);
}

export function validatePaidPaymentAmount(value, authoritativeTotalCents) {
  const text = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : String(value ?? '').trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return { ok: false, cents: null, error: 'payment_amount_invalid' };

  const whole = Number(match[1]);
  const fractional = Number((match[2] || '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fractional)) {
    return { ok: false, cents: null, error: 'payment_amount_invalid' };
  }
  const cents = whole * 100 + fractional;
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, cents: null, error: 'payment_amount_invalid' };
  }
  if (!Number.isSafeInteger(authoritativeTotalCents) || cents !== authoritativeTotalCents) {
    return { ok: false, cents, error: 'payment_amount_mismatch' };
  }
  return { ok: true, cents };
}
