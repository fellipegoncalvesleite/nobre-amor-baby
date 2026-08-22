/**
 * POST /api/orders - authenticated, idempotent order creation in Supabase + Asaas.
 */
import { getSupabase, verifyUser } from './_supabaseAdmin.js';
import {
  createAsaasOrderPayment,
  recoverAsaasOrderPayment,
  getRequestBaseUrl,
  getRequestIp,
  normalizeCpfCnpj,
  toPaymentPayload,
} from './_asaas.js';
import { normalizeIdempotencyKey } from './_commerceSecurity.js';
import {
  derivePaymentAttemptVerification,
  derivePaymentAttemptVerificationFromCents,
  ensureOriginalPaymentAttempt,
  persistPaymentAttemptIdentity,
} from './_paymentLedger.js';
import {
  addPostgresIntCents,
  calculateAuthoritativeShipping,
  resolveCatalogItems,
} from './_serverShipping.js';
import {
  CHECKOUT_FINALIZATION_STATE,
  resolvePersistedCheckout,
} from './_checkoutFinalization.js';
import { reserveOrderInventory } from './_inventory.js';
import { hasOpenOrderClosure } from './_paymentResolution.js';
import {
  buildGlobalRule,
  buildIpRule,
  consumeRateLimits,
  respondRateLimited,
  respondRateLimitUnavailable,
} from './_rateLimit.js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function generateOrderCode() {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `NA-${date}-${rand}`;
}

async function generateUniqueOrderCode(supabase) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const orderCode = generateOrderCode();
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('order_code', orderCode)
      .maybeSingle();
    if (!existing) return orderCode;
  }
  throw new Error('Nao foi possivel gerar um codigo de pedido unico.');
}

