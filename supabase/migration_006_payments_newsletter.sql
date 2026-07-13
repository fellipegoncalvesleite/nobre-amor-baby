-- ============================================================
-- Pequeno Encanto — payments + newsletter subscribers
-- Run this in the Supabase SQL Editor after migrations 001-005.
-- ============================================================

alter table orders add column if not exists payment_state text not null default 'pending';
alter table orders add column if not exists payment_provider text;
alter table orders add column if not exists payment_external_id text;
alter table orders add column if not exists payment_link_url text;
alter table orders add column if not exists payment_pix_copy_paste text;
alter table orders add column if not exists payment_pix_qr_code text;
alter table orders add column if not exists payment_expires_at timestamptz;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists payment_last_event text;

create index if not exists idx_orders_payment_state on orders (payment_state);
create index if not exists idx_orders_payment_external_id on orders (payment_external_id);

update orders
set payment_state = case
  when coalesce(paid_total_cents, 0) > 0 then 'paid'
  when status = 'cancelled' then 'cancelled'
  else 'pending'
end
where payment_state is null
   or payment_state = '';

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'footer',
  created_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_email_ci_idx
  on newsletter_subscribers ((lower(email)));

alter table newsletter_subscribers disable row level security;
