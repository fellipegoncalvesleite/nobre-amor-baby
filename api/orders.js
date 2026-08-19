/**
 * POST /api/orders - authenticated, idempotent order creation in Supabase + Asaas.
 */
import { getSupabase, verifyUser } from './_supabaseAdmin.js';
import {
  createAsaasOrderPayment,
  getRequestBaseUrl,
  getRequestIp,
  normalizeCpfCnpj,
  toPaymentPayload,
} from './_asaas.js';
import { normalizeIdempotencyKey } from './_commerceSecurity.js';
import { calculateAuthoritativeShipping, resolveCatalogItems } from './_serverShipping.js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  try {
    const { user } = await verifyUser(req);
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

    const supabase = getSupabase();
    const { data: existingOrder, error: existingErr } = await findIdempotentOrder(
      supabase,
      user.id,
      idempotencyKey,
    );
    if (existingErr) {
      console.error('[orders] idempotency lookup error:', existingErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao verificar repetição do pedido.' });
    }
    if (existingOrder) {
      return json(res, 200, retryPayload(existingOrder));
    }

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
    if (!['pix', 'cartao'].includes(payment?.method)) {
      return json(res, 400, { error: 'invalid_request', message: 'payment.method deve ser "pix" ou "cartao".' });
    }

    if (payment.method === 'cartao') {
      const card = payment.card || {};
      const number = digitsOnly(card.number);
      const ccv = digitsOnly(card.ccv);
      const month = digitsOnly(card.expiryMonth);
      const year = normalizeExpiryYear(card.expiryYear);

      if (!card.holderName?.trim()) {
        return json(res, 400, { error: 'invalid_request', message: 'payment.card.holderName e obrigatorio.' });
      }
      if (number.length < 13 || number.length > 19) {
        return json(res, 400, { error: 'invalid_request', message: 'payment.card.number e invalido.' });
      }
      if (!month.match(/^(0[1-9]|1[0-2])$/)) {
        return json(res, 400, { error: 'invalid_request', message: 'payment.card.expiryMonth e invalido.' });
      }
      if (!year.match(/^\d{4}$/)) {
        return json(res, 400, { error: 'invalid_request', message: 'payment.card.expiryYear e invalido.' });
      }
      if (ccv.length < 3 || ccv.length > 4) {
        return json(res, 400, { error: 'invalid_request', message: 'payment.card.ccv e invalido.' });
      }
    }

    let resolvedItems;
    let subtotalCents;
    try {
      ({ resolvedItems, subtotalCents } = await resolveCatalogItems({ supabase, items }));
    } catch (error) {
      if (Number(error?.status) >= 500) {
        console.error('[orders] catalog authority error:', { code: error?.code, message: error?.message });
      }
      return json(res, Number(error?.status) || 500, errorBody(error, 'Falha ao validar os produtos do pedido.'));
    }

    let authoritativeShipping;
    try {
      authoritativeShipping = await calculateAuthoritativeShipping({
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
    const totalCents = subtotalCents + shippingFeeCents;
    const orderCode = await generateUniqueOrderCode(supabase);
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
    };

    let order;
    let orderErr;
    ({ data: order, error: orderErr } = await supabase
      .from('orders')
      .insert(orderInsert)
      .select('*')
      .single());

    if (orderErr?.code === '23505') {
      const { data: racedOrder, error: racedErr } = await findIdempotentOrder(supabase, user.id, idempotencyKey);
      if (!racedErr && racedOrder) {
        return json(res, 200, retryPayload(racedOrder));
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

    const itemRows = resolvedItems.map((item) => ({
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
      const paymentResult = await createAsaasOrderPayment({
        order,
        items: itemRows,
        paymentMethod: payment.method,
        requestBaseUrl: getRequestBaseUrl(req),
        requestIp: getRequestIp(req),
        card: payment.method === 'cartao' ? payment.card : null,
        customerDocument: normalizeCpfCnpj(customer.cpfCnpj),
      });

      let paymentUpdateErr;
      ({ error: paymentUpdateErr } = await supabase
        .from('orders')
        .update(paymentResult.orderUpdate)
        .eq('id', order.id));

      if (paymentUpdateErr && isMissingColumnError(paymentUpdateErr, ['payment_error_message'])) {
        console.warn('[orders] payment_error_message column missing, retrying payment sync without it:', paymentUpdateErr.message);
        const fallbackPaymentUpdate = { ...paymentResult.orderUpdate };
        delete fallbackPaymentUpdate.payment_error_message;
        ({ error: paymentUpdateErr } = await supabase
          .from('orders')
          .update(fallbackPaymentUpdate)
          .eq('id', order.id));
      }

      if (paymentUpdateErr) {
        console.error('[orders] payment sync error after external payment creation:', paymentUpdateErr);
        return json(res, 500, {
          error: 'payment_sync_error',
          message: 'Pedido criado e cobrança enviada ao provedor, mas a sincronização falhou. Reenvie a mesma tentativa para recuperar o pedido sem criar outra cobrança.',
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
      const failedPayment = buildPaymentFailure(payment.method, paymentErr.message || 'Falha ao criar cobranca.');
      const paymentFailureUpdate = {
        payment_method: payment.method,
        payment_provider: 'asaas',
        payment_state: 'failed',
        payment_last_event: failedPayment.lastEvent,
        payment_error_message: failedPayment.message,
      };

      let paymentFailureUpdateErr;
      ({ error: paymentFailureUpdateErr } = await supabase
        .from('orders')
        .update(paymentFailureUpdate)
        .eq('id', order.id));

      if (paymentFailureUpdateErr && isMissingColumnError(paymentFailureUpdateErr, ['payment_error_message'])) {
        const fallbackFailureUpdate = { ...paymentFailureUpdate };
        delete fallbackFailureUpdate.payment_error_message;
        ({ error: paymentFailureUpdateErr } = await supabase
          .from('orders')
          .update(fallbackFailureUpdate)
          .eq('id', order.id));
      }

      if (paymentFailureUpdateErr) {
        console.error('[orders] failed payment state update error:', paymentFailureUpdateErr);
        return json(res, 500, {
          error: 'payment_state_sync_error',
          message: 'Pedido criado, mas o estado da falha de cobrança não pôde ser sincronizado.',
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
}
