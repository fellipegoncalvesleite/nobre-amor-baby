/**
 * /api/public — unified public router
 *
 * Supported resources:
 *   home, products, collections, order, cancel-order, retry-payment, profile, my-orders
 */
import { getSupabase, verifyUser } from './_supabaseAdmin.js';
import { createAsaasOrderPayment, getRequestBaseUrl, isRetryablePaymentState, toPaymentPayload } from './_asaas.js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function sanitizeOrder(order, items = []) {
  const {
    id: _id,
    user_id: _userId,
    customer_cpf_cnpj: _customerDocument,
    ...safe
  } = order;
  return {
    ...safe,
    items,
    items_count: items.length,
    payment: toPaymentPayload(order),
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isManagerProfile(profile) {
  return profile?.role === 'manager' || profile?.role === 'debug';
}

function isMissingColumnError(error, columnNames = []) {
  const errMsg = String(error?.message || '').toLowerCase();
  if (!errMsg) return false;
  if (!errMsg.includes('column') && !errMsg.includes('schema cache')) return false;
  return columnNames.some((name) => errMsg.includes(String(name).toLowerCase()));
}

const OPTIONAL_ORDER_COLUMNS = [
  'user_id',
  'customer_cpf_cnpj',
  'payment_error_message',
  'cancel_reason',
  'cancelled_at',
  'rejected_reason',
  'rejected_at',
  'confirmed_at',
];

const ORDER_SELECT_REQUIRED = `
  id, order_code, status, created_at,
  customer_name, customer_phone, customer_email,
  customer_message,
  address_cep, address_street, address_number, address_complement,
  address_neighborhood, address_city, address_uf,
  shipping_fee_cents, shipping_eta_text, shipping_provider,
  subtotal_cents, total_cents, paid_total_cents,
  payment_method, payment_ref, payment_state, payment_provider,
  payment_external_id, payment_link_url, payment_pix_copy_paste,
  payment_pix_qr_code, payment_expires_at, paid_at, payment_last_event
`;

const PUBLIC_ORDER_SELECT = `
  ${ORDER_SELECT_REQUIRED},
  user_id,
  payment_error_message,
  cancel_reason, cancelled_at, rejected_reason, rejected_at, confirmed_at
`;

const RETRY_ORDER_SELECT = `
  ${PUBLIC_ORDER_SELECT},
  customer_cpf_cnpj
`;

const MY_ORDERS_SELECT = `
  id, order_code, status, created_at, customer_name,
  subtotal_cents, shipping_fee_cents, total_cents,
  payment_method, payment_state, paid_at,
  payment_link_url, payment_pix_copy_paste, payment_pix_qr_code, payment_expires_at,
  cancel_reason, cancelled_at
`;

const MY_ORDERS_FALLBACK_SELECT = `
  id, order_code, status, created_at, customer_name,
  subtotal_cents, shipping_fee_cents, total_cents,
  payment_method, payment_state, paid_at,
  payment_link_url, payment_pix_copy_paste, payment_pix_qr_code, payment_expires_at
`;

async function selectOrderWithFallback(supabase, orderCode, selectClause) {
  let data;
  let error;

  ({ data, error } = await supabase
    .from('orders')
    .select(selectClause)
    .eq('order_code', orderCode)
    .maybeSingle());

  if (error && isMissingColumnError(error, OPTIONAL_ORDER_COLUMNS)) {
    console.warn('[public/order] optional columns missing, retrying with base fields only:', error.message);
    ({ data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT_REQUIRED)
      .eq('order_code', orderCode)
      .maybeSingle());
  }

  return { data, error };
}

async function requireAuthenticatedUser(req, res) {
  const auth = await verifyUser(req);
  if (!auth.user) {
    json(res, 401, { error: 'unauthorized', message: 'Token inválido ou ausente.' });
    return null;
  }
  return auth;
}

async function requireOrderAccess(req, res, order) {
  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return null;

  if (isManagerProfile(auth.profile)) return auth;

  const ownsById = order?.user_id && String(order.user_id) === String(auth.user.id);
  const orderEmail = normalizeEmail(order?.customer_email);
  const userEmail = normalizeEmail(auth.user.email);
  const ownsByEmail = Boolean(orderEmail) && orderEmail === userEmail;

  if (!ownsById && !ownsByEmail) {
    json(res, 404, { error: 'not_found', message: 'Pedido não encontrado.' });
    return null;
  }

  return auth;
}

async function selectMyOrdersByField(supabase, field, value) {
  if (!value) return { data: [], error: null };

  let data;
  let error;

  ({ data, error } = await supabase
    .from('orders')
    .select(MY_ORDERS_SELECT)
    .eq(field, value)
    .order('created_at', { ascending: false })
    .limit(100));

  if (error && isMissingColumnError(error, ['cancel_reason', 'cancelled_at'])) {
    ({ data, error } = await supabase
      .from('orders')
      .select(MY_ORDERS_FALLBACK_SELECT)
      .eq(field, value)
      .order('created_at', { ascending: false })
      .limit(100));
  }

  if (error && field === 'user_id' && isMissingColumnError(error, ['user_id'])) {
    return { data: [], error: null };
  }

  return { data: data || [], error };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET ou POST.' });
  }

  try {
    const supabase = getSupabase();
    const { resource } = req.query;

    switch (resource) {
      case 'home':
        return handleHome(req, res, supabase);
      case 'products':
        return handleProducts(req, res, supabase);
      case 'collections':
        return handleCollections(req, res, supabase);
      case 'order':
        return handleOrder(req, res, supabase);
      case 'cancel-order':
        return handleCancelOrder(req, res, supabase);
      case 'retry-payment':
        return handleRetryPayment(req, res, supabase);
      case 'profile':
        return handleProfile(req, res, supabase);
      case 'my-orders':
        return handleMyOrders(req, res, supabase);
      default:
        return json(res, 400, {
          error: 'bad_request',
          message: 'Missing or invalid ?resource=. Use: home, products, collections, order, cancel-order, retry-payment, profile, my-orders.',
        });
    }
  } catch (err) {
    console.error(`[public/${req.query.resource}] error:`, err);
    return json(res, 500, { error: 'internal_error', message: err.message || 'Erro interno.' });
  }
}

