function getRequestHeader(req, name) {
  const headers = req?.headers || {};
  const target = String(name).toLowerCase();

  if (Object.prototype.hasOwnProperty.call(headers, target)) {
    const value = headers[target];
    return Array.isArray(value) ? value[0] : value;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}

function getExistingHeader(res, name) {
  if (typeof res?.getHeader === 'function') return res.getHeader(name);

  const headers = res?.headers;
  if (headers instanceof Map) return headers.get(String(name).toLowerCase()) ?? headers.get(name);
  if (headers && typeof headers === 'object') {
    const target = String(name).toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (String(key).toLowerCase() === target) return value;
    }
  }

  return undefined;
}

function appendVary(res, ...names) {
  const existing = getExistingHeader(res, 'Vary');
  const tokens = Array.isArray(existing)
    ? existing.flatMap((value) => String(value).split(','))
    : String(existing || '').split(',');
  const normalized = tokens.map((value) => value.trim()).filter(Boolean);

  if (normalized.some((value) => value === '*')) return;

  const seen = new Set(normalized.map((value) => value.toLowerCase()));
  for (const name of names) {
    const value = String(name).trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    normalized.push(value);
    seen.add(value.toLowerCase());
  }

  if (normalized.length > 0) res.setHeader('Vary', normalized.join(', '));
}

export function normalizeOrigin(value, { allowPath = false } = {}) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === 'null') return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!allowPath && (parsed.pathname !== '/' || parsed.search || parsed.hash)) return null;

  return parsed.origin;
}

function getCurrentRequestOrigin(req) {
  const hostValue = getRequestHeader(req, 'host');
  if (typeof hostValue !== 'string' || !hostValue.trim()) return null;

  const forwardedProto = getRequestHeader(req, 'x-forwarded-proto');
  const firstForwardedProto = typeof forwardedProto === 'string'
    ? forwardedProto.split(',')[0].trim().toLowerCase()
    : '';
  const scheme = firstForwardedProto === 'http' || firstForwardedProto === 'https'
    ? firstForwardedProto
    : (req?.socket?.encrypted ? 'https' : 'http');

  return normalizeOrigin(`${scheme}://${hostValue.trim()}`);
}

export function getAllowedOrigins(req, env = process.env) {
  const allowed = new Set();

  const requestOrigin = getCurrentRequestOrigin(req);
  if (requestOrigin) allowed.add(requestOrigin);

  const siteOrigin = normalizeOrigin(env?.SITE_URL, { allowPath: true });
  if (siteOrigin) allowed.add(siteOrigin);

  const configured = typeof env?.CORS_ALLOWED_ORIGINS === 'string'
    ? env.CORS_ALLOWED_ORIGINS.split(',')
    : [];
  for (const entry of configured) {
    const origin = normalizeOrigin(entry);
    if (origin) allowed.add(origin);
  }

  return allowed;
}

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function denyOrigin(res) {
  sendJson(res, 403, {
    error: 'origin_not_allowed',
    message: 'Origem não autorizada.',
  });
  return true;
}

function denyPreflight(res) {
  sendJson(res, 403, {
    error: 'cors_preflight_denied',
    message: 'Preflight CORS não autorizado.',
  });
  return true;
}

export function applyApiCors(req, res, {
  methods,
  allowedHeaders,
  env = process.env,
}) {
  const declaredMethods = [...new Set((methods || []).map((method) => String(method).trim().toUpperCase()).filter(Boolean))];
  const declaredHeaders = [...new Set((allowedHeaders || []).map((header) => String(header).trim()).filter(Boolean))];
  const allowedMethodSet = new Set(declaredMethods);
  const allowedHeaderSet = new Set(declaredHeaders.map((header) => header.toLowerCase()));

  appendVary(res, 'Origin');

  const rawOrigin = getRequestHeader(req, 'origin');
  const hasOrigin = rawOrigin !== undefined;
  let requestOrigin = null;

  if (hasOrigin) {
    requestOrigin = normalizeOrigin(rawOrigin);
    if (!requestOrigin || !getAllowedOrigins(req, env).has(requestOrigin)) {
      return denyOrigin(res);
    }
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  if (String(req?.method || '').toUpperCase() !== 'OPTIONS') return false;

  appendVary(res, 'Access-Control-Request-Method', 'Access-Control-Request-Headers');

  const requestedMethodHeader = getRequestHeader(req, 'access-control-request-method');
  const requestedMethod = typeof requestedMethodHeader === 'string'
    ? requestedMethodHeader.trim().toUpperCase()
    : '';
  if (requestedMethod && !allowedMethodSet.has(requestedMethod)) {
    return denyPreflight(res);
  }

  const requestedHeadersValue = getRequestHeader(req, 'access-control-request-headers');
  const requestedHeaders = typeof requestedHeadersValue === 'string'
    ? requestedHeadersValue.split(',').map((header) => header.trim()).filter(Boolean)
    : [];
  if (requestedHeaders.some((header) => !allowedHeaderSet.has(header.toLowerCase()))) {
    return denyPreflight(res);
  }

  res.setHeader('Access-Control-Allow-Methods', declaredMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', declaredHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '600');
  res.status(204).end();
  return true;
}
