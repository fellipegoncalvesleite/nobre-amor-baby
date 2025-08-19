-- Launches: batches of products/collections released at once.
-- Drives the client "novidades" notification and the /novidades page filter.

create table if not exists public.launches (
  id              uuid primary key default gen_random_uuid(),
  launched_at     timestamptz not null default now(),
  launched_by     uuid references auth.users(id) on delete set null,
  product_ids     uuid[] not null default '{}'::uuid[],
  collection_ids  uuid[] not null default '{}'::uuid[],
  expires_at      timestamptz not null default (now() + interval '30 days')
);

create index if not exists launches_launched_at_idx on public.launches (launched_at desc);

-- Track when each manager last cleared their order inbox.
alter table public.profiles add column if not exists last_seen_orders_at timestamptz default now();
