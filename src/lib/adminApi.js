/**
 * Admin API service — centralized fetch calls for admin CRUD.
 *
 * All admin calls go through /api/admin?resource=xxx&id=yyy
 *
 * Auth: uses JWT accessToken from AuthContext (Authorization: Bearer <token>).
 */

let _accessToken = '';

/** Called from admin pages to set the current access token. */
export function setAdminAccessToken(token) {
  _accessToken = token || '';
}

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  ..._accessToken ? { 'Authorization': `Bearer ${_accessToken}` } : {},
  ...extra,
});

async function request(url, options = {}) {
  const res = await fetch(url, { headers: headers(), ...options });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response (e.g. Vercel 413 "Request entity too large" HTML page).
    if (!res.ok) {
      const friendly =
        res.status === 413
          ? 'Imagem muito grande. Tente uma foto menor.'
          : `Erro ${res.status} no servidor.`;
      const err = new Error(friendly);
      err.code = `http_${res.status}`;
      throw err;
    }
    return null;
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Erro ${res.status} na requisição`);
    err.code = data?.error;
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
 * Upload an image to Supabase Storage via serverless proxy.
 *
 * Accepts either a File (reads as data URL) or an already-built data URL string.
 * Prefer passing the already resized + cropped data URL from ImageUploader —
 * raw files can easily blow past Vercel's 4.5MB request limit.
 *
 * @param {File|string} input — File or data URL
 * @param {"product"|"collection"} kind
 * @param {string} [filename]
 * @returns {Promise<string>} — public URL
 */
export async function uploadImage(input, kind = 'product', filename) {
  let dataUrl;
  let name = filename;
  if (typeof input === 'string') {
    dataUrl = input;
    if (!name) name = `upload-${Date.now()}.jpg`;
  } else {
    if (!name) name = input.name;
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(input);
    });
  }

  const data = await request('/api/admin?resource=upload', {
    method: 'POST',
    body: JSON.stringify({ file: dataUrl, kind, filename: name }),
  });
  return data.url;
}

/* ── Newsletter ───────────────────────────────────── */

export async function listNewsletterSubscribers(params = {}) {
  const qs = new URLSearchParams({ resource: 'newsletter' });
  if (params.q) qs.set('q', params.q);
  if (params.source) qs.set('source', params.source);
  if (params.limit) qs.set('limit', String(params.limit));
  const data = await request(`/api/admin?${qs}`);
  return { subscribers: data.subscribers || [], total: data.total ?? 0 };
}

export async function deleteNewsletterSubscriber(id) {
  await request(`/api/admin?resource=newsletter&id=${id}`, { method: 'DELETE' });
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

/* ── Drafts / Launches / Unread ───────────────────── */

export async function listDrafts() {
  const data = await request('/api/admin?resource=drafts');
  return { products: data.products || [], collections: data.collections || [] };
}

export async function launchDrafts({ productIds, collectionIds } = {}) {
  const body = {};
  if (productIds) body.product_ids = productIds;
  if (collectionIds) body.collection_ids = collectionIds;
  const data = await request('/api/admin?resource=launch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.launch;
}

export async function getOrdersUnread() {
  const data = await request('/api/admin?resource=orders-unread');
  return { unread: data.unread || 0, lastSeenAt: data.last_seen_orders_at || null };
}

export async function markOrdersRead() {
  const data = await request('/api/admin?resource=orders-unread', { method: 'POST' });
  return { unread: data.unread || 0, lastSeenAt: data.last_seen_orders_at || null };
}

/* ── Catalog settings (size groups / presets) ─────── */

export async function getCatalogSettings() {
  const data = await request('/api/admin?resource=catalog-settings');
  return data.settings || null;
}

export async function updateCatalogSettings({ sizeGroups, sizePresets } = {}) {
  const body = {};
  if (sizeGroups) body.size_groups = sizeGroups;
  if (sizePresets) body.size_presets = sizePresets;
  const data = await request('/api/admin?resource=catalog-settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return data.settings || null;
}
