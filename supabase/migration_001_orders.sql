-- ============================================================
-- Nobre Amor Baby — Orders schema  (Supabase / Postgres)
-- Run this in the Supabase SQL Editor or via CLI migration.
-- ============================================================

-- 1) orders
CREATE TABLE IF NOT EXISTS orders (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code            text        UNIQUE NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  status                text        NOT NULL DEFAULT 'new',
  customer_name         text,
  customer_phone        text,
  customer_email        text,
  customer_message      text,
  address_cep           text,
  address_street        text,
  address_number        text,
  address_complement    text,
  address_neighborhood  text,
  address_city          text,
  address_uf            text,
  shipping_fee_cents    int,
  shipping_eta_text     text,
  shipping_provider     text,
  subtotal_cents        int         NOT NULL DEFAULT 0,
  total_cents           int         NOT NULL DEFAULT 0,
  paid_total_cents      int,
  payment_method        text,
  payment_ref           text,
  manager_notes         text
);

-- 2) order_items
CREATE TABLE IF NOT EXISTS order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       text,
  product_name     text,
  size             text,
  qty              int  NOT NULL,
  unit_price_cents int  NOT NULL,
  line_total_cents int  NOT NULL
);

-- 3) indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_code   ON orders (order_code);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items (order_id);

-- 4) RLS — disabled for MVP (service-role key only, never exposed to client)
ALTER TABLE orders       DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items  DISABLE ROW LEVEL SECURITY;
