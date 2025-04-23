/**
 * _supabaseAdmin.js — shared helpers for Vercel API routes.
 *
 * Provides:
 *   getSupabase()         — Supabase client with service-role key
 *   verifyUser(req)       — decode JWT from Authorization header → { user, supabase }
 *   requireManager(req)   — verifyUser + check profile.role is manager or debug
 *
 * The JWT is validated by Supabase's own getUser() which contacts auth server.
 */
import { createClient } from '@supabase/supabase-js';

/* ── Service-role client (for DB writes) ────────── */
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

/* ── Verify JWT from Authorization header ────────── */
export async function verifyUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { user: null, profile: null };

  const supabase = getSupabase();

  // Validate the JWT by calling Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, profile: null };

  // Fetch profile (role)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile: profile || { id: user.id, email: user.email, role: 'customer' } };
}

/* ── Require manager/debug role ──────────────────── */
export async function requireManager(req, res) {
  const { user, profile } = await verifyUser(req);
  if (!user) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(401).json({ error: 'unauthorized', message: 'Token inválido ou ausente.' });
    return null;
  }
  if (!profile || (profile.role !== 'manager' && profile.role !== 'debug')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(403).json({ error: 'forbidden', message: 'Acesso restrito a gerentes.' });
    return null;
  }
  return { user, profile };
}
