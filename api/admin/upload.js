/**
 * POST /api/admin/upload
 *
 * Accepts JSON body with:
 *   - file: base64-encoded image data (data URL or raw base64)
 *   - kind: "product" | "collection"
 *   - filename: original filename (optional)
 *
 * Uploads to Supabase Storage (public bucket).
 * Returns: { url, path, bucket }
 *
 * Protected by x-admin-key header.
 */

/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function sanitizeFilename(name) {
  return (name || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .slice(0, 60);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  /* ── auth ──────────────────────────────────────── */
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return json(res, 500, { error: 'missing_env', message: 'Admin key not configured.' });
  }
  if (req.headers['x-admin-key'] !== adminKey) {
    return json(res, 401, { error: 'unauthorized', message: 'Invalid or missing x-admin-key.' });
  }

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) {
      return json(res, 500, { error: 'missing_env', message: 'Storage not configured.' });
    }
    const supabase = createClient(sbUrl, sbKey);

    const body = req.body || {};
    const { file, kind, filename } = body;

    if (!file) {
      return json(res, 400, { error: 'missing_file', message: 'Campo "file" é obrigatório (base64).' });
    }

    if (!kind || !['product', 'collection'].includes(kind)) {
      return json(res, 400, { error: 'invalid_kind', message: 'Campo "kind" deve ser "product" ou "collection".' });
    }

    // Parse base64 — support data URL format or raw base64
    let base64Data = file;
    let contentType = 'image/jpeg';
    if (file.startsWith('data:')) {
      const match = file.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) {
        return json(res, 400, { error: 'invalid_file', message: 'Formato de imagem inválido.' });
      }
      contentType = match[1];
      base64Data = match[2];
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Validate size (6MB)
    if (buffer.length > 6 * 1024 * 1024) {
      return json(res, 400, { error: 'file_too_large', message: 'Imagem excede 6MB.' });
    }

    // Generate storage path
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const safeName = sanitizeFilename(filename);
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${kind}/${yyyy}/${mm}/${uuid}_${safeName}.${ext}`;

    const bucket = kind === 'product' ? 'product-images' : 'collection-images';

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      console.error('[admin/upload] Supabase Storage error:', uploadErr);
      return json(res, 500, { error: 'upload_failed', message: `Falha ao enviar: ${uploadErr.message}` });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    const url = urlData?.publicUrl || '';

    return json(res, 200, { url, path, bucket });
  } catch (err) {
    console.error('[admin/upload] unhandled:', err);
    return json(res, 500, { error: 'internal_error', message: 'Erro interno ao fazer upload.' });
  }
}
