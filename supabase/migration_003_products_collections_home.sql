-- migration_003_products_collections_home.sql
-- Creates products, collections, and homepage_settings tables
-- Run in Supabase SQL Editor after migration_002

-- ═══════════════════════════════════════════════════
-- COLLECTIONS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  description text,
  is_active   boolean DEFAULT true,
  image_url   text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- PRODUCTS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  description     text,
  price_cents     int NOT NULL,
  old_price_cents int,
  tag             text,
  featured        boolean DEFAULT false,
  is_public       boolean DEFAULT false,
  in_stock        boolean DEFAULT true,
  stock_count     int DEFAULT 99,
  size_group      text NOT NULL,       -- "roupa"|"calçado"|"acessório"
  size_options    text[] DEFAULT '{}',  -- array of size labels
  age_min_months  int,
  age_max_months  int,
  category_slug   text,
  collection_id   uuid REFERENCES collections(id) ON DELETE SET NULL,
  image_urls      text[] DEFAULT '{}',  -- gallery (first = cover)
  weight_grams    int DEFAULT 200,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_created_at   ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_featured     ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_collection   ON products(collection_id);
CREATE INDEX IF NOT EXISTS idx_products_in_stock     ON products(in_stock);
CREATE INDEX IF NOT EXISTS idx_products_is_public    ON products(is_public);

-- ═══════════════════════════════════════════════════
-- HOMEPAGE SETTINGS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS homepage_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 text UNIQUE NOT NULL,
  collections_enabled boolean DEFAULT true,
  featured_enabled    boolean DEFAULT true,
  collections_title   text DEFAULT 'Coleções',
  featured_title      text DEFAULT 'Destaques',
  collections_order   uuid[] DEFAULT '{}',
  featured_order      uuid[] DEFAULT '{}',
  updated_at          timestamptz DEFAULT now()
);

-- Seed the default homepage row
INSERT INTO homepage_settings (key)
VALUES ('home')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- updated_at triggers (reuse function from migration_002)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_homepage_settings_updated_at
  BEFORE UPDATE ON homepage_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════
-- Stock helper RPCs (used by order confirm/reset)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_qty int)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET stock_count = GREATEST(0, stock_count - p_qty),
      in_stock = (GREATEST(0, stock_count - p_qty) > 0)
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_stock(p_product_id uuid, p_qty int)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET stock_count = stock_count + p_qty,
      in_stock = true
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;
