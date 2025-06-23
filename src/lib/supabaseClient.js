/**
 * Supabase browser client — used for Auth (login/signup/session).
 *
 * Uses the ANON key (safe to expose in the browser).
 * DB writes go through server-side API functions using the SERVICE_ROLE key.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const CONFIG_ERROR_CODE = 'SUPABASE_ENV_MISSING';
const CONFIG_ERROR_MESSAGE = 'Não foi possível iniciar a autenticação do site. Tente novamente mais tarde.';
const AUTH_UNREACHABLE_ERROR_CODE = 'SUPABASE_AUTH_UNREACHABLE';
const AUTH_UNREACHABLE_MESSAGE = 'Não foi possível conectar ao servidor de autenticação do site. Tente novamente mais tarde.';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function getSupabaseConfigError() {
  const error = new Error(CONFIG_ERROR_MESSAGE);
  error.name = 'SupabaseConfigError';
  error.code = CONFIG_ERROR_CODE;
  error.status = 503;
  return error;
}

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) throw getSupabaseConfigError();
}

export function getSupabaseAuthUnreachableError() {
  const error = new Error(AUTH_UNREACHABLE_MESSAGE);
  error.name = 'SupabaseAuthUnreachableError';
  error.code = AUTH_UNREACHABLE_ERROR_CODE;
  error.status = 503;
  return error;
}

export async function ensureSupabaseAuthReachable(timeoutMs = 3500) {
  assertSupabaseConfigured();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const healthUrl = new URL('/auth/v1/settings', supabaseUrl).toString();
    await fetch(healthUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    throw Object.assign(getSupabaseAuthUnreachableError(), { cause: error });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

if (!isSupabaseConfigured) {
  console.warn(
    '[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Auth features are disabled. Set them in .env or the Vercel dashboard.',
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    },
  )
  : null;
