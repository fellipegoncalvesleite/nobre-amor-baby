export const CHECKOUT_FINALIZATION_STATE = Object.freeze({
  IN_PROGRESS: 'in_progress',
  FINALIZED: 'finalized',
  RECONCILIATION_REQUIRED: 'reconciliation_required',
});

export async function resolvePersistedCheckout({ order, recoverPayment, persistRecovery }) {
  if (!order) {
    throw new Error('order is required');
  }

  if (order.checkout_finalization_state === CHECKOUT_FINALIZATION_STATE.FINALIZED) {
    return { kind: 'replay', order };
  }

  const recovery = await recoverPayment(order);

  if (recovery?.kind === 'single') {
    const update = {
      ...recovery.orderUpdate,
      checkout_finalization_state: CHECKOUT_FINALIZATION_STATE.FINALIZED,
    };
    await persistRecovery(update);
    return {
      kind: 'replay',
      order: { ...order, ...update },
      recovered: true,
    };
  }

  if (recovery?.kind === 'conflict') {
    return {
      kind: 'conflict',
      paymentIds: recovery.paymentIds || [],
    };
  }

  return {
    kind: 'pending',
    error:
      order.checkout_finalization_state === CHECKOUT_FINALIZATION_STATE.RECONCILIATION_REQUIRED
        ? 'payment_reconciliation_pending'
        : 'checkout_in_progress',
  };
}
