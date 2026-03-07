/**
 * Vercel Serverless Function — POST /api/shipping-quote
 *
 * Proxies shipping-cost requests to the Melhor Envio API so the
 * authentication token never reaches the browser.
 *
 * Environment variable required:
 *   MELHOR_ENVIO_TOKEN — Bearer token from Melhor Envio (sandbox or production)
 *
 * Request body (JSON):
 *   {
 *     toCep:    "35502825"            // destination CEP, digits only
 *     fromCep?: "35502825"            // origin CEP (defaults to store CEP)
 *     package?: {                     // real package data from buildClothingPackage
 *       weightKg:  0.45,
 *       lengthCm:  30,
 *       widthCm:   25,
 *       heightCm:  8,
 *     }
 *     items?: [{ id, qty, priceCents }]   // for insurance value
 *   }
 *
 * Response (JSON):
 *   { feeCents: 2340, etaText: "5 dias úteis" }   // cheapest option
 *   or { error: "..." }
 *
 * Query params:
 *   ?debug=1 — include debug fields in response
 */

// Fallback defaults (used only when request has no `package`)
const DEFAULT_WEIGHT_KG = 0.3;
const DEFAULT_WIDTH_CM  = 20;
const DEFAULT_HEIGHT_CM = 5;
const DEFAULT_LENGTH_CM = 15;

/** Store origin CEP used when fromCep is not supplied */
const FALLBACK_FROM_CEP = '35502825';

export default async function handler(req, res) {
  /* ── CORS ──────────────────────────────────────────── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Validate env ──────────────────────────────────── */
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) {
    console.error('[shipping-quote] MELHOR_ENVIO_TOKEN not set');
    return res.status(500).json({ error: 'Serviço de frete indisponível.' });
  }

  /* ── Parse body ────────────────────────────────────── */
  const { toCep, fromCep, items } = req.body || {};
  const pkg = req.body?.package;

  if (!toCep || typeof toCep !== 'string' || !/^\d{8}$/.test(toCep)) {
    return res.status(400).json({ error: 'CEP de destino inválido.' });
  }

  const originCep = (fromCep && /^\d{8}$/.test(fromCep)) ? fromCep : FALLBACK_FROM_CEP;
  const wantDebug = req.query?.debug === '1';

  /* ── Resolve package dimensions ────────────────────── */
  let totalWeight, totalLength, totalWidth, totalHeight;
  let usingDefaults = true;

  if (pkg && typeof pkg === 'object') {
    const { weightKg, lengthCm, widthCm, heightCm } = pkg;
    // Validate
    if (weightKg <= 0 || lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) {
      return res.status(400).json({ error: 'Dimensões/peso do pacote inválidos.' });
    }
    totalWeight = +Number(weightKg).toFixed(3);
    totalLength = Number(lengthCm);
    totalWidth  = Number(widthCm);
    totalHeight = Math.min(Number(heightCm), 100); // Melhor Envio cap
    usingDefaults = false;
  } else {
    // Legacy fallback
    const totalQty = Array.isArray(items)
      ? items.reduce((sum, i) => sum + (Number(i.qty) || 1), 0)
      : 1;
    totalWeight = +(totalQty * DEFAULT_WEIGHT_KG).toFixed(2);
    totalWidth   = DEFAULT_WIDTH_CM;
    totalHeight  = Math.min(totalQty * DEFAULT_HEIGHT_CM, 100);
    totalLength  = DEFAULT_LENGTH_CM;
  }

  /* ── Insurance value from items ────────────────────── */
  const insuranceValue = Array.isArray(items)
    ? items.reduce((sum, i) => sum + ((Number(i.priceCents) || 0) * (Number(i.qty) || 1)), 0) / 100
    : 0;

  /* ── Call Melhor Envio ─────────────────────────────── */
  const meBody = {
    from: { postal_code: originCep },
    to:   { postal_code: toCep },
    products: [
      {
        id: '1',
        width:    totalWidth,
        height:   totalHeight,
        length:   totalLength,
        weight:   totalWeight,
        insurance_value: insuranceValue,
        quantity: 1,
      },
    ],
  };

  try {
    const meRes = await fetch(
      'https://melhorenvio.com.br/api/v2/me/shipment/calculate',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'NobreAmorBaby/1.0',
        },
        body: JSON.stringify(meBody),
      },
    );

    if (!meRes.ok) {
      const text = await meRes.text();
      console.error('[shipping-quote] Melhor Envio HTTP', meRes.status, text);
      return res.status(502).json({ error: 'Não foi possível calcular o frete.' });
    }

    const data = await meRes.json();

    // data is an array of carrier options; pick the cheapest non-error option
    const valid = (Array.isArray(data) ? data : [])
      .filter((o) => !o.error && o.price != null && Number(o.price) > 0);

    if (valid.length === 0) {
      return res.status(200).json({ error: 'Nenhuma transportadora disponível para este CEP.' });
    }

    valid.sort((a, b) => Number(a.price) - Number(b.price));
    const best = valid[0];

    const feeCents = Math.round(Number(best.price) * 100);
    const days = best.delivery_time ?? best.delivery_range?.max;
    const etaText = days ? `${days} dia${days > 1 ? 's' : ''} útei${days > 1 ? 's' : 'l'}` : '';

    const result = { feeCents, etaText };

    if (wantDebug) {
      result.debug = {
        sentWeightKg: totalWeight,
        sentDimensionsCm: `${totalLength}×${totalWidth}×${totalHeight}`,
        insuranceValue,
        usingDefaults,
        carrierName: best.name || best.company?.name || null,
        carrierId: best.id || null,
        allCarriers: valid.map((o) => ({
          name: o.name || o.company?.name,
          price: o.price,
          days: o.delivery_time ?? o.delivery_range?.max,
        })),
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[shipping-quote] fetch error', err);
    return res.status(502).json({ error: 'Erro ao consultar frete.' });
  }
}
