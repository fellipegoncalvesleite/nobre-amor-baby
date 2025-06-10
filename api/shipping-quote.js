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
 * Response (JSON — ALWAYS):
 *   200: { feeCents, etaText, source?, debug? }
 *   400: { error: "invalid_request", message: "..." }
 *   405: { error: "method_not_allowed", message: "..." }
 *   500: { error: "missing_env"|"internal_error", message: "..." }
 *   502: { error: "provider_error", message: "..." }
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

/** Helper — always return JSON, never HTML or empty body */
function jsonResponse(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  /* ── CORS ──────────────────────────────────────────── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, {
      error: 'method_not_allowed',
      message: `Método ${req.method} não permitido. Use POST.`,
    });
  }

  try {
    /* ── Validate env ──────────────────────────────────── */
    const token = process.env.MELHOR_ENVIO_TOKEN;
    if (!token) {
      console.error('[shipping-quote] MELHOR_ENVIO_TOKEN not set');
      return jsonResponse(res, 500, {
        error: 'missing_env',
        message: 'MELHOR_ENVIO_TOKEN not set. Configure a variável de ambiente no Vercel.',
      });
    }

    /* ── Parse body ────────────────────────────────────── */
    const body = req.body || {};
    const { toCep, fromCep, items } = body;
    const pkg = body.package;

    if (!toCep || typeof toCep !== 'string' || !/^\d{8}$/.test(toCep)) {
      return jsonResponse(res, 400, {
        error: 'invalid_request',
        message: 'CEP de destino inválido. Envie toCep com 8 dígitos.',
      });
    }

    if (pkg && typeof pkg === 'object') {
      const { weightKg, lengthCm, widthCm, heightCm } = pkg;
      if (!weightKg || weightKg <= 0 || !lengthCm || lengthCm <= 0 ||
          !widthCm || widthCm <= 0 || !heightCm || heightCm <= 0) {
        return jsonResponse(res, 400, {
          error: 'invalid_request',
          message: 'Dimensões/peso do pacote inválidos. Todos devem ser > 0.',
        });
      }
    }

    const originCep = (fromCep && /^\d{8}$/.test(fromCep)) ? fromCep : FALLBACK_FROM_CEP;
    const wantDebug = req.query?.debug === '1';

    /* ── Resolve package dimensions ────────────────────── */
    let totalWeight, totalLength, totalWidth, totalHeight;
    let usingDefaults = true;

    if (pkg && typeof pkg === 'object') {
      totalWeight = +Number(pkg.weightKg).toFixed(3);
      totalLength = Number(pkg.lengthCm);
      totalWidth  = Number(pkg.widthCm);
      totalHeight = Math.min(Number(pkg.heightCm), 100); // Melhor Envio cap
      usingDefaults = false;
    } else {
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

    const itemsCount = Array.isArray(items) ? items.length : 0;
    console.log('[shipping-quote] toCep=%s originCep=%s weight=%.3fkg dims=%dx%dx%d items=%d',
      toCep, originCep, totalWeight, totalLength, totalWidth, totalHeight, itemsCount);

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

    /* ── Parse Melhor Envio response safely ───────────── */
    const meText = await meRes.text();
    let meData = null;
    try {
      meData = meText ? JSON.parse(meText) : null;
    } catch {
      // Melhor Envio returned non-JSON (HTML error page, etc.)
    }

    if (!meRes.ok || !meData) {
      console.error('[shipping-quote] Melhor Envio HTTP %d — body: %s',
        meRes.status, (meText || '').slice(0, 300));
      return jsonResponse(res, 502, {
        error: 'provider_error',
        message: 'Não foi possível calcular o frete. Tente novamente em instantes.',
      });
    }

    // data is an array of carrier options; pick the cheapest non-error option
    const valid = (Array.isArray(meData) ? meData : [])
      .filter((o) => !o.error && o.price != null && Number(o.price) > 0);

    if (valid.length === 0) {
      console.log('[shipping-quote] No valid carriers for CEP %s', toCep);
      return jsonResponse(res, 200, {
        error: 'no_carriers',
        message: 'Nenhuma transportadora disponível para este CEP.',
      });
    }

    valid.sort((a, b) => Number(a.price) - Number(b.price));
    const best = valid[0];

    const feeCents = Math.round(Number(best.price) * 100);
    const days = best.delivery_time ?? best.delivery_range?.max;
    const etaText = days ? `${days} dia${days > 1 ? 's' : ''} útei${days > 1 ? 's' : 'l'}` : '';

    console.log('[shipping-quote] OK → %d cents, %s, carrier=%s',
      feeCents, etaText, best.name || best.company?.name || '?');

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

    return jsonResponse(res, 200, result);
  } catch (err) {
    console.error('[shipping-quote] Unhandled error:', err);
    return jsonResponse(res, 500, {
      error: 'internal_error',
      message: 'Erro interno ao processar cotação de frete.',
    });
  }
}
