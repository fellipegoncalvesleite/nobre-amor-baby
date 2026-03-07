/**
 * Admin API service — centralized fetch calls for admin CRUD.
 *
 * All admin calls go through /api/admin?resource=xxx&id=yyy
 *
 * TODO: replace VITE_ADMIN_API_KEY with real session-based auth.
 */

const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY || '';

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  'x-admin-key': ADMIN_KEY,
  ...extra,
});

async function request(url, options = {}) {
  const res = await fetch(url, { headers: headers(), ...options });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || 'Erro na requisição');
    err.code = data.error;
    throw err;
  }
  return data;
}

/* ── Products ─────────────────────────────────────── */

export async function listProducts(params = {}) {
  const qs = new URLSearchParams({ resource: 'products' });
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.collection_id) qs.set('collection_id', params.collection_id);
  if (params.limit) qs.set('limit', String(params.limit));
  const data = await request(`/api/admin?${qs}`);
  return data.products;
}

export async function createProduct(product) {
  const data = await request('/api/admin?resource=products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
  return data.product;
}

export async function updateProduct(id, updates) {
  const data = await request(`/api/admin?resource=products&id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.product;
}

export async function deleteProduct(id) {
  await request(`/api/admin?resource=products&id=${id}`, { method: 'DELETE' });
}

/* ── Collections ──────────────────────────────────── */

export async function listCollections() {
  const data = await request('/api/admin?resource=collections');
  return data.collections;
}

export async function createCollection(collection) {
  const data = await request('/api/admin?resource=collections', {
    method: 'POST',
    body: JSON.stringify(collection),
  });
  return data.collection;
}

export async function updateCollection(id, updates) {
  const data = await request(`/api/admin?resource=collections&id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.collection;
}

export async function deleteCollection(id) {
  await request(`/api/admin?resource=collections&id=${id}`, { method: 'DELETE' });
}

/* ── Upload ───────────────────────────────────────── */

/**
 * Upload an image file to Supabase Storage via serverless proxy.
 * @param {File} file — image file
 * @param {"product"|"collection"} kind
 * @returns {Promise<string>} — public URL
 */
export async function uploadImage(file, kind = 'product') {
  // Read file as data URL (base64)
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });

  const data = await request('/api/admin?resource=upload', {
    method: 'POST',
    body: JSON.stringify({
      file: dataUrl,
      kind,
      filename: file.name,
    }),
  });
  return data.url;
}

/* ── Homepage Settings ────────────────────────────── */

export async function getHomeSettings() {
  const data = await request('/api/admin?resource=home');
  return data.settings;
}

export async function updateHomeSettings(updates) {
  const data = await request('/api/admin?resource=home', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.settings;
}
