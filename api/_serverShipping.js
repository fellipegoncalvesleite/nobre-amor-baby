import siteConfig from '../src/config/siteConfig.js';

const PACKAGE_OVERHEAD_GRAMS = 50;
export const DEFAULT_WEIGHT_GRAMS = 200;
export const MAX_ITEM_QTY = 1000;
export const POSTGRES_INT_MAX = 2_147_483_647;
const DIMENSION_TIERS = [
  { maxPieces: 2, lengthCm: 25, widthCm: 20, heightCm: 4 },
  { maxPieces: 5, lengthCm: 30, widthCm: 25, heightCm: 8 },
  { maxPieces: 10, lengthCm: 35, widthCm: 30, heightCm: 12 },
  { maxPieces: Infinity, lengthCm: 40, widthCm: 35, heightCm: 16 },
];

function shippingError(code, message, status = 500) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function requireSafeInteger(value, { code = 'invalid_request', message, status = 400, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw shippingError(code, message || 'Valor inteiro inválido.', status);
  }
  return value;
}

export function requirePostgresIntCents(value, label = 'valor') {
  return requireSafeInteger(value, {
    code: 'unsafe_monetary_value',
    message: `${label} em centavos excede o intervalo inteiro permitido.`,
    status: 400,
    min: 0,
    max: POSTGRES_INT_MAX,
  });
}

export function addPostgresIntCents(left, right, label = 'total') {
  requirePostgresIntCents(left, label);
  requirePostgresIntCents(right, label);
  const total = left + right;
  return requirePostgresIntCents(total, label);
}

function multiplyPostgresIntCents(unitCents, qty, label = 'total da linha') {
  requirePostgresIntCents(unitCents, label);
  requireSafeInteger(qty, {
    code: 'invalid_request',
    message: 'qty deve ser um inteiro seguro.',
    status: 400,
    min: 1,
    max: MAX_ITEM_QTY,
  });
  const total = unitCents * qty;
  return requirePostgresIntCents(total, label);
}

function safeWeightGrams(value) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 && Number.isSafeInteger(weight)
    ? weight
    : DEFAULT_WEIGHT_GRAMS;
}

export function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isStoreCity(city, uf) {
  return (
    stripAccents(city).trim().toLowerCase() === stripAccents(siteConfig.STORE_CITY).trim().toLowerCase() &&
    stripAccents(uf).trim().toUpperCase() === stripAccents(siteConfig.STORE_UF).trim().toUpperCase()
  );
}

export function buildPackageFromResolvedItems(resolvedItems) {
  let itemCount = 0;
  let totalWeightGrams = PACKAGE_OVERHEAD_GRAMS;
  let insuranceValueCents = 0;

  for (const item of resolvedItems || []) {
    const qty = Number(item.qty);
    requireSafeInteger(qty, {
      code: 'invalid_request',
      message: 'qty deve ser um inteiro seguro.',
      status: 400,
      min: 1,
      max: MAX_ITEM_QTY,
    });
    const weightGrams = safeWeightGrams(item.weightGrams);
    const unitPriceCents = requirePostgresIntCents(Number(item.unitPriceCents), 'preço unitário');
    const lineWeight = weightGrams * qty;
    if (!Number.isSafeInteger(lineWeight) || !Number.isSafeInteger(totalWeightGrams + lineWeight)) {
      throw shippingError('unsafe_package_weight', 'Peso total do pacote excede o intervalo seguro.', 400);
    }
    itemCount += qty;
    totalWeightGrams += lineWeight;
    insuranceValueCents = addPostgresIntCents(
      insuranceValueCents,
      multiplyPostgresIntCents(unitPriceCents, qty, 'valor segurado'),
      'valor segurado',
    );
  }

  const tier = DIMENSION_TIERS.find((candidate) => itemCount <= candidate.maxPieces) || DIMENSION_TIERS[DIMENSION_TIERS.length - 1];
  return {
    weightKg: Number((totalWeightGrams / 1000).toFixed(3)),
    lengthCm: tier.lengthCm,
    widthCm: tier.widthCm,
    heightCm: tier.heightCm,
    itemCount,
    totalWeightGrams,
    insuranceValueCents,
  };
}

