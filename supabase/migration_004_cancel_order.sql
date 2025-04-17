-- ============================================================
-- Nobre Amor Baby — Add cancel support to orders
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- Add cancel_reason column (used when customer cancels their order)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Add cancelled_at timestamp
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
