-- ============================================================
-- Nobre Amor Baby — store payment failure diagnostics
-- Run this after migration_008 on existing databases.
-- ============================================================

alter table orders
  add column if not exists payment_error_message text;
