-- ============================================================
-- Pequeno Encanto — Add cancel + reject support to orders
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- Cancel fields (customer cancellation)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Reject fields (manager rejection)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- Confirmed timestamp
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
