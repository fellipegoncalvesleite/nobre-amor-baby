-- ============================================================
-- Nobre Amor Baby — serialize retry claims and persist all Asaas payments
-- Run after migration_015_payment_retry_safety.sql.
-- ============================================================

alter table public.payment_attempts
  add column if not exists attempt_kind text;

update public.payment_attempts
set attempt_kind = 'retry'
where attempt_kind is null;

alter table public.payment_attempts
  alter column attempt_kind set default 'retry';

alter table public.payment_attempts
  alter column attempt_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_attempts_kind_check'
      and conrelid = 'public.payment_attempts'::regclass
  ) then
    alter table public.payment_attempts
      add constraint payment_attempts_kind_check
      check (attempt_kind in ('original', 'retry'));
  end if;
end
$$;

-- Do not invent a winner if historical data already violates the new financial
-- invariant. Abort explicitly so the existing provider payments can be reconciled
-- before this migration is retried.
do $$
begin
  if exists (
    select 1
    from public.payment_attempts
    where attempt_kind = 'retry'
      and state in ('claimed', 'provider_uncertain', 'pending')
    group by order_id
    having count(*) > 1
  ) then
    raise exception 'migration_016: multiple open retry payment attempts exist for one order; reconcile them before migration';
  end if;
end
$$;

-- One retry slot per order. Existing same-key uniqueness remains in place;
-- this second invariant closes the different-attempt-key race.
create unique index if not exists payment_attempts_one_open_retry_per_order
  on public.payment_attempts(order_id)
  where attempt_kind = 'retry'
    and state in ('claimed', 'provider_uncertain', 'pending');

-- Historical original payments already known by orders become first-class
-- ledger rows. Only rows with sufficient authoritative identity are backfilled.
insert into public.payment_attempts (
  order_id,
  attempt_key,
  attempt_kind,
  external_reference,
  payment_method,
  state,
  provider,
  provider_payment_id,
  last_event_id,
  created_at,
  updated_at
)
select
  o.id,
  'original',
  'original',
  o.order_code,
  o.payment_method,
  case
    when o.payment_state in (
      'claimed',
      'provider_uncertain',
      'pending',
      'paid',
      'failed',
      'expired',
      'cancelled',
      'refunded'
    ) then o.payment_state
    else 'pending'
  end,
  'asaas',
  o.payment_external_id,
  o.payment_last_event,
  coalesce(o.created_at, now()),
  now()
from public.orders o
where o.payment_external_id is not null
  and o.order_code is not null
  and o.payment_method in ('pix', 'cartao')
  and not exists (
    select 1
    from public.payment_attempts pa
    where pa.order_id = o.id
      and (
        pa.attempt_key = 'original'
        or pa.external_reference = o.order_code
        or pa.provider_payment_id = o.payment_external_id
      )
  )
on conflict do nothing;

-- Establish explicit ownership for historical originals only when there is no
-- existing active retry/payment owner to preserve.
update public.orders o
set active_payment_attempt_id = pa.id
from public.payment_attempts pa
where o.active_payment_attempt_id is null
  and pa.order_id = o.id
  and pa.attempt_kind = 'original'
  and o.payment_external_id is not null
  and pa.provider_payment_id = o.payment_external_id;

-- Keep backend-only access semantics unchanged.
alter table public.payment_attempts enable row level security;