function buildPaymentFailure(method, message) {
  return {
    provider: 'asaas',
    method,
    state: 'failed',
    url: null,
    copyPaste: null,
    qrCode: null,
    expiresAt: null,
    paidAt: null,
    externalId: null,
    lastEvent: 'PAYMENT_CREATION_FAILED',
    message,
  };
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeExpiryYear(value) {
  const digits = digitsOnly(value);
  if (digits.length === 2) return `20${digits}`;
  return digits.slice(0, 4);
}

function checkoutRequestError(message) {
  const error = new Error(message);
  error.code = 'invalid_request';
  error.status = 400;
  return error;
}

function validatePaymentDetails(payment, expectedMethod = null) {
  if (!['pix', 'cartao'].includes(payment?.method)) {
    throw checkoutRequestError('payment.method deve ser "pix" ou "cartao".');
  }
  if (expectedMethod && payment.method !== expectedMethod) {
    throw checkoutRequestError('payment.method não corresponde ao checkout existente.');
  }
  if (payment.method !== 'cartao') return;

  const card = payment.card || {};
  const number = digitsOnly(card.number);
  const ccv = digitsOnly(card.ccv);
  const month = digitsOnly(card.expiryMonth);
  const year = normalizeExpiryYear(card.expiryYear);

  if (!card.holderName?.trim()) throw checkoutRequestError('payment.card.holderName e obrigatorio.');
  if (number.length < 13 || number.length > 19) throw checkoutRequestError('payment.card.number e invalido.');
  if (!month.match(/^(0[1-9]|1[0-2])$/)) throw checkoutRequestError('payment.card.expiryMonth e invalido.');
  if (!year.match(/^\d{4}$/)) throw checkoutRequestError('payment.card.expiryYear e invalido.');
  if (ccv.length < 3 || ccv.length > 4) throw checkoutRequestError('payment.card.ccv e invalido.');
}

function isMissingColumnError(error, columnNames = []) {
  const errMsg = String(error?.message || '').toLowerCase();
  if (!errMsg) return false;
  if (!errMsg.includes('column') && !errMsg.includes('schema cache')) return false;
  return columnNames.some((name) => errMsg.includes(String(name).toLowerCase()));
}

async function findIdempotentOrder(supabase, userId, idempotencyKey) {
  return supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
}

function retryPayload(order) {
  return {
    orderId: order.id,
    orderCode: order.order_code,
    status: order.status || 'new',
    payment: toPaymentPayload(order),
    idempotentReplay: true,
  };
}

function errorBody(error, fallbackMessage) {
  return {
    error: error?.code || 'internal_error',
    message: error?.message || fallbackMessage,
  };
}

async function updateOrderPaymentMetadata(supabase, orderId, update) {
  let result = await supabase
    .from('orders')
    .update(update)
    .eq('id', orderId);

  if (result.error && isMissingColumnError(result.error, ['payment_error_message'])) {
    const fallbackUpdate = { ...update };
    delete fallbackUpdate.payment_error_message;
    result = await supabase
      .from('orders')
      .update(fallbackUpdate)
      .eq('id', orderId);
  }

  return result.error || null;
}

export async function markCheckoutReconciliationRequired(supabase, orderId) {
  const { error } = await supabase
    .from('orders')
    .update({
      checkout_finalization_state: CHECKOUT_FINALIZATION_STATE.RECONCILIATION_REQUIRED,
    })
    .eq('id', orderId)
    .neq('checkout_finalization_state', CHECKOUT_FINALIZATION_STATE.FINALIZED);
  return error || null;
}

async function respondToExistingCheckout({
  supabase,
  order,
  res,
  recoverPayment,
  ensureOriginalPayment = ensureOriginalPaymentAttempt,
  persistPaymentIdentity = persistPaymentAttemptIdentity,
}) {
  try {
    const resolution = await resolvePersistedCheckout({
      order,
      recoverPayment: (currentOrder) => recoverPayment({ order: currentOrder }),
      persistRecovery: async (update) => {
        const originalAttempt = await ensureOriginalPayment(supabase, order);
        const verification = derivePaymentAttemptVerificationFromCents(
          update.payment_state || originalAttempt.state,
          update.paid_total_cents,
          order.total_cents,
        );
        const persistedAttempt = await persistPaymentIdentity(supabase, originalAttempt, {
          providerPaymentId: update.payment_external_id || null,
          state: verification.state,
          lastEventId: update.payment_last_event,
          providerReportedState: verification.providerReportedState,
          providerAmountCents: verification.providerAmountCents,
          amountVerificationState: verification.amountVerificationState,
        });
        if (verification.error) {
          const amountError = new Error('A cobrança recuperada não passou na validação autoritativa do valor.');
          amountError.code = verification.error;
          throw amountError;
        }
        const error = await updateOrderPaymentMetadata(supabase, order.id, {
          ...update,
          active_payment_attempt_id: persistedAttempt.id,
        });
        if (error) {
          const syncError = new Error('Falha ao sincronizar a cobrança recuperada.');
          syncError.code = 'payment_reconciliation_sync_error';
          syncError.cause = error;
          throw syncError;
        }
      },
    });

    if (resolution.kind === 'replay') {
      return json(res, 200, retryPayload(resolution.order));
    }

    if (resolution.kind === 'conflict') {
      console.error('[orders] payment reconciliation conflict:', {
        orderCode: order.order_code,
        paymentIds: resolution.paymentIds,
      });
      return json(res, 409, {
        error: 'payment_reconciliation_conflict',
        message: 'Não foi possível conciliar a cobrança deste pedido automaticamente.',
        orderCode: order.order_code,
      });
    }

    const isReconciliationPending = ['payment_reconciliation_pending', 'payment_artifact_recovery_pending'].includes(resolution.error);
    return json(res, 409, {
      error: resolution.error,
      message: isReconciliationPending
        ? 'A cobrança deste pedido ainda está sendo conciliada. Tente novamente em instantes com a mesma tentativa.'
        : 'Este checkout ainda está sendo finalizado. Tente novamente em instantes com a mesma tentativa.',
      orderCode: order.order_code,
    });
  } catch (error) {
    if (error?.code === 'payment_reconciliation_sync_error') {
      console.error('[orders] recovered payment sync error:', {
        orderCode: order.order_code,
        message: error?.cause?.message || error.message,
      });
      return json(res, 500, {
        error: 'payment_reconciliation_sync_error',
        message: 'A cobrança foi localizada, mas a sincronização do pedido ainda não foi concluída.',
        orderCode: order.order_code,
      });
    }

    console.error('[orders] payment reconciliation lookup error:', {
      orderCode: order.order_code,
      code: error?.code,
      status: error?.status,
      message: error?.message,
    });
    return json(res, 503, {
      error: 'payment_reconciliation_unavailable',
      message: 'Não foi possível confirmar o estado da cobrança agora. Tente novamente em instantes com a mesma tentativa.',
      orderCode: order.order_code,
    });
  }
}

export function createOrdersHandler(overrides = {}) {
  const deps = {
    verifyUser,
    getSupabase,
    findIdempotentOrder,
    generateUniqueOrderCode,
    resolveCatalogItems,
    calculateAuthoritativeShipping,
    createAsaasOrderPayment,
    recoverAsaasOrderPayment,
    ensureOriginalPaymentAttempt,
    persistPaymentAttemptIdentity,
    reserveOrderInventory,
    hasOpenOrderClosure,
    consumeRateLimits,
    ...overrides,
  };

  return async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  try {
    const { user } = await deps.verifyUser(req);
    if (!user) {
      return json(res, 401, { error: 'unauthorized', message: 'Token inválido ou ausente.' });
    }

    const authoritativeEmail = String(user.email || '').trim();
    if (!authoritativeEmail) {
      return json(res, 401, { error: 'unauthorized', message: 'Conta autenticada sem e-mail válido.' });
    }

    const body = req.body || {};
    const { customer, address: addr, payment, items } = body;
    let idempotencyKey;
    try {
      idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
    } catch (error) {
      return json(res, 400, errorBody(error, 'Idempotency key inválida.'));
    }

    const supabase = deps.getSupabase();
    let rateLimit;
    try {
      rateLimit = await deps.consumeRateLimits(supabase, [
        { scope: 'checkout:user', kind: 'user', subject: user.id, limit: 12, windowSeconds: 600 },
        buildIpRule(req, { scope: 'checkout:ip', limit: 30, windowSeconds: 600 }),
        buildGlobalRule({ scope: 'checkout:global', limit: 500, windowSeconds: 600 }),
      ]);
    } catch (error) {
      console.error('[orders] rate limiter unavailable:', error?.code || 'rate_limit_unavailable');
      return respondRateLimitUnavailable(res);
    }
    if (!rateLimit.allowed) return respondRateLimited(res, rateLimit);

    let order = null;
    let itemRows = null;
    let resumingPaymentCreation = false;
    const { data: existingOrder, error: existingErr } = await deps.findIdempotentOrder(
      supabase,
      user.id,
      idempotencyKey,
    );
    if (existingErr) {
      console.error('[orders] idempotency lookup error:', existingErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao verificar repetição do pedido.' });
    }
    if (existingOrder) {
      let openClosure;
      try {
        openClosure = await deps.hasOpenOrderClosure(supabase, existingOrder.id);
      } catch (closureError) {
        console.error('[orders] closure lookup error:', { code: closureError?.code, message: closureError?.message });
        return json(res, 500, { error: 'db_error', message: 'Falha ao verificar o encerramento do pedido.' });
      }
      if (openClosure) {
        return json(res, 409, {
          error: 'order_closure_in_progress',
          message: 'Este checkout está em processo de cancelamento ou recusa e não pode criar nem recuperar outra cobrança.',
          orderCode: existingOrder.order_code,
        });
      }

      const inventoryState = existingOrder.inventory_state || 'legacy_untracked';
      if (['released', 'consumed'].includes(inventoryState)) {
        return json(res, 409, {
          error: 'inventory_checkout_terminal',
          message: 'Este checkout já encerrou seu ciclo de estoque e não pode criar ou recuperar outra cobrança.',
          orderCode: existingOrder.order_code,
        });
      }

      if (inventoryState === 'unreserved') {
        if (existingOrder.checkout_finalization_state !== CHECKOUT_FINALIZATION_STATE.IN_PROGRESS) {
          return json(res, 409, {
            error: 'inventory_reservation_conflict',
            message: 'Este checkout não pode reservar estoque no estado atual.',
            orderCode: existingOrder.order_code,
          });
        }

        try {
          validatePaymentDetails(payment, existingOrder.payment_method);
        } catch (error) {
          return json(res, Number(error?.status) || 400, errorBody(error, 'Dados de pagamento inválidos.'));
        }

        try {
          order = await deps.reserveOrderInventory(supabase, existingOrder.id);
        } catch (inventoryErr) {
          return json(res, Number(inventoryErr?.status) || 500, {
            error: inventoryErr?.code || 'inventory_transaction_failed',
            message: inventoryErr?.message || 'Falha ao reservar o estoque do pedido.',
            orderId: existingOrder.id,
            orderCode: existingOrder.order_code,
          });
        }

        const { data: persistedItems, error: persistedItemsErr } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', existingOrder.id)
          .order('id', { ascending: true });
        if (persistedItemsErr || !persistedItems?.length) {
          console.error('[orders] persisted item recovery error:', persistedItemsErr);
          return json(res, 500, {
            error: 'db_error',
            message: 'O estoque foi reservado, mas os itens do checkout não puderam ser recuperados.',
            orderId: existingOrder.id,
            orderCode: existingOrder.order_code,
          });
        }
        itemRows = persistedItems;
        resumingPaymentCreation = true;
      } else if (
        inventoryState === 'reserved'
        && existingOrder.checkout_finalization_state === CHECKOUT_FINALIZATION_STATE.IN_PROGRESS
      ) {
        const { data: originalAttempt, error: originalAttemptErr } = await supabase
          .from('payment_attempts')
          .select('id')
          .eq('order_id', existingOrder.id)
          .eq('attempt_kind', 'original')
          .maybeSingle();
        if (originalAttemptErr) {
          console.error('[orders] original payment resume lookup error:', originalAttemptErr);
          return json(res, 500, {
            error: 'db_error',
            message: 'Falha ao verificar a cobrança do checkout reservado.',
            orderCode: existingOrder.order_code,
          });
        }
        if (originalAttempt) {
          return respondToExistingCheckout({
            supabase,
            order: existingOrder,
            res,
            recoverPayment: deps.recoverAsaasOrderPayment,
            ensureOriginalPayment: deps.ensureOriginalPaymentAttempt,
            persistPaymentIdentity: deps.persistPaymentAttemptIdentity,
          });
        }

        try {
          validatePaymentDetails(payment, existingOrder.payment_method);
        } catch (error) {
          return json(res, Number(error?.status) || 400, errorBody(error, 'Dados de pagamento inválidos.'));
        }

        const { data: persistedItems, error: persistedItemsErr } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', existingOrder.id)
          .order('id', { ascending: true });
        if (persistedItemsErr || !persistedItems?.length) {
          console.error('[orders] reserved checkout item recovery error:', persistedItemsErr);
          return json(res, 500, {
            error: 'db_error',
            message: 'Os itens do checkout reservado não puderam ser recuperados.',
            orderCode: existingOrder.order_code,
          });
        }
        order = existingOrder;
        itemRows = persistedItems;
        resumingPaymentCreation = true;
      } else {
        return respondToExistingCheckout({
          supabase,
          order: existingOrder,
          res,
          recoverPayment: deps.recoverAsaasOrderPayment,
          ensureOriginalPayment: deps.ensureOriginalPaymentAttempt,
          persistPaymentIdentity: deps.persistPaymentAttemptIdentity,
        });
      }
    }

    if (!resumingPaymentCreation) {
      if (!customer?.name?.trim()) {
        return json(res, 400, { error: 'invalid_request', message: 'customer.name e obrigatorio.' });
      }
      if (!customer?.phone?.trim()) {
        return json(res, 400, { error: 'invalid_request', message: 'customer.phone e obrigatorio.' });
      }
      if (!normalizeCpfCnpj(customer?.cpfCnpj).match(/^\d{11}$|^\d{14}$/)) {
        return json(res, 400, { error: 'invalid_request', message: 'customer.cpfCnpj e obrigatorio.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return json(res, 400, { error: 'invalid_request', message: 'items e obrigatorio e nao pode estar vazio.' });
      }
      try {
        validatePaymentDetails(payment);
      } catch (error) {
        return json(res, Number(error?.status) || 400, errorBody(error, 'Dados de pagamento inválidos.'));
      }

      let resolvedItems;
      let subtotalCents;
      try {
        ({ resolvedItems, subtotalCents } = await deps.resolveCatalogItems({ supabase, items }));
      } catch (error) {
        if (Number(error?.status) >= 500) {
          console.error('[orders] catalog authority error:', { code: error?.code, message: error?.message });
        }
        return json(res, Number(error?.status) || 500, errorBody(error, 'Falha ao validar os produtos do pedido.'));
      }

      let authoritativeShipping;
      try {
        authoritativeShipping = await deps.calculateAuthoritativeShipping({
          toCep: addr?.cep,
          resolvedItems,
        });
      } catch (error) {
        if (Number(error?.status) >= 500) {
          console.error('[orders] shipping authority error:', { code: error?.code, message: error?.message });
        }
        return json(res, Number(error?.status) || 500, errorBody(error, 'Falha ao calcular o frete do pedido.'));
      }

      const shippingFeeCents = authoritativeShipping.feeCents;
      let totalCents;
      try {
        totalCents = addPostgresIntCents(subtotalCents, shippingFeeCents, 'total do pedido');
      } catch (error) {
        return json(res, Number(error?.status) || 400, errorBody(error, 'Total do pedido inválido.'));
      }
      const orderCode = await deps.generateUniqueOrderCode(supabase);
      const orderInsert = {
        order_code: orderCode,
        status: 'new',
        user_id: user.id,
        idempotency_key: idempotencyKey,
        customer_name: customer.name.trim(),
        customer_phone: customer.phone.trim(),
        customer_email: authoritativeEmail,
        customer_cpf_cnpj: normalizeCpfCnpj(customer.cpfCnpj),
        customer_message: customer.message?.trim() || null,
        address_cep: addr?.cep || null,
        address_street: addr?.street || null,
        address_number: addr?.number || null,
        address_complement: addr?.complement || null,
        address_neighborhood: addr?.neighborhood || null,
        address_city: authoritativeShipping.destination?.city || addr?.city || null,
        address_uf: authoritativeShipping.destination?.uf || addr?.uf || null,
        shipping_fee_cents: shippingFeeCents,
        shipping_eta_text: authoritativeShipping.etaText || null,
        shipping_provider: authoritativeShipping.source || null,
        subtotal_cents: subtotalCents,
        total_cents: totalCents,
        payment_method: payment.method,
        payment_state: 'pending',
        payment_provider: 'asaas',
        checkout_finalization_state: CHECKOUT_FINALIZATION_STATE.IN_PROGRESS,
      };

      let orderErr;
      ({ data: order, error: orderErr } = await supabase
        .from('orders')
        .insert(orderInsert)
        .select('*')
        .single());

      if (orderErr?.code === '23505') {
        const { data: racedOrder, error: racedErr } = await deps.findIdempotentOrder(supabase, user.id, idempotencyKey);
        if (racedErr) {
          console.error('[orders] idempotency race lookup error:', racedErr);
          return json(res, 500, {
            error: 'db_error',
            message: 'Falha ao resolver uma tentativa simultânea de checkout.',
          });
        }
        if (racedOrder) {
          let racedClosure;
          try {
            racedClosure = await deps.hasOpenOrderClosure(supabase, racedOrder.id);
          } catch (closureError) {
            console.error('[orders] idempotency-race closure lookup error:', { code: closureError?.code, message: closureError?.message });
            return json(res, 500, { error: 'db_error', message: 'Falha ao verificar o encerramento do pedido.' });
          }
          if (racedClosure) {
            return json(res, 409, {
              error: 'order_closure_in_progress',
              message: 'Este checkout está em processo de cancelamento ou recusa e não pode criar nem recuperar outra cobrança.',
              orderCode: racedOrder.order_code,
            });
          }
          return respondToExistingCheckout({
            supabase,
            order: racedOrder,
            res,
            recoverPayment: deps.recoverAsaasOrderPayment,
            ensureOriginalPayment: deps.ensureOriginalPaymentAttempt,
            persistPaymentIdentity: deps.persistPaymentAttemptIdentity,
          });
        }
      }

      if (orderErr || !order) {
        console.error('[orders] insert order error:', orderErr);
        return json(res, 500, {
          error: 'db_error',
          message: 'Falha ao criar pedido.',
          detail: orderErr?.message || null,
        });
      }

      itemRows = resolvedItems.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.productName,
        size: item.size,
        qty: item.qty,
        unit_price_cents: item.unitPriceCents,
        line_total_cents: item.lineTotalCents,
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
      if (itemsErr) {
        console.error('[orders] insert items error:', itemsErr);
        const { error: cleanupErr } = await supabase.from('orders').delete().eq('id', order.id);
        if (cleanupErr) console.error('[orders] failed to clean up item-less order:', cleanupErr);
        return json(res, 500, {
          error: 'db_error',
          message: 'Falha ao registrar os itens do pedido.',
          detail: itemsErr.message || null,
        });
      }

      try {
        order = await deps.reserveOrderInventory(supabase, order.id);
      } catch (inventoryErr) {
        if (Number(inventoryErr?.status) >= 500) {
          console.error('[orders] inventory reservation error:', {
            code: inventoryErr?.code,
            message: inventoryErr?.cause?.message || inventoryErr?.message,
          });
        }
        return json(res, Number(inventoryErr?.status) || 500, {
          error: inventoryErr?.code || 'inventory_transaction_failed',
          message: inventoryErr?.message || 'Falha ao reservar o estoque do pedido.',
          orderId: order.id,
          orderCode: order.order_code,
        });
      }
    }

    const paymentMethod = order.payment_method || payment.method;
    const customerDocument = order.customer_cpf_cnpj || normalizeCpfCnpj(customer?.cpfCnpj);

    let closureBeforePayment;
    try {
      closureBeforePayment = await deps.hasOpenOrderClosure(supabase, order.id);
    } catch (closureError) {
      console.error('[orders] pre-payment closure lookup error:', { code: closureError?.code, message: closureError?.message });
      return json(res, 500, { error: 'db_error', message: 'Falha ao verificar o encerramento do pedido.' });
    }
    if (closureBeforePayment) {
      return json(res, 409, {
        error: 'order_closure_in_progress',
        message: 'Este checkout está em processo de cancelamento ou recusa e não pode criar outra cobrança.',
        orderCode: order.order_code,
      });
    }

    let originalPaymentAttempt;
    try {
      originalPaymentAttempt = await deps.ensureOriginalPaymentAttempt(supabase, order, { state: 'claimed' });
    } catch (ledgerErr) {
      console.error('[orders] original payment ledger claim error:', { code: ledgerErr?.code, message: ledgerErr?.message });
      return json(res, 500, {
        error: ledgerErr?.code || 'payment_ledger_error',
        message: 'Falha ao registrar a identidade da cobrança antes de contatar o provedor.',
        orderId: order.id,
        orderCode: order.order_code,
      });
    }

    if (originalPaymentAttempt.checkoutClaimCreated === false) {
      return respondToExistingCheckout({
        supabase,
        order,
        res,
        recoverPayment: deps.recoverAsaasOrderPayment,
        ensureOriginalPayment: deps.ensureOriginalPaymentAttempt,
        persistPaymentIdentity: deps.persistPaymentAttemptIdentity,
      });
    }

    try {
      const paymentResult = await deps.createAsaasOrderPayment({
        order,
        items: itemRows,
        paymentMethod,
        requestBaseUrl: getRequestBaseUrl(req),
        requestIp: getRequestIp(req),
        card: paymentMethod === 'cartao' ? payment.card : null,
        customerDocument,
      });

      try {
        const verification = derivePaymentAttemptVerification(
          paymentResult?.payload?.state || paymentResult?.orderUpdate?.payment_state || 'pending',
          paymentResult?.payment?.value,
          order.total_cents,
        );
        originalPaymentAttempt = await deps.persistPaymentAttemptIdentity(supabase, originalPaymentAttempt, {
          providerPaymentId: paymentResult?.payload?.externalId || paymentResult?.orderUpdate?.payment_external_id || null,
          state: verification.state,
          providerReportedState: verification.providerReportedState,
          providerAmountCents: verification.providerAmountCents,
          amountVerificationState: verification.amountVerificationState,
        });
        if (verification.error) {
          const amountError = new Error('A cobrança criada não passou na validação autoritativa do valor.');
          amountError.code = verification.error;
          throw amountError;
        }
      } catch (ledgerErr) {
        console.error('[orders] original payment ledger sync error:', { code: ledgerErr?.code, message: ledgerErr?.message });
        const reconciliationStateErr = await markCheckoutReconciliationRequired(supabase, order.id);
        if (reconciliationStateErr) {
          console.error('[orders] failed to persist reconciliation-required state:', reconciliationStateErr);
        }
        return json(res, 500, {
          error: ledgerErr?.code || 'payment_reconciliation_required',
          message: 'A cobrança pode existir, mas sua identidade ainda precisa ser conciliada. Tente novamente com a mesma tentativa.',
          orderId: order.id,
          orderCode: order.order_code,
        });
      }

      if (paymentResult.requiresReconciliation) {
        const reconciliationUpdate = {
          ...paymentResult.orderUpdate,
          active_payment_attempt_id: originalPaymentAttempt.id,
          checkout_finalization_state: CHECKOUT_FINALIZATION_STATE.RECONCILIATION_REQUIRED,
        };
        const reconciliationUpdateErr = await updateOrderPaymentMetadata(
          supabase,
          order.id,
          reconciliationUpdate,
        );
        if (reconciliationUpdateErr) {
          console.error('[orders] failed to persist unusable PIX provider identity:', reconciliationUpdateErr);
          const reconciliationStateErr = await markCheckoutReconciliationRequired(supabase, order.id);
          if (reconciliationStateErr) {
            console.error('[orders] failed to persist reconciliation-required state:', reconciliationStateErr);
          }
        }
        return json(res, 503, {
          error: 'payment_artifact_recovery_pending',
          message: 'A cobrança Pix foi criada, mas o meio de pagamento ainda não pôde ser recuperado. Tente novamente com a mesma tentativa.',
          orderId: order.id,
          orderCode: order.order_code,
        });
      }

      const finalPaymentUpdate = {
        ...paymentResult.orderUpdate,
        active_payment_attempt_id: originalPaymentAttempt.id,
        checkout_finalization_state: CHECKOUT_FINALIZATION_STATE.FINALIZED,
      };
      const paymentUpdateErr = await updateOrderPaymentMetadata(supabase, order.id, finalPaymentUpdate);

      if (paymentUpdateErr) {
        console.error('[orders] payment sync error after external payment creation:', paymentUpdateErr);
        const reconciliationStateErr = await markCheckoutReconciliationRequired(supabase, order.id);
        if (reconciliationStateErr) {
          console.error('[orders] failed to persist reconciliation-required state:', reconciliationStateErr);
        }
        return json(res, 500, {
          error: 'payment_reconciliation_required',
          message: 'A cobrança pode ter sido criada, mas o pedido ainda não foi sincronizado. Tente novamente em instantes com a mesma tentativa.',
          orderId: order.id,
          orderCode: order.order_code,
        });
      }

      return json(res, 201, {
        orderId: order.id,
        orderCode: order.order_code,
        status: 'new',
        payment: paymentResult.payload,
      });
    } catch (paymentErr) {
      console.error('[orders] payment creation error:', { code: paymentErr?.code, message: paymentErr?.message });
      const failedPayment = buildPaymentFailure(paymentMethod, paymentErr.message || 'Falha ao criar cobranca.');
      if (paymentErr?.paymentOutcomeUncertain) {
        try {
          await deps.persistPaymentAttemptIdentity(supabase, originalPaymentAttempt, { state: 'provider_uncertain' });
        } catch (ledgerErr) {
          console.error('[orders] failed to mark original payment uncertain:', { code: ledgerErr?.code, message: ledgerErr?.message });
        }
        const reconciliationStateErr = await markCheckoutReconciliationRequired(supabase, order.id);
        if (reconciliationStateErr) {
          console.error('[orders] failed to persist uncertain payment state:', reconciliationStateErr);
        }
        return json(res, 500, {
          error: 'payment_reconciliation_required',
          message: 'Não foi possível confirmar o resultado da cobrança. Tente novamente em instantes com a mesma tentativa.',
          orderId: order.id,
          orderCode: order.order_code,
        });
      }

      try {
        await deps.persistPaymentAttemptIdentity(supabase, originalPaymentAttempt, { state: 'failed' });
      } catch (ledgerErr) {
        console.error('[orders] failed to mark original payment failed:', { code: ledgerErr?.code, message: ledgerErr?.message });
      }

      const paymentFailureUpdate = {
        payment_method: paymentMethod,
        payment_provider: 'asaas',
        payment_state: 'failed',
        payment_last_event: failedPayment.lastEvent,
        payment_error_message: failedPayment.message,
        checkout_finalization_state: CHECKOUT_FINALIZATION_STATE.FINALIZED,
      };

      const paymentFailureUpdateErr = await updateOrderPaymentMetadata(
        supabase,
        order.id,
        paymentFailureUpdate,
      );

      if (paymentFailureUpdateErr) {
        console.error('[orders] failed payment state update error:', paymentFailureUpdateErr);
        const reconciliationStateErr = await markCheckoutReconciliationRequired(supabase, order.id);
        if (reconciliationStateErr) {
          console.error('[orders] failed to persist reconciliation state after payment failure:', reconciliationStateErr);
        }
        return json(res, 500, {
          error: 'payment_state_sync_error',
          message: 'Pedido criado, mas o estado da cobrança não pôde ser sincronizado.',
          orderId: order.id,
          orderCode: order.order_code,
        });
      }

      return json(res, 201, {
        orderId: order.id,
        orderCode: order.order_code,
        status: 'new',
        payment: failedPayment,
        warning: `Pedido criado, mas a cobranca falhou. ${failedPayment.message || 'Refaça a compra em Meus Pedidos.'}`,
      });
    }
  } catch (err) {
    console.error('[orders] unhandled:', { code: err?.code, message: err?.message });
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao criar pedido.' });
  }
  };
}

const handler = createOrdersHandler();
export default handler;