export async function resolveCatalogItems({ supabase, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw shippingError('invalid_request', 'items é obrigatório e não pode estar vazio.', 400);
  }

  const requested = items.map((item, index) => {
    const productId = String(item?.productId ?? item?.id ?? '').trim();
    const qty = Number(item?.qty);
    if (!productId) {
      throw shippingError('invalid_request', `items[${index}].productId é obrigatório.`, 400);
    }
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY) {
      throw shippingError(
        'invalid_request',
        `items[${index}].qty deve ser um inteiro seguro entre 1 e ${MAX_ITEM_QTY}.`,
        400,
      );
    }
    return {
      productId,
      qty,
      size: String(item?.size || ''),
      clientProductName: String(item?.productName ?? item?.name ?? ''),
    };
  });

  const productIds = [...new Set(requested.map((item) => item.productId))];
  const { data: dbProducts, error } = await supabase
    .from('products')
    .select('id, name, price_cents, weight_grams, is_public, in_stock, stock_count, size_options')
    .in('id', productIds);

  if (error) {
    throw shippingError('db_error', 'Falha ao validar os produtos do pedido.', 500);
  }

  const productMap = new Map((dbProducts || []).map((product) => [String(product.id), product]));
  const requestedQtyByProduct = new Map();
  for (const item of requested) {
    requestedQtyByProduct.set(
      item.productId,
      (requestedQtyByProduct.get(item.productId) || 0) + item.qty,
    );
  }

  for (const productId of productIds) {
    const product = productMap.get(productId);
    if (!product || product.is_public !== true) {
      const clientName = requested.find((item) => item.productId === productId)?.clientProductName;
      throw shippingError(
        'invalid_product',
        `O produto "${clientName || productId}" não está mais disponível.`,
        400,
      );
    }

    const stockCount = Number(product.stock_count);
    if (
      typeof product.in_stock !== 'boolean'
      || !Number.isSafeInteger(stockCount)
      || stockCount < 0
      || product.in_stock !== (stockCount > 0)
      || !Array.isArray(product.size_options)
      || product.size_options.some((size) => typeof size !== 'string')
    ) {
      throw shippingError(
        'catalog_data_invalid',
        `Dados de estoque inválidos para o produto ${productId}.`,
        500,
      );
    }

    const requestedQty = requestedQtyByProduct.get(productId);
    if (!product.in_stock || stockCount === 0) {
      throw shippingError(
        'product_out_of_stock',
        `O produto "${product.name || productId}" está sem estoque.`,
        409,
      );
    }
    if (!Number.isSafeInteger(requestedQty) || requestedQty > stockCount) {
      throw shippingError(
        'insufficient_inventory',
        `A quantidade solicitada de "${product.name || productId}" excede o estoque disponível.`,
        409,
      );
    }

    if (product.size_options.length > 0) {
      const hasInvalidSize = requested.some((item) => (
        item.productId === productId
        && (!item.size || !product.size_options.includes(item.size))
      ));
      if (hasInvalidSize) {
        throw shippingError(
          'invalid_product_size',
          `O tamanho solicitado para "${product.name || productId}" não está disponível.`,
          400,
        );
      }
    }
  }

  const resolvedItems = requested.map((item) => {
    const product = productMap.get(item.productId);

    const unitPriceCents = Number(product.price_cents);
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || unitPriceCents > POSTGRES_INT_MAX) {
      throw shippingError(
        'catalog_data_invalid',
        `Preço em centavos inválido para o produto ${item.productId}.`,
        500,
      );
    }
    const weightGrams = safeWeightGrams(product.weight_grams);
    return {
      productId: item.productId,
      productName: product.name || item.clientProductName || '',
      size: item.size,
      qty: item.qty,
      unitPriceCents,
      lineTotalCents: multiplyPostgresIntCents(unitPriceCents, item.qty, 'total da linha'),
      weightGrams,
    };
  });

  const subtotalCents = resolvedItems.reduce(
    (sum, item) => addPostgresIntCents(sum, item.lineTotalCents, 'subtotal'),
    0,
  );

  return {
    resolvedItems,
    subtotalCents,
  };
}