async function handleHome(req, res, supabase) {
  const HOME_DEFAULTS = {
    collections_enabled: true,
    featured_enabled: true,
    collections_title: 'Coleções',
    featured_title: 'Destaques',
    collections_order: [],
    featured_order: [],
  };

  const { data: settings, error: settingsErr } = await supabase
    .from('homepage_settings')
    .select('*')
    .eq('key', 'home')
    .maybeSingle();

  if (settingsErr) {
    const isMissingTable =
      settingsErr.code === '42P01' ||
      settingsErr.code === 'PGRST204' ||
      /does not exist|not found.*relation|homepage_settings/i.test(settingsErr.message || '');

    if (isMissingTable) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      return json(res, 200, { ...HOME_DEFAULTS, collections: [], featured: [] });
    }

    return json(res, 500, { error: 'db_error', message: settingsErr.message });
  }

  const cfg = settings || HOME_DEFAULTS;
  const result = {
    collections_enabled: cfg.collections_enabled,
    featured_enabled: cfg.featured_enabled,
    collections_title: cfg.collections_title,
    featured_title: cfg.featured_title,
    collections: [],
    featured: [],
  };

  if (cfg.collections_enabled) {
    let query = supabase.from('collections').select('*').eq('is_active', true);
    if (cfg.collections_order?.length) {
      const { data: collections } = await query.in('id', cfg.collections_order);
      const orderMap = Object.fromEntries(cfg.collections_order.map((id, index) => [id, index]));
      result.collections = (collections || []).sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));
    } else {
      const { data: collections } = await query.order('name');
      result.collections = collections || [];
    }
  }

  if (cfg.featured_enabled) {
    let query = supabase.from('products').select('*').eq('is_public', true).eq('in_stock', true);
    if (cfg.featured_order?.length) {
      const { data: products } = await query.in('id', cfg.featured_order);
      const orderMap = Object.fromEntries(cfg.featured_order.map((id, index) => [id, index]));
      result.featured = (products || []).sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));
    } else {
      const { data: products } = await query.eq('featured', true).order('created_at', { ascending: false }).limit(12);
      result.featured = products || [];
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return json(res, 200, result);
}

async function handleProducts(req, res, supabase) {
  const { collection, featured, slug, search, limit } = req.query;

  if (slug) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .single();

    if (error || !data) return json(res, 404, { error: 'not_found', message: 'Produto não encontrado.' });
    return json(res, 200, { product: data });
  }

  let query = supabase.from('products').select('*').eq('is_public', true);
  if (collection) query = query.eq('collection_id', collection);
  if (featured === 'true') query = query.eq('featured', true);
  if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);

  const max = Math.min(parseInt(limit, 10) || 50, 200);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(max);
  if (error) return json(res, 500, { error: 'db_error', message: error.message });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return json(res, 200, { products: data || [] });
}

