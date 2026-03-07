-- ============================================================
-- Nobre Amor Baby — profiles table + roles
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- Profiles table (linked to auth.users)
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'customer'
             check (role in ('customer', 'manager', 'debug')),
  created_at timestamptz default now()
);

-- Index for role lookups
create index if not exists profiles_role_idx on profiles(role);

-- Add user_id to orders for cross-device order tracking
alter table orders add column if not exists user_id uuid references auth.users(id);
create index if not exists orders_user_id_idx on orders(user_id);

-- ============================================================
-- Auto-create profile on first sign-up via trigger
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when lower(new.email) = 'nobreamorbaby@gmail.com' then 'manager'
      when lower(new.email) = 'felipezzlx@icloud.com'  then 'debug'
      else 'customer'
    end
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer;

-- Drop old trigger if exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Seed/fix roles for privileged accounts (idempotent)
-- ============================================================
-- Upsert profiles for existing users
insert into profiles (id, email, role)
select u.id, u.email, 'manager'
from auth.users u
where lower(u.email) = 'nobreamorbaby@gmail.com'
on conflict (id) do update set role = 'manager', email = excluded.email;

insert into profiles (id, email, role)
select u.id, u.email, 'debug'
from auth.users u
where lower(u.email) = 'felipezzlx@icloud.com'
on conflict (id) do update set role = 'debug', email = excluded.email;

-- Enable RLS on profiles (but allow service_role full access)
alter table profiles enable row level security;

-- Users can read their own profile
create policy if not exists "Users read own profile"
  on profiles for select
  using (auth.uid() = id);

-- Service role can do anything (used by backend)
-- (service_role bypasses RLS by default, so no specific policy needed)
