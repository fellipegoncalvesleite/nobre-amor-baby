import { getSupabase } from './_supabaseAdmin.js';
import { calculateAuthoritativeShipping, resolveCatalogItems } from './_serverShipping.js';
import {
  buildGlobalRule,
  buildIpRule,
  consumeRateLimits,
  respondRateLimited,
  respondRateLimitUnavailable,
} from './_rateLimit.js';

function jsonResponse(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export function createShippingQuoteHandler(overrides = {}) {
  const deps = {
    getSupabase,
    resolveCatalogItems,
    calculateAuthoritativeShipping,
    consumeRateLimits,
    ...overrides,
  };

  return async function handler(req, res) {
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
      const body = req.body || {};
      const supabase = deps.getSupabase();
      let rateLimit;
      try {
        rateLimit = await deps.consumeRateLimits(supabase, [
          buildIpRule(req, { scope: 'shipping-quote:ip', limit: 40, windowSeconds: 300 }),
          buildGlobalRule({ scope: 'shipping-quote:global', limit: 2000, windowSeconds: 300 }),
        ]);
      } catch (error) {
        console.error('[shipping-quote] rate limiter unavailable:', error?.code || 'rate_limit_unavailable');
        return respondRateLimitUnavailable(res);
      }
      if (!rateLimit.allowed) return respondRateLimited(res, rateLimit);

      const { resolvedItems } = await deps.resolveCatalogItems({ supabase, items: body.items });
      const quote = await deps.calculateAuthoritativeShipping({
        toCep: body.toCep,
        resolvedItems,
      });

      const result = {
        feeCents: quote.feeCents,
        etaText: quote.etaText,
        source: quote.source,
      };

      if (req.query?.debug === '1') {
        result.debug = {
          rawFeeCents: quote.rawFeeCents,
          surcharge: quote.surcharge,
          package: quote.pkg,
          destination: quote.destination,
          carrierName: quote.carrierName || null,
          carrierId: quote.carrierId || null,
        };
      }

      return jsonResponse(res, 200, result);
    } catch (error) {
      const status = Number(error?.status) || 500;
      const code = error?.code || 'internal_error';
      if (status >= 500) {
        console.error('[shipping-quote] authoritative quote failed:', {
          code,
          message: error?.message || 'unknown error',
        });
      }
      return jsonResponse(res, status, {
        error: code,
        message: error?.message || 'Erro interno ao processar cotação de frete.',
      });
    }
  };
}

const handler = createShippingQuoteHandler();
export default handler;