async function handleCollections(req, res, supabase) {
  const { slug } = req.query;

  if (slug) {
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !data) return json(res, 404, { error: 'not_found', message: 'Coleção não encontrada.' });

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('collection_id', data.id)
      .eq('is_public', true)
      .eq('in_stock', true)
      .order('created_at', { ascending: false });

    return json(res, 200, { collection: data, products: products || [] });
  }

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) return json(res, 500, { error: 'db_error', message: error.message });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return json(res, 200, { collections: data || [] });
}

async function handleOrder(req, res, supabase) {
  const { orderCode } = req.query;
  if (!orderCode || typeof orderCode !== 'string' || orderCode.length < 5) {
    return json(res, 400, { error: 'bad_request', message: 'Missing or invalid ?orderCode=.' });
  }

  const { data: order, error: orderErr } = await selectOrderWithFallback(supabase, orderCode, PUBLIC_ORDER_SELECT);

  if (orderErr) {
    console.error('[public/order] fetch error:', orderErr);
    return json(res, 500, { error: 'db_error', message: 'Erro ao buscar pedido.' });
  }
  if (!order) {
    return json(res, 404, { error: 'not_found', message: 'Pedido não encontrado.' });
  }
  const auth = await requireOrderAccess(req, res, order);
  if (!auth) return null;

  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_id, product_name, size, qty, unit_price_cents, line_total_cents')
    .eq('order_id', order.id)
    .order('id');

  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  return json(res, 200, { order: sanitizeOrder(order, items || []) });
}

async function handleCancelOrder(req, res, supabase) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  const { orderCode, reason } = req.body || {};
  if (!orderCode || typeof orderCode !== 'string' || orderCode.length < 5) {
    return json(res, 400, { error: 'bad_request', message: 'orderCode é obrigatório.' });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return json(res, 400, { error: 'bad_request', message: 'Informe o motivo do cancelamento.' });
  }

  const { data: order, error: fetchErr } = await selectOrderWithFallback(supabase, orderCode, PUBLIC_ORDER_SELECT);

  if (fetchErr) {
    console.error('[public/cancel-order] fetch error:', fetchErr);
    return json(res, 500, { error: 'db_error', message: 'Erro ao buscar pedido.' });
  }
  if (!order) return json(res, 404, { error: 'not_found', message: 'Pedido não encontrado.' });
  const auth = await requireOrderAccess(req, res, order);
  if (!auth) return null;

  if (order.status !== 'new') {
    return json(res, 400, { error: 'cannot_cancel', message: 'Este pedido já entrou em processamento e não pode mais ser cancelado.' });
  }
  if (order.payment_state === 'paid') {
    return json(res, 400, { error: 'cannot_cancel_paid', message: 'Este pedido já foi pago. Entre em contato para suporte.' });
  }

  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      payment_state: 'cancelled',
      cancel_reason: reason.trim(),
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select('order_code, status, payment_state')
    .single();

  if (updateErr) {
    console.error('[public/cancel-order] update error:', updateErr);
    return json(res, 500, { error: 'db_error', message: 'Falha ao cancelar pedido.' });
  }

  return json(res, 200, {
    success: true,
    orderCode: updated.order_code,
    status: updated.status,
    paymentState: updated.payment_state,
    message: 'Pedido cancelado com sucesso.',
  });
}

