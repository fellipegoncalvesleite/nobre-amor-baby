/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/public/products — public product list
 * Query params: collection, featured, slug, search, limit
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { collection, featured, slug, search, limit } = req.query;

    // Single product by slug
    if (slug) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('slug', slug)
        .eq('is_public', true)
        .single();

      if (error || !data) return res.status(404).json({ error: 'Product not found' });
      return res.json({ product: data });
    }

    let query = supabase
      .from('products')
      .select('*')
      .eq('is_public', true);

    if (collection) {
      query = query.eq('collection_id', collection);
    }

    if (featured === 'true') {
      query = query.eq('featured', true);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const max = Math.min(parseInt(limit) || 50, 200);
    query = query.order('created_at', { ascending: false }).limit(max);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.json({ products: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
