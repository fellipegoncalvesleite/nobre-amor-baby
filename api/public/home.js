/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/public/home — public homepage configuration
 *
 * Returns homepage settings with resolved collections and featured products.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Homepage settings
    const { data: settings, error: sErr } = await supabase
      .from('homepage_settings')
      .select('*')
      .eq('key', 'home')
      .single();

    if (sErr) return res.status(500).json({ error: sErr.message });

    const result = {
      collections_enabled: settings.collections_enabled,
      featured_enabled: settings.featured_enabled,
      collections_title: settings.collections_title,
      featured_title: settings.featured_title,
      collections: [],
      featured: [],
    };

    // 2. Resolve collections
    if (settings.collections_enabled) {
      let query = supabase.from('collections').select('*').eq('is_active', true);

      if (settings.collections_order?.length) {
        // Fetch in specified order
        const { data: colls } = await query.in('id', settings.collections_order);
        // Re-order by settings order
        const orderMap = {};
        settings.collections_order.forEach((id, i) => { orderMap[id] = i; });
        result.collections = (colls || []).sort(
          (a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)
        );
      } else {
        const { data: colls } = await query.order('name');
        result.collections = colls || [];
      }
    }

    // 3. Resolve featured products
    if (settings.featured_enabled) {
      let query = supabase.from('products').select('*')
        .eq('is_public', true)
        .eq('in_stock', true);

      if (settings.featured_order?.length) {
        const { data: prods } = await query.in('id', settings.featured_order);
        const orderMap = {};
        settings.featured_order.forEach((id, i) => { orderMap[id] = i; });
        result.featured = (prods || []).sort(
          (a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)
        );
      } else {
        const { data: prods } = await query.eq('featured', true).order('created_at', { ascending: false }).limit(12);
        result.featured = prods || [];
      }
    }

    // Cache 60s
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