async function handleRetryPayment(req, res, supabase) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  const { orderCode, method } = req.body || {};
  if (!orderCode || typeof orderCode !== 'string' || orderCode.length < 5) {
    return json(res, 400, { error: 'bad_request', message: 'orderCode é obrigatório.' });
  }

  const { data: order, error: orderErr } = await selectOrderWithFallback(supabase, orderCode, RETRY_ORDER_SELECT);

  if (orderErr) {
    console.error('[public/retry-payment] fetch order error:', orderErr);
    return json(res, 500, { error: 'db_error', message: 'Erro ao buscar pedido.' });
  }
  if (!order) return json(res, 404, { error: 'not_found', message: 'Pedido não encontrado.' });
  const auth = await requireOrderAccess(req, res, order);
  if (!auth) return null;
  if (order.status !== 'new') {
    return json(res, 400, { error: 'invalid_status', message: 'A cobrança só pode ser recriada para pedidos novos.' });
  }
  if (!isRetryablePaymentState(order.payment_state)) {
    return json(res, 400, { error: 'payment_not_retryable', message: 'Este pedido ainda não pode gerar uma nova cobrança.' });
  }

  if ((method || order.payment_method) === 'cartao') {
    return json(res, 400, {
      error: 'card_retry_requires_new_checkout',
      message: 'Para tentar novamente com cartao, use "Pedir de novo" e informe o cartao novamente.',
    });
  }
  if (!order.customer_cpf_cnpj) {
    return json(res, 400, {
      error: 'missing_customer_document',
      message: 'Este pedido precisa ser refeito para informar o CPF ou CNPJ novamente.',
    });
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, product_id, product_name, size, qty, unit_price_cents, line_total_cents')
    .eq('order_id', order.id)
    .order('id');

  if (itemsErr) {
    console.error('[public/retry-payment] fetch items error:', itemsErr);
    return json(res, 500, { error: 'db_error', message: 'Erro ao buscar itens do pedido.' });
  }

  try {
    const paymentResult = await createAsaasOrderPayment({
      order,
      items: items || [],
      paymentMethod: method || order.payment_method,
      requestBaseUrl: getRequestBaseUrl(req),
    });

    let updateErr;
    const paymentUpdate = {
      ...paymentResult.orderUpdate,
      payment_state: paymentResult.payload.state,
      payment_error_message: null,
    };

    ({ error: updateErr } = await supabase
      .from('orders')
      .update(paymentUpdate)
      .eq('id', order.id));

    if (updateErr && isMissingColumnError(updateErr, ['payment_error_message'])) {
      const fallbackUpdate = { ...paymentUpdate };
      delete fallbackUpdate.payment_error_message;

      ({ error: updateErr } = await supabase
        .from('orders')
        .update(fallbackUpdate)
        .eq('id', order.id));
    }

    if (updateErr) {
      console.error('[public/retry-payment] update error:', updateErr);
      return json(res, 500, { error: 'db_error', message: 'Não foi possível salvar a nova cobrança.' });
    }

    return json(res, 200, {
      success: true,
      orderCode: order.order_code,
      status: order.status,
      payment: paymentResult.payload,
    });
  } catch (err) {
    console.error('[public/retry-payment] create error:', err);

    let retryFailureErr;
    const retryFailureUpdate = {
      payment_state: 'failed',
      payment_last_event: 'PAYMENT_RETRY_FAILED',
      payment_error_message: err.message || 'Falha ao gerar nova cobrança.',
    };

    ({ error: retryFailureErr } = await supabase
      .from('orders')
      .update(retryFailureUpdate)
      .eq('id', order.id));

    if (retryFailureErr && isMissingColumnError(retryFailureErr, ['payment_error_message'])) {
      const fallbackFailureUpdate = { ...retryFailureUpdate };
      delete fallbackFailureUpdate.payment_error_message;

      ({ error: retryFailureErr } = await supabase
        .from('orders')
        .update(fallbackFailureUpdate)
        .eq('id', order.id));
    }

    if (retryFailureErr) {
      console.error('[public/retry-payment] failure update error:', retryFailureErr);
    }

    return json(res, 500, {
      error: 'retry_failed',
      message: err.message || 'Falha ao gerar nova cobrança.',
    });
  }
}

async function handleProfile(req, res, supabase) {
  const { userId } = req.query;
  if (!userId) {
    return json(res, 400, { error: 'bad_request', message: 'Missing ?userId=.' });
  }
  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return null;

  if (String(auth.user.id) !== String(userId) && !isManagerProfile(auth.profile)) {
    return json(res, 403, { error: 'forbidden', message: 'Acesso negado a este perfil.' });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, role, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const isTableMissing =
      error.code === '42P01' ||
      /does not exist|not found.*relation|profiles/i.test(error.message || '');
    if (isTableMissing) {
      return json(res, 200, { profile: { id: userId, role: 'customer' } });
    }
    return json(res, 500, { error: 'db_error', message: error.message });
  }

  return json(res, 200, { profile: profile || { id: userId, role: 'customer' } });
}

async function handleMyOrders(req, res, supabase) {
  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return null;

  const [{ data: userIdOrders, error: userIdOrdersErr }, { data: emailOrders, error: emailOrdersErr }] = await Promise.all([
    selectMyOrdersByField(supabase, 'user_id', auth.user.id),
    selectMyOrdersByField(supabase, 'customer_email', auth.user.email),
  ]);

  if (userIdOrdersErr || emailOrdersErr) {
    console.error('[public/my-orders] error:', userIdOrdersErr || emailOrdersErr);
    return json(res, 500, { error: 'db_error', message: 'Erro ao buscar pedidos.' });
  }

  const ordersMap = new Map();
  [...(userIdOrders || []), ...(emailOrders || [])].forEach((order) => {
    const key = order.id || order.order_code;
    if (!ordersMap.has(key)) ordersMap.set(key, order);
  });

  const orders = Array.from(ordersMap.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );

  const result = [];
  for (const currentOrder of orders || []) {
    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', currentOrder.id);

    const payment = toPaymentPayload(currentOrder);
    result.push({
      ...currentOrder,
      items_count: count || 0,
      payment,
    });
  }

  return json(res, 200, { orders: result });
}
