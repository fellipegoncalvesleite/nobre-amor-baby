/* eslint-disable no-undef */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET  /api/admin/home  — read homepage settings
 * PATCH /api/admin/home — update homepage settings
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('homepage_settings')
      .select('*')
      .eq('key', 'home')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: data });
  }

  if (req.method === 'PATCH') {
    const allowed = [
      'collections_enabled', 'featured_enabled',
      'collections_title', 'featured_title',
      'collections_order', 'featured_order',
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('homepage_settings')
      .update(updates)
      .eq('key', 'home')
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: data });
  }

  res.setHeader('Allow', 'GET,PATCH,OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}
