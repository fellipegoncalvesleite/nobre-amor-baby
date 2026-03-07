-- ============================================================
-- Nobre Amor Baby — Migration 002: Order status actions
-- Adds rejected_reason, confirmed_at, rejected_at, updated_at
-- + auto-update trigger for updated_at
-- ============================================================

-- 1) new columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_reason  text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at     timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_at      timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- 2) trigger: auto-set updated_at on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
