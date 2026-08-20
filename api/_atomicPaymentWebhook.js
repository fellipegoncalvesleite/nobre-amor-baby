function toProviderAmountText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value ?? '').trim();
}

export function parseProviderPaymentAmountCents(value) {
  const text = toProviderAmountText(value);
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return { valid: false, cents: null };

  const whole = Number(match[1]);
  const fractional = Number((match[2] || '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fractional)) {
    return { valid: false, cents: null };
  }

  const cents = whole * 100 + fractional;
  if (!Number.isSafeInteger(cents)) return { valid: false, cents: null };
  return { valid: true, cents };
}

function rpcError(error) {
  const wrapped = new Error(error?.message || 'Falha ao aplicar webhook de pagamento atomicamente.');
  wrapped.code = error?.code || 'db_error';
  wrapped.details = error?.details;
  wrapped.hint = error?.hint;
  return wrapped;
}

export async function applyAsaasWebhookAtomically(supabase, {
  orderId,
  attemptId,
  eventId,
  payment,
  proposedState,
  paymentMethod,
  paymentLinkUrl = payment?.invoiceUrl || null,
  paymentExpiresAt = null,
  paidAt = null,
}) {
  const parsedAmount = proposedState === 'paid'
    ? parseProviderPaymentAmountCents(payment?.value)
    : { valid: true, cents: null };

  const { data, error } = await supabase.rpc('apply_asaas_payment_webhook', {
    p_order_id: orderId,
    p_payment_attempt_id: attemptId,
    p_event_id: String(eventId),
    p_provider_payment_id: payment?.id || null,
    p_proposed_state: proposedState || 'pending',
    p_provider_amount_cents: parsedAmount.cents,
    p_provider_amount_valid: parsedAmount.valid,
    p_payment_method: paymentMethod || null,
    p_payment_link_url: paymentLinkUrl,
    p_payment_expires_at: paymentExpiresAt,
    p_paid_at: paidAt,
  });

  if (error) throw rpcError(error);
  if (!data || typeof data !== 'object') {
    const invalid = new Error('Resposta inválida da aplicação atômica do webhook.');
    invalid.code = 'invalid_atomic_webhook_result';
    throw invalid;
  }
  return data;
}
