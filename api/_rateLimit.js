import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

const GLOBAL_SUBJECT = 'storefront';

export function getRateLimitClientIp(req) {
  const sources = [
    req?.headers?.['x-vercel-forwarded-for'],
    req?.headers?.['x-forwarded-for'],
    req?.headers?.['x-real-ip'],
    req?.socket?.remoteAddress,
  ];

  for (const source of sources) {
    if (source == null) continue;
    const values = Array.isArray(source) ? source : String(source).split(',');
    for (const value of values) {
      let candidate = String(value || '').trim();
      if (!candidate) continue;
      if (candidate.startsWith('::ffff:')) {
        const mapped = candidate.slice(7);
        if (isIP(mapped) === 4) candidate = mapped;
      }
      if (isIP(candidate)) return candidate;
    }
  }

  return null;
}

export function hashRateLimitSubject(kind, subject) {
  return createHash('sha256')
    .update(`${String(kind)}\0${String(subject)}`)
    .digest('hex');
}

function rateLimitUnavailable(cause) {
  const error = new Error('Rate limiter unavailable');
  error.code = 'rate_limit_unavailable';
  error.status = 503;
  error.cause = cause;
  return error;
}

export async function consumeRateLimit(supabase, {
  scope,
  kind,
  subject,
  limit,
  windowSeconds,
  cost = 1,
}) {
  if (subject == null) return { allowed: true, skipped: true };

  const subjectHash = hashRateLimitSubject(kind, subject);
  let response;
  try {
    response = await supabase.rpc('consume_api_rate_limit', {
      p_scope: scope,
      p_subject_hash: subjectHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
      p_cost: cost,
    });
  } catch (error) {
    throw rateLimitUnavailable(error);
  }

  const { data, error } = response || {};
  if (error) throw rateLimitUnavailable(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== 'boolean') {
    throw rateLimitUnavailable(new Error('Invalid rate-limit RPC response'));
  }

  return {
    allowed: row.allowed,
    limit: Number(row.limit_value ?? row.limit),
    remaining: Math.max(0, Number(row.remaining) || 0),
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
    resetAt: row.reset_at || null,
    requestCount: Number(row.request_count) || 0,
  };
}

export async function consumeRateLimits(supabase, rules) {
  for (const rule of rules) {
    if (rule?.subject == null) continue;
    const result = await consumeRateLimit(supabase, rule);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

export function respondRateLimited(res, result) {
  const retryAfterSeconds = Math.max(1, Math.ceil(Number(result?.retryAfterSeconds) || 1));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(429).json({
    error: 'rate_limited',
    message: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    retryAfterSeconds,
  });
}

export function respondRateLimitUnavailable(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(503).json({
    error: 'rate_limit_unavailable',
    message: 'Não foi possível validar o limite de tentativas agora. Tente novamente em instantes.',
  });
}

export function buildIpRule(req, { scope, limit, windowSeconds }) {
  return {
    scope,
    kind: 'ip',
    subject: getRateLimitClientIp(req),
    limit,
    windowSeconds,
  };
}

export function buildGlobalRule({ scope, limit, windowSeconds }) {
  return {
    scope,
    kind: 'global',
    subject: GLOBAL_SUBJECT,
    limit,
    windowSeconds,
  };
}

export const RATE_LIMIT_GLOBAL_SUBJECT = GLOBAL_SUBJECT;
