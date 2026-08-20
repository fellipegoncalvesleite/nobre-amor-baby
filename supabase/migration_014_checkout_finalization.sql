-- ============================================================
-- Nobre Amor Baby — persisted checkout finalization lifecycle
-- Run after migration_013_order_idempotency.sql.
-- ============================================================

alter table public.orders
  add column if not exists checkout_finalization_state text;

-- Orders created before this lifecycle existed were already exposed as
-- completed checkout rows, so preserve that historical behavior.
update public.orders
set checkout_finalization_state = 'finalized'
where checkout_finalization_state is null;

alter table public.orders
  alter column checkout_finalization_state set default 'in_progress';

alter table public.orders
  alter column checkout_finalization_state set not null;

alter table public.orders
  drop constraint if exists orders_checkout_finalization_state_check;

alter table public.orders
  add constraint orders_checkout_finalization_state_check
  check (
    checkout_finalization_state in (
      'in_progress',
      'finalized',
      'reconciliation_required'
    )
  );
