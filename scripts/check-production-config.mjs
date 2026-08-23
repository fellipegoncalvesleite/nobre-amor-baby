import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ASAAS_API_KEY',
  'ASAAS_API_URL',
  'ASAAS_WEBHOOK_TOKEN',
  'MELHOR_ENVIO_TOKEN',
  'SITE_URL',
  'VITE_SITE_URL',
];

const PLACEHOLDER_PATTERNS = [
  /your-project/i,
  /your-public/i,
  /your-service/i,
  /your-asaas/i,
  /your-melhor/i,
  /your-site-domain/i,
  /change[-_ ]?me/i,
  /replace[-_ ]?me/i,
  /placeholder/i,
];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholder(value) {
  const raw = text(value);
  return raw !== '' && PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(raw));
}

function parseHttpsUrl(value) {
  const raw = text(value);
  if (!raw) return { ok: false, reason: 'is required' };
  if (isPlaceholder(raw)) return { ok: false, reason: 'contains a committed placeholder value' };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'must be an absolute HTTPS URL' };
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'must use HTTPS' };
  if (url.username || url.password) return { ok: false, reason: 'must not contain credentials' };
  return { ok: true, url };
}

function parseCanonicalOrigin(value) {
  const parsed = parseHttpsUrl(value);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  if (url.search) return { ok: false, reason: 'must not contain a query string' };
  if (url.hash) return { ok: false, reason: 'must not contain a fragment' };
  if (url.pathname !== '/' && url.pathname !== '') return { ok: false, reason: 'must be an origin with no non-root path' };
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return { ok: false, reason: 'must use a production hostname, not localhost' };
  }
  return { ok: true, origin: url.origin };
}

function parseCorsOrigin(value) {
  const raw = text(value);
  if (!raw) return { ok: false, reason: 'origin is empty' };
  if (raw.includes('*')) return { ok: false, reason: 'wildcards are not allowed' };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'must contain only valid absolute HTTP(S) origins' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'must contain only HTTP(S) origins' };
  }
  if (url.username || url.password) return { ok: false, reason: 'origins must not contain credentials' };
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    return { ok: false, reason: 'entries must be exact origins with no path, query, or fragment' };
  }
  return { ok: true, origin: url.origin };
}

function addError(errors, variable, reason) {
  errors.push({ variable, reason });
}

export function validateProductionConfig(env = {}) {
  const errors = [];

  for (const variable of REQUIRED) {
    const value = text(env[variable]);
    if (!value) {
      addError(errors, variable, 'is required');
      continue;
    }
    if (isPlaceholder(value)) addError(errors, variable, 'contains a committed placeholder value');
  }

  const publicSupabase = parseHttpsUrl(env.VITE_SUPABASE_URL);
  const serverSupabase = parseHttpsUrl(env.SUPABASE_URL);
  if (!publicSupabase.ok && text(env.VITE_SUPABASE_URL)) addError(errors, 'VITE_SUPABASE_URL', publicSupabase.reason);
  if (!serverSupabase.ok && text(env.SUPABASE_URL)) addError(errors, 'SUPABASE_URL', serverSupabase.reason);
  if (publicSupabase.ok && serverSupabase.ok && publicSupabase.url.origin !== serverSupabase.url.origin) {
    addError(errors, 'VITE_SUPABASE_URL', 'must match the SUPABASE_URL origin');
  }

  const site = parseCanonicalOrigin(env.SITE_URL);
  const viteSite = parseCanonicalOrigin(env.VITE_SITE_URL);
  if (!site.ok && text(env.SITE_URL)) addError(errors, 'SITE_URL', site.reason);
  if (!viteSite.ok && text(env.VITE_SITE_URL)) addError(errors, 'VITE_SITE_URL', viteSite.reason);
  if (site.ok && viteSite.ok && site.origin !== viteSite.origin) {
    addError(errors, 'VITE_SITE_URL', 'must match the SITE_URL canonical origin');
  }

  const asaas = parseHttpsUrl(env.ASAAS_API_URL);
  if (!asaas.ok && text(env.ASAAS_API_URL)) {
    addError(errors, 'ASAAS_API_URL', asaas.reason);
  } else if (asaas.ok) {
    const lower = asaas.url.href.toLowerCase();
    if (asaas.url.hostname.toLowerCase() === 'sandbox.asaas.com' || lower.includes('sandbox')) {
      addError(errors, 'ASAAS_API_URL', 'sandbox endpoint is not allowed for production');
    }
  }

  if (text(env.VITE_WA_TEST).toLowerCase() === 'true') {
    addError(errors, 'VITE_WA_TEST', 'test mode must be disabled for production');
  }
  if (text(env.VITE_WA_TEST_NUMBER)) {
    addError(errors, 'VITE_WA_TEST_NUMBER', 'must be empty in production');
  }

  const corsRaw = text(env.CORS_ALLOWED_ORIGINS);
  if (corsRaw) {
    const entries = corsRaw.split(',').map((entry) => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const parsed = parseCorsOrigin(entry);
      if (!parsed.ok) {
        addError(errors, 'CORS_ALLOWED_ORIGINS', parsed.reason);
        break;
      }
    }
  }

  const uniqueErrors = [];
  const seen = new Set();
  for (const error of errors) {
    const key = `${error.variable}\u0000${error.reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueErrors.push(error);
    }
  }

  return {
    ok: uniqueErrors.length === 0,
    errors: uniqueErrors,
    checks: {
      siteUrlsConfigured: Boolean(site.ok && viteSite.ok),
      supabaseOriginsConsistent: Boolean(publicSupabase.ok && serverSupabase.ok && publicSupabase.url.origin === serverSupabase.url.origin),
      asaasNonSandbox: Boolean(asaas.ok && !asaas.url.href.toLowerCase().includes('sandbox')),
      whatsappTestModeDisabled: text(env.VITE_WA_TEST).toLowerCase() !== 'true' && !text(env.VITE_WA_TEST_NUMBER),
    },
  };
}

function printResult(result) {
  if (result.ok) {
    console.log('PRODUCTION CONFIG: PASS');
    console.log('- SITE_URL: configured');
    console.log('- VITE_SITE_URL: configured');
    console.log('- Supabase origins: consistent');
    console.log('- Asaas environment: non-sandbox');
    console.log('- WhatsApp test mode: disabled');
    return;
  }

  console.error('PRODUCTION CONFIG: FAIL');
  for (const error of result.errors) {
    console.error(`- ${error.variable}: ${error.reason}`);
  }
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const result = validateProductionConfig(process.env);
  printResult(result);
  if (!result.ok) process.exitCode = 1;
}
