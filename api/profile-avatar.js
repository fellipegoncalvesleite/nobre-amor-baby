import { getSupabase, verifyUser } from './_supabaseAdmin.js';

const BUCKET = 'profile-images';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function sanitizeFilename(value) {
  return String(value || 'avatar')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'avatar';
}

async function ensureBucket(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  if (!buckets?.some((bucket) => bucket.name === BUCKET)) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ALLOWED_TYPES,
    });
    if (createError && !/already exists/i.test(createError.message || '')) {
      throw createError;
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
  }

  const { user } = await verifyUser(req);
  if (!user) {
    return json(res, 401, { error: 'unauthorized', message: 'Token invalido ou ausente.' });
  }

  const { file, filename, oldPath } = req.body || {};
  if (!file || typeof file !== 'string') {
    return json(res, 400, { error: 'bad_request', message: 'Imagem ausente.' });
  }

  const match = file.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) {
    return json(res, 400, { error: 'invalid_file', message: 'Formato de imagem invalido.' });
  }

  const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  if (!ALLOWED_TYPES.includes(contentType)) {
    return json(res, 400, { error: 'invalid_type', message: 'Use JPG, PNG ou WEBP.' });
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_BYTES) {
    return json(res, 400, { error: 'file_too_large', message: 'A imagem excede 2MB.' });
  }

  try {
    const supabase = getSupabase();
    await ensureBucket(supabase);

    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/${Date.now()}-${sanitizeFilename(filename)}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });

    if (uploadError) {
      console.error('[profile-avatar] upload error:', uploadError);
      return json(res, 500, { error: 'upload_failed', message: 'Falha ao enviar a imagem.' });
    }

    if (oldPath && typeof oldPath === 'string' && oldPath.startsWith(`${user.id}/`)) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return json(res, 200, {
      url: data?.publicUrl || '',
      path,
      bucket: BUCKET,
    });
  } catch (error) {
    console.error('[profile-avatar] unhandled error:', error);
    return json(res, 500, {
      error: 'internal_error',
      message: 'Nao foi possivel atualizar a foto de perfil.',
    });
  }
}
