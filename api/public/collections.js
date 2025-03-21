/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/public/collections — public list of active collections
 * Optional: ?slug=xxx — get single by slug
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug } = req.query;

    if (slug) {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error || !data) return res.status(404).json({ error: 'Collection not found' });

      // Also get products for this collection
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('collection_id', data.id)
        .eq('is_public', true)
        .eq('in_stock', true)
        .order('created_at', { ascending: false });

      return res.json({ collection: data, products: products || [] });
    }

    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) return res.status(500).json({ error: error.message });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.json({ collections: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
