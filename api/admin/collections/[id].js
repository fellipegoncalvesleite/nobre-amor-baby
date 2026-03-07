/**
 * /api/admin/collections/[id]
 *   PATCH  — update a collection
 *   DELETE — delete a collection
 *
 * Protected by x-admin-key header.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use PATCH or DELETE.' });
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

    const { id } = req.query;
    if (!id) return json(res, 400, { error: 'bad_request', message: 'Collection id is required.' });

    /* ── DELETE ──────────────────────────────────── */
    if (req.method === 'DELETE') {
      const { error: delErr } = await supabase.from('collections').delete().eq('id', id);
      if (delErr) {
        console.error('[admin/collections/delete] error:', delErr);
        return json(res, 500, { error: 'db_error', message: 'Falha ao excluir coleção.' });
      }
      return json(res, 200, { deleted: true });
    }

    /* ── PATCH ───────────────────────────────────── */
    const body = req.body || {};
    const updates = {};

    if (body.name !== undefined) updates.name = body.name?.trim();
    if (body.slug !== undefined) updates.slug = body.slug?.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (body.image_url !== undefined) updates.image_url = body.image_url || null;

    if (Object.keys(updates).length === 0) {
      return json(res, 400, { error: 'no_changes', message: 'Nenhum campo para atualizar.' });
    }

    const { data, error: updateErr } = await supabase
      .from('collections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin/collections/patch] error:', updateErr);
      if (updateErr.code === '23505') {
        return json(res, 409, { error: 'duplicate_slug', message: 'Slug já existe.' });
      }
      return json(res, 500, { error: 'db_error', message: 'Falha ao atualizar coleção.' });
    }

    if (!data) return json(res, 404, { error: 'not_found', message: 'Coleção não encontrada.' });

    return json(res, 200, { collection: data });
  } catch (err) {
    console.error('[admin/collections/id] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno.' });
  }
}