async function lookupCepInfo(toCep, fetchImpl) {
  const response = await fetchImpl(`https://viacep.com.br/ws/${toCep}/json/`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw shippingError('address_lookup_failed', 'Não foi possível validar o CEP de destino.', 502);
  }
  const data = await response.json();
  if (!data || data.erro) {
    throw shippingError('invalid_request', 'CEP de destino não encontrado.', 400);
  }
  return {
    cep: normalizeCep(data.cep || toCep),
    city: String(data.localidade || ''),
    uf: String(data.uf || '').toUpperCase(),
  };
}

async function fetchMelhorEnvioQuote({ toCep, pkg, fetchImpl, melhorEnvioToken }) {
  if (!melhorEnvioToken) {
    throw shippingError('missing_env', 'MELHOR_ENVIO_TOKEN não configurado.', 500);
  }

  const body = {
    from: { postal_code: siteConfig.storeCep },
    to: { postal_code: toCep },
    products: [
      {
        id: '1',
        width: pkg.widthCm,
        height: pkg.heightCm,
        length: pkg.lengthCm,
        weight: pkg.weightKg,
        insurance_value: Number((pkg.insuranceValueCents / 100).toFixed(2)),
        quantity: 1,
      },
    ],
  };

  const response = await fetchImpl('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${melhorEnvioToken}`,
      'User-Agent': 'NobreAmorBaby/1.0',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !Array.isArray(data)) {
    throw shippingError('provider_error', 'Não foi possível calcular o frete. Tente novamente em instantes.', 502);
  }

  const valid = data
    .filter((option) => !option.error && option.price != null && Number(option.price) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price));

  if (valid.length === 0) {
    throw shippingError('no_carriers', 'Nenhuma transportadora disponível para este CEP.', 422);
  }

  const best = valid[0];
  const days = best.delivery_time ?? best.delivery_range?.max;
  const rawFeeCents = Math.round(Number(best.price) * 100);
  requirePostgresIntCents(rawFeeCents, 'frete');
  return {
    rawFeeCents,
    etaText: days ? `${days} dia${days > 1 ? 's' : ''} útei${days > 1 ? 's' : 'l'}` : siteConfig.DEFAULT_ETA_TEXT,
    carrierName: best.name || best.company?.name || null,
    carrierId: best.id || null,
  };
}

export async function calculateAuthoritativeShipping({
  toCep,
  resolvedItems,
  fetchImpl = fetch,
  melhorEnvioToken = process.env.MELHOR_ENVIO_TOKEN,
}) {
  const destinationCep = normalizeCep(toCep);
  if (!/^\d{8}$/.test(destinationCep)) {
    throw shippingError('invalid_request', 'CEP de destino inválido. Envie 8 dígitos.', 400);
  }
  if (!Array.isArray(resolvedItems) || resolvedItems.length === 0) {
    throw shippingError('invalid_request', 'Itens resolvidos são obrigatórios para calcular o frete.', 400);
  }

  const destination = await lookupCepInfo(destinationCep, fetchImpl);
  if (isStoreCity(destination.city, destination.uf)) {
    return {
      feeCents: siteConfig.LOCAL_FIXED_SHIPPING_CENTS,
      rawFeeCents: siteConfig.LOCAL_FIXED_SHIPPING_CENTS,
      surcharge: 0,
      etaText: siteConfig.LOCAL_ETA_TEXT,
      source: 'local_fixed',
      destination,
      pkg: buildPackageFromResolvedItems(resolvedItems),
    };
  }

  const pkg = buildPackageFromResolvedItems(resolvedItems);
  const quote = await fetchMelhorEnvioQuote({
    toCep: destinationCep,
    pkg,
    fetchImpl,
    melhorEnvioToken,
  });
  const surcharge = requirePostgresIntCents(siteConfig.NONLOCAL_SURCHARGE_CENTS, 'acréscimo de frete');
  const feeCents = addPostgresIntCents(quote.rawFeeCents, surcharge, 'frete');

  return {
    feeCents,
    rawFeeCents: quote.rawFeeCents,
    surcharge,
    etaText: quote.etaText,
    source: 'melhorenvio',
    destination,
    pkg,
    carrierName: quote.carrierName,
    carrierId: quote.carrierId,
  };
}
