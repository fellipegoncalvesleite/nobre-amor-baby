-- ============================================================
-- Nobre Amor Baby — authenticated checkout idempotency
-- Run after migration_012_catalog_settings.sql.
-- ============================================================

alter table public.orders
  add column if not exists idempotency_key text;

alter table public.orders
  drop constraint if exists orders_idempotency_key_format_check;

alter table public.orders
  add constraint orders_idempotency_key_format_check
  check (
    idempotency_key is null
    or (
      char_length(idempotency_key) between 16 and 128
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_user_id_idempotency_key_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_user_id_idempotency_key_key
      unique (user_id, idempotency_key);
  end if;
end $$;
