import siteConfig from '../src/config/siteConfig.js';

const PACKAGE_OVERHEAD_GRAMS = 50;
const DEFAULT_WEIGHT_GRAMS = 200;
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
    const qty = Number(item.qty || 0);
    const weightGrams = Number(item.weightGrams || DEFAULT_WEIGHT_GRAMS);
    const unitPriceCents = Number(item.unitPriceCents || 0);
    itemCount += qty;
    totalWeightGrams += weightGrams * qty;
    insuranceValueCents += unitPriceCents * qty;
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
    if (!Number.isInteger(qty) || qty < 1) {
      throw shippingError('invalid_request', `items[${index}].qty deve ser um inteiro >= 1.`, 400);
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
    .select('id, name, price_cents, weight_grams, is_public')
    .in('id', productIds);

  if (error) {
    throw shippingError('db_error', 'Falha ao validar os produtos do pedido.', 500);
  }

  const productMap = new Map((dbProducts || []).map((product) => [String(product.id), product]));
  const resolvedItems = requested.map((item) => {
    const product = productMap.get(item.productId);
    if (!product || product.is_public === false) {
      throw shippingError(
        'invalid_product',
        `O produto "${item.clientProductName || item.productId}" não está mais disponível.`,
        400,
      );
    }

    const unitPriceCents = Math.round(Number(product.price_cents));
    const weightGrams = Number(product.weight_grams || DEFAULT_WEIGHT_GRAMS);
    return {
      productId: item.productId,
      productName: product.name || item.clientProductName || '',
      size: item.size,
      qty: item.qty,
      unitPriceCents,
      lineTotalCents: unitPriceCents * item.qty,
      weightGrams,
    };
  });

  return {
    resolvedItems,
    subtotalCents: resolvedItems.reduce((sum, item) => sum + item.lineTotalCents, 0),
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
  return {
    rawFeeCents: Math.round(Number(best.price) * 100),
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
  const surcharge = siteConfig.NONLOCAL_SURCHARGE_CENTS;

  return {
    feeCents: quote.rawFeeCents + surcharge,
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
