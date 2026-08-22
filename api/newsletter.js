import { getSupabase } from './_supabaseAdmin.js';
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createNewsletterHandler(overrides = {}) {
  const deps = { getSupabase, consumeRateLimits, ...overrides };

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
    }

    try {
      const email = normalizeEmail(req.body?.email);
      const source = String(req.body?.source || 'footer').trim() || 'footer';

      if (!isValidEmail(email)) {
        return json(res, 400, { error: 'invalid_email', message: 'Informe um e-mail válido.' });
      }

      const supabase = deps.getSupabase();
      let rateLimit;
      try {
        rateLimit = await deps.consumeRateLimits(supabase, [
          buildIpRule(req, { scope: 'newsletter:ip', limit: 5, windowSeconds: 3600 }),
          { scope: 'newsletter:email', kind: 'email', subject: email, limit: 3, windowSeconds: 86400 },
          buildGlobalRule({ scope: 'newsletter:global', limit: 300, windowSeconds: 3600 }),
        ]);
      } catch (error) {
        console.error('[newsletter] rate limiter unavailable:', error?.code || 'rate_limit_unavailable');
        return respondRateLimitUnavailable(res);
      }
      if (!rateLimit.allowed) return respondRateLimited(res, rateLimit);

      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({
          email,
          source,
        });

      if (error) {
        const duplicate = error.code === '23505' || /duplicate|newsletter_subscribers_email_ci_idx/i.test(error.message || '');
        if (duplicate) {
          return json(res, 200, {
            success: true,
            duplicate: true,
            message: 'Este e-mail já está inscrito.',
          });
        }

        console.error('[newsletter] insert error:', error);
        return json(res, 500, { error: 'db_error', message: 'Não foi possível salvar seu e-mail.' });
      }

      return json(res, 201, {
        success: true,
        duplicate: false,
        message: 'Inscrição confirmada com sucesso.',
      });
    } catch (err) {
      console.error('[newsletter] unhandled:', err);
      return json(res, 500, { error: 'internal_error', message: 'Erro interno ao salvar inscrição.' });
    }
  };
}

const handler = createNewsletterHandler();
export default handler;
