/**
 * /api/admin/collections
 *   GET  — list all collections
 *   POST — create a new collection
 *
 * Protected by x-admin-key header.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use GET or POST.' });
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return json(res, 500, { error: 'missing_env', message: 'Admin key not configured.' });
  if (req.headers['x-admin-key'] !== adminKey) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid or missing x-admin-key.' });
  }

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) return json(res, 500, { error: 'missing_env', message: 'Database not configured.' });
    const supabase = createClient(sbUrl, sbKey);

    /* ── GET: list ──────────────────────────────── */
    if (req.method === 'GET') {
      const { data, error: queryErr } = await supabase
        .from('collections')
        .select('*')
        .order('name', { ascending: true });

      if (queryErr) {
        console.error('[admin/collections] list error:', queryErr);
        return json(res, 500, { error: 'db_error', message: 'Falha ao listar coleções.' });
      }

      return json(res, 200, { collections: data || [] });
    }

    /* ── POST: create ───────────────────────────── */
    if (req.method === 'POST') {
      const body = req.body || {};
      const { name, slug: rawSlug, description, is_active, image_url } = body;

      if (!name?.trim()) return json(res, 400, { error: 'validation', message: 'Nome é obrigatório.' });

      const slug = rawSlug?.trim() || slugify(name);

      const row = {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        is_active: is_active !== false,
        image_url: image_url?.trim() || null,
      };

      const { data, error: insertErr } = await supabase
        .from('collections')
        .insert(row)
        .select()
        .single();

      if (insertErr) {
        console.error('[admin/collections] insert error:', insertErr);
        if (insertErr.code === '23505') {
          return json(res, 409, { error: 'duplicate_slug', message: 'Slug já existe.' });
        }
        return json(res, 500, { error: 'db_error', message: 'Falha ao criar coleção.' });
      }

      return json(res, 201, { collection: data });
    }
  } catch (err) {
    console.error('[admin/collections] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}
