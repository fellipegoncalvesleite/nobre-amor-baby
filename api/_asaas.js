import { preservePaymentState } from './_commerceSecurity.js';

const ASAAS_DEFAULT_API_URL = 'https://sandbox.asaas.com/api/v3';

function trimToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function centsToCurrency(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function normalizePhone(phone) {
  return digitsOnly(phone).slice(0, 13);
}

export function normalizeCpfCnpj(value) {
  return digitsOnly(value).slice(0, 14);
}

export function normalizePostalCode(value) {
  return digitsOnly(value).slice(0, 8);
}

export function normalizePaymentMethod(method) {
  return method === 'cartao' ? 'cartao' : 'pix';
}

export function formatAsaasDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseAsaasErrorBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.errors?.[0]?.description === 'string') return body.errors[0].description;
  if (typeof body.message === 'string') return body.message;
  return null;
}

export function getAsaasConfig() {
  return {
    apiKey: trimToNull(process.env.ASAAS_API_KEY),
    apiUrl: trimToNull(process.env.ASAAS_API_URL) || ASAAS_DEFAULT_API_URL,
    webhookToken: trimToNull(process.env.ASAAS_WEBHOOK_TOKEN),
    siteUrl: trimToNull(process.env.SITE_URL),
  };
}

export async function asaasRequest(path, options = {}) {
  const { apiKey, apiUrl } = getAsaasConfig();
  if (!apiKey) {
    const err = new Error('ASAAS_API_KEY não configurada.');
    err.code = 'missing_asaas_key';
    throw err;
  }

  const url = new URL(path.replace(/^\//, ''), apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  let res;
  try {
    res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        access_token: apiKey,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    error.asaasTransportFailure = true;
    throw error;
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const message = parseAsaasErrorBody(data) || `Asaas retornou HTTP ${res.status}.`;
    const err = new Error(message);
    err.code = 'asaas_request_failed';
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function mapAsaasStatusToPaymentState(status) {
  switch (String(status || '').toUpperCase()) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'paid';
    case 'OVERDUE':
      return 'expired';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
      return 'refunded';
    case 'DELETED':
      return 'cancelled';
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return 'failed';
    case 'AWAITING_RISK_ANALYSIS':
    case 'RECEIVED_AWAITING_CONFIRMATION':
    case 'PENDING':
    default:
      return 'pending';
  }
}

export function mapAsaasEventToPaymentState(event) {
  switch (String(event || '').toUpperCase()) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED_IN_CASH':
      return 'paid';
    case 'PAYMENT_OVERDUE':
      return 'expired';
    case 'PAYMENT_DELETED':
      return 'cancelled';
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_REFUND_REQUESTED':
      return 'refunded';
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return 'failed';
    case 'PAYMENT_CREATED':
    case 'PAYMENT_UPDATED':
    default:
      return 'pending';
  }
}

export function toPaymentPayload(orderLike = {}) {
  return {
    provider: orderLike.payment_provider || 'asaas',
    method: orderLike.payment_method || null,
    state: orderLike.payment_state || 'pending',
    url: orderLike.payment_link_url || null,
    copyPaste: orderLike.payment_pix_copy_paste || null,
    qrCode: orderLike.payment_pix_qr_code || null,
    expiresAt: orderLike.payment_expires_at || null,
    paidAt: orderLike.paid_at || null,
    externalId: orderLike.payment_external_id || null,
    lastEvent: orderLike.payment_last_event || null,
    message: orderLike.payment_error_message || null,
  };
}

function billingTypeToPaymentMethod(billingType, fallback = null) {
  const normalized = String(billingType || '').toUpperCase();
  if (normalized === 'PIX') return 'pix';
  if (normalized === 'CREDIT_CARD') return 'cartao';
  return fallback;
}

function toSafePaidTotalCents(order, payment, state) {
  const existingPaidTotal = Number(order?.paid_total_cents);
  if (Number.isSafeInteger(existingPaidTotal) && existingPaidTotal >= 0 && existingPaidTotal <= 2_147_483_647) {
    return existingPaidTotal;
  }

  if (state !== 'paid' && state !== 'refunded') return null;

  const providerValue = Number(payment?.value);
  const providerCents = Number.isFinite(providerValue) ? Math.round(providerValue * 100) : NaN;
  if (Number.isSafeInteger(providerCents) && providerCents >= 0 && providerCents <= 2_147_483_647) {
    return providerCents;
  }

  const authoritativeTotal = Number(order?.total_cents);
  if (Number.isSafeInteger(authoritativeTotal) && authoritativeTotal >= 0 && authoritativeTotal <= 2_147_483_647) {
    return authoritativeTotal;
  }

  return null;
}

function mapRecoveredPayment(order, payment, pixQrCode = null) {
  const method = billingTypeToPaymentMethod(payment?.billingType, order?.payment_method || null);
  const proposedState = mapAsaasStatusToPaymentState(payment?.status);
  const state = preservePaymentState(order?.payment_state, proposedState);
  const copyPaste = pixQrCode?.payload || null;
  const qrCode = pixQrCode?.encodedImage ? `data:image/png;base64,${pixQrCode.encodedImage}` : null;
  const expiresAt = pixQrCode?.expirationDate || payment?.dueDate || null;
  const paidAt = order?.paid_at || payment?.clientPaymentDate || payment?.paymentDate || null;
  const paidTotalCents = toSafePaidTotalCents(order, payment, state);

  return {
    payload: {
      provider: 'asaas',
      method,
      state,
      url: payment?.invoiceUrl || null,
      copyPaste,
      qrCode,
      expiresAt,
      paidAt,
      externalId: payment?.id || null,
      lastEvent: 'PAYMENT_RECONCILED',
      message: null,
    },
    orderUpdate: {
      payment_method: method,
      payment_ref: payment?.id || null,
      payment_state: state,
      payment_provider: 'asaas',
      payment_external_id: payment?.id || null,
      payment_link_url: payment?.invoiceUrl || null,
      payment_pix_copy_paste: copyPaste,
      payment_pix_qr_code: qrCode,
      payment_expires_at: expiresAt,
      paid_at: paidAt,
      paid_total_cents: paidTotalCents,
      payment_last_event: 'PAYMENT_RECONCILED',
      payment_error_message: null,
    },
  };
}

export async function recoverAsaasOrderPayment({ order, requestImpl = asaasRequest }) {
  const orderCode = String(order?.order_code || '').trim();
  if (!orderCode) {
    throw new Error('order.order_code is required for Asaas reconciliation.');
  }

  const response = await requestImpl('/payments', {
    query: { externalReference: orderCode },
  });
  const matches = (Array.isArray(response?.data) ? response.data : [])
    .filter((payment) => String(payment?.externalReference || '').trim() === orderCode);

  if (matches.length === 0) return { kind: 'none' };
  if (matches.length > 1) {
    return {
      kind: 'conflict',
      paymentIds: matches.map((payment) => payment?.id).filter(Boolean),
    };
  }

  const payment = matches[0];
  const method = billingTypeToPaymentMethod(payment?.billingType, order?.payment_method || null);
  let pixQrCode = null;
  if (method === 'pix' && payment?.id) {
    try {
      pixQrCode = await requestImpl(`/payments/${payment.id}/pixQrCode`);
    } catch (error) {
      console.warn('[asaas] PIX recovery QR fetch failed:', {
        code: error?.code,
        status: error?.status,
      });
    }
  }

  const mapped = mapRecoveredPayment(order, payment, pixQrCode);
  return {
    kind: 'single',
    payment,
    pixQrCode,
    ...mapped,
  };
}

function getCallbackConfig({ siteUrl, requestBaseUrl, orderCode }) {
  const candidate = siteUrl || requestBaseUrl;
  if (!candidate) return null;

  const url = new URL(candidate);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return null;
  }

  return {
    successUrl: `${url.origin}/pedido-enviado?orderCode=${encodeURIComponent(orderCode)}`,
    autoRedirect: false,
  };
}

function buildPaymentDescription(order, items) {
  const itemCount = Array.isArray(items) ? items.reduce((sum, item) => sum + Number(item.qty || 0), 0) : 0;
  return `Pedido ${order.order_code}${itemCount ? ` · ${itemCount} item(ns)` : ''}`;
}

export async function createAsaasCustomer(customer) {
  const payload = {
    name: trimToNull(customer.name),
    email: trimToNull(customer.email),
    mobilePhone: normalizePhone(customer.phone),
    cpfCnpj: normalizeCpfCnpj(customer.cpfCnpj),
  };

  return asaasRequest('/customers', {
    method: 'POST',
    body: payload,
  });
}

export async function createAsaasOrderPayment({
  order,
  items,
  paymentMethod,
  requestBaseUrl,
  requestIp,
  card,
  customerDocument,
}) {
  const method = normalizePaymentMethod(paymentMethod || order.payment_method);
  const cpfCnpj = normalizeCpfCnpj(customerDocument || order.customer_cpf_cnpj);
  if (!cpfCnpj) {
    throw new Error('CPF ou CNPJ do cliente e obrigatorio para criar a cobranca.');
  }

  const customer = await createAsaasCustomer({
    name: order.customer_name,
    email: order.customer_email,
    phone: order.customer_phone,
    cpfCnpj,
  });

  const callback = getCallbackConfig({
    siteUrl: getAsaasConfig().siteUrl,
    requestBaseUrl,
    orderCode: order.order_code,
  });

  const paymentBody = {
    customer: customer.id,
    billingType: method === 'pix' ? 'PIX' : 'CREDIT_CARD',
    value: centsToCurrency(order.total_cents),
    dueDate: formatAsaasDate(),
    description: buildPaymentDescription(order, items),
    externalReference: order.order_code,
    ...(callback ? { callback } : {}),
  };

  if (method === 'cartao') {
    if (!card) {
      throw new Error('Dados do cartão são obrigatórios para pagamento com cartão.');
    }

    paymentBody.creditCard = {
      holderName: trimToNull(card.holderName),
      number: digitsOnly(card.number),
      expiryMonth: String(card.expiryMonth || '').padStart(2, '0'),
      expiryYear: String(card.expiryYear || ''),
      ccv: digitsOnly(card.ccv),
    };
    paymentBody.creditCardHolderInfo = {
      name: trimToNull(order.customer_name),
      email: trimToNull(order.customer_email),
      cpfCnpj,
      postalCode: normalizePostalCode(order.address_cep),
      addressNumber: trimToNull(order.address_number),
      addressComplement: trimToNull(order.address_complement),
      phone: normalizePhone(order.customer_phone),
      mobilePhone: normalizePhone(order.customer_phone),
    };
    paymentBody.remoteIp = trimToNull(requestIp) || '127.0.0.1';
  }

  let payment;
  try {
    payment = await asaasRequest('/payments', {
      method: 'POST',
      body: paymentBody,
    });
  } catch (error) {
    error.paymentOutcomeUncertain = Boolean(
      error?.asaasTransportFailure || Number(error?.status) >= 500 || Number(error?.status) === 408,
    );
    throw error;
  }

  let pixQrCode = null;
  if (method === 'pix') {
    try {
      pixQrCode = await asaasRequest(`/payments/${payment.id}/pixQrCode`);
    } catch (err) {
      console.error('[asaas] failed to fetch pix QR code:', err);
    }
  }

  const state = mapAsaasStatusToPaymentState(payment.status);
  const payload = {
    provider: 'asaas',
    method,
    state,
    url: payment.invoiceUrl || null,
    copyPaste: pixQrCode?.payload || null,
    qrCode: pixQrCode?.encodedImage ? `data:image/png;base64,${pixQrCode.encodedImage}` : null,
    expiresAt: pixQrCode?.expirationDate || payment.dueDate || null,
    paidAt: payment.clientPaymentDate || null,
    externalId: payment.id,
    lastEvent: 'PAYMENT_CREATED',
  };

  return {
    customer,
    payment,
    pixQrCode,
    payload,
    orderUpdate: {
      payment_method: method,
      payment_ref: payment.id,
      payment_state: state,
      payment_provider: 'asaas',
      payment_external_id: payment.id,
      payment_link_url: payment.invoiceUrl || null,
      payment_pix_copy_paste: payload.copyPaste,
      payment_pix_qr_code: payload.qrCode,
      payment_expires_at: payload.expiresAt,
      paid_at: payload.paidAt,
      payment_last_event: payload.lastEvent,
      payment_error_message: null,
    },
  };
}

export function isRetryablePaymentState(state) {
  return state === 'expired' || state === 'failed';
}

export function getRequestBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;
  return `${proto}://${host}`;
}

export function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  const realIp = trimToNull(req.headers['x-real-ip']);
  const socketIp = trimToNull(req.socket?.remoteAddress);
  const candidate = forwarded || realIp || socketIp;
  if (!candidate) return null;
  return candidate.replace(/^::ffff:/, '');
}
