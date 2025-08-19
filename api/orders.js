/**
 * POST /api/orders - create a new order in Supabase + Asaas.
 *
 * Response 201:
 * {
 *   orderId,
 *   orderCode,
 *   status: "new",
 *   payment: { provider, method, state, url, copyPaste, qrCode, expiresAt, paidAt, externalId, lastEvent }
 * }
 */
import { getSupabase, verifyUser } from './_supabaseAdmin.js';
import {
  createAsaasOrderPayment,
  getRequestBaseUrl,
  getRequestIp,
  normalizeCpfCnpj,
} from './_asaas.js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  try {
    const supabase = getSupabase();
    const body = req.body || {};
    const { customer, address: addr, shipping, payment, items } = body;

    if (!customer?.name?.trim()) {
      return json(res, 400, { error: 'invalid_request', message: 'customer.name e obrigatorio.' });
    }
    if (!customer?.email?.trim()) {
      return json(res, 400, { error: 'invalid_request', message: 'customer.email e obrigatorio.' });
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
    if (payment?.method === 'cartao') {
      const card = payment?.card || {};
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

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item?.productName && !item?.name) {
        return json(res, 400, { error: 'invalid_request', message: `items[${i}].productName e obrigatorio.` });
      }
      if (Number(item?.qty) < 1) {
        return json(res, 400, { error: 'invalid_request', message: `items[${i}].qty deve ser >= 1.` });
      }
      if (item?.unitPriceCents == null || Number(item.unitPriceCents) < 0) {
        return json(res, 400, { error: 'invalid_request', message: `items[${i}].unitPriceCents e obrigatorio.` });
      }
    }

    /* ── Server-side price authority ──────────────────────────────
       Never trust client-sent prices. Resolve every line against the
       products table; reject unknown or non-public products so a
       tampered payload can't pay R$0,01 for a real item. */
    const orderProductIds = [...new Set(
      items.map((it) => String(it.productId ?? it.id ?? '').trim()).filter(Boolean),
    )];

    const { data: dbProducts, error: priceErr } = orderProductIds.length
      ? await supabase
          .from('products')
          .select('id, name, price_cents, is_public')
          .in('id', orderProductIds)
      : { data: [], error: null };

    if (priceErr) {
      console.error('[orders] price lookup error:', priceErr);
      return json(res, 500, { error: 'db_error', message: 'Falha ao validar os produtos do pedido.' });
    }

    const productPriceMap = new Map((dbProducts || []).map((p) => [String(p.id), p]));

    const resolvedItems = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const pid = String(item.productId ?? item.id ?? '').trim();
      const dbProduct = pid ? productPriceMap.get(pid) : null;

      if (!dbProduct || dbProduct.is_public === false) {
        return json(res, 400, {
          error: 'invalid_product',
          message: `O produto "${item.productName ?? item.name ?? pid}" não está mais disponível.`,
        });
      }

      const qty = Math.max(1, Number(item.qty));
      const unitPriceCents = Math.round(Number(dbProduct.price_cents));
      resolvedItems.push({
        productId: pid,
        productName: dbProduct.name ?? item.productName ?? item.name ?? '',
        size: item.size || '',
        qty,
        unitPriceCents,
        lineTotalCents: unitPriceCents * qty,
      });
    }

    const subtotalCents = resolvedItems.reduce((sum, it) => sum + it.lineTotalCents, 0);
    const shippingFeeCents = Math.max(0, Math.round(Number(shipping?.feeCents) || 0));
    const totalCents = subtotalCents + shippingFeeCents;

    let userId = null;
    try {
      const { user } = await verifyUser(req);
      if (user) userId = user.id;
    } catch {
      userId = null;
    }

    const orderCode = await generateUniqueOrderCode(supabase);
    const orderInsert = {
      order_code: orderCode,
      status: 'new',
      customer_name: customer.name.trim(),
      customer_phone: customer.phone.trim(),
      customer_email: customer.email.trim(),
      customer_cpf_cnpj: normalizeCpfCnpj(customer.cpfCnpj),
      customer_message: customer.message?.trim() || null,
      address_cep: addr?.cep || null,
      address_street: addr?.street || null,
      address_number: addr?.number || null,
      address_complement: addr?.complement || null,
      address_neighborhood: addr?.neighborhood || null,
      address_city: addr?.city || null,
      address_uf: addr?.uf || null,
      shipping_fee_cents: shippingFeeCents,
      shipping_eta_text: shipping?.etaText || null,
      shipping_provider: shipping?.provider || shipping?.source || null,
      subtotal_cents: subtotalCents,
      total_cents: totalCents,
      payment_method: payment.method,
      payment_state: 'pending',
      payment_provider: 'asaas',
      ...(userId ? { user_id: userId } : {}),
    };

    let order;
    let orderErr;

    ({ data: order, error: orderErr } = await supabase
      .from('orders')
      .insert(orderInsert)
      .select('*')
      .single());

    if (orderErr && isMissingColumnError(orderErr, ['customer_cpf_cnpj', 'user_id'])) {
      console.warn('[orders] optional order columns missing, retrying with core fields only:', orderErr.message);
      const fallbackInsert = { ...orderInsert };
      delete fallbackInsert.customer_cpf_cnpj;
      delete fallbackInsert.user_id;

      ({ data: order, error: orderErr } = await supabase
        .from('orders')
        .insert(fallbackInsert)
        .select('*')
        .single());
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
      await supabase.from('orders').delete().eq('id', order.id);
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
        console.error('[orders] payment sync error:', paymentUpdateErr);
        return json(res, 500, {
          error: 'payment_sync_error',
          message: 'Pedido criado, mas a cobranca nao pode ser sincronizada.',
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
      console.error('[orders] payment creation error:', paymentErr);
      const failedPayment = buildPaymentFailure(payment.method, paymentErr.message || 'Falha ao criar cobranca.');

      let paymentFailureUpdateErr;
      const paymentFailureUpdate = {
        payment_method: payment.method,
        payment_provider: 'asaas',
        payment_state: 'failed',
        payment_last_event: failedPayment.lastEvent,
        payment_error_message: failedPayment.message,
      };

      ({ error: paymentFailureUpdateErr } = await supabase
        .from('orders')
        .update(paymentFailureUpdate)
        .eq('id', order.id));

      if (paymentFailureUpdateErr && isMissingColumnError(paymentFailureUpdateErr, ['payment_error_message'])) {
        console.warn('[orders] payment_error_message column missing, retrying failed-payment update without it:', paymentFailureUpdateErr.message);
        const fallbackFailureUpdate = { ...paymentFailureUpdate };
        delete fallbackFailureUpdate.payment_error_message;

        ({ error: paymentFailureUpdateErr } = await supabase
          .from('orders')
          .update(fallbackFailureUpdate)
          .eq('id', order.id));
      }

      if (paymentFailureUpdateErr) {
        console.error('[orders] failed payment state update error:', paymentFailureUpdateErr);
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
    console.error('[orders] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao criar pedido.' });
  }
}
