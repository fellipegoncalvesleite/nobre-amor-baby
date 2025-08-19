-- ============================================================
-- Nobre Amor Baby — enable Row Level Security on all data tables
-- Run this in the Supabase SQL Editor after migration_010.
--
-- WHY: the browser ships the anon key (needed for Supabase Auth). If RLS is
-- left disabled on public tables, anyone with that key can read/write them
-- directly via the Supabase REST API — including every order's PII
-- (name, email, phone, CPF/CNPJ, address). All application data access goes
-- through the serverless API using the SERVICE_ROLE key, which BYPASSES RLS,
-- so enabling RLS with no anon/authenticated policies blocks direct browser
-- access while keeping the app fully working.
--
-- Idempotent and safe to run multiple times.
-- ============================================================

do $$
declare
  t text;
  data_tables text[] := array[
    'products',
    'collections',
    'orders',
    'order_items',
    'homepage_settings',
    'newsletter_subscribers',
    'launches'
  ];
begin
  foreach t in array data_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      -- No permissive policies are created on purpose: the anon and
      -- authenticated roles get zero direct access. The backend uses the
      -- service_role key, which bypasses RLS.
    end if;
  end loop;
end $$;
