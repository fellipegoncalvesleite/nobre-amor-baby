-- ============================================================
-- Nobre Amor Baby — recoverable provider identity for payment retries
-- Run after migration_014_checkout_finalization.sql.
-- ============================================================

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  attempt_key text not null,
  external_reference text not null,
  payment_method text not null,
  state text not null default 'claimed',
  provider text not null default 'asaas',
  provider_payment_id text,
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_attempts_order_key_unique unique (order_id, attempt_key),
  constraint payment_attempts_external_reference_unique unique (external_reference),
  constraint payment_attempts_provider_payment_unique unique (provider, provider_payment_id),
  constraint payment_attempts_method_check check (payment_method in ('pix', 'cartao')),
  constraint payment_attempts_state_check check (
    state in (
      'claimed',
      'provider_uncertain',
      'pending',
      'paid',
      'failed',
      'expired',
      'cancelled',
      'refunded'
    )
  )
);

create index if not exists idx_payment_attempts_order
  on public.payment_attempts(order_id, created_at desc);

alter table public.orders
  add column if not exists active_payment_attempt_id uuid;

alter table public.orders
  drop constraint if exists orders_active_payment_attempt_id_fkey;

alter table public.orders
  add constraint orders_active_payment_attempt_id_fkey
  foreign key (active_payment_attempt_id)
  references public.payment_attempts(id)
  on delete set null;

-- Browser roles must never access payment-attempt identity directly. The
-- backend service-role client bypasses RLS, matching the rest of the API.
alter table public.payment_attempts enable row level security;
