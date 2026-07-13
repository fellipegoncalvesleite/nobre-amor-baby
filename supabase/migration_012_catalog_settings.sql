-- ============================================================
-- Pequeno Encanto — manager-editable catalog config (size groups + presets)
-- Run in the Supabase SQL Editor after migration_011.
--
-- Single row keyed 'catalog'. Lets the manager edit the size groups
-- (Roupa / Calçado / Acessório / …) and the preset size chips per group
-- from the admin panel instead of them being hard-coded in the frontend.
-- The frontend keeps the code values as a fallback if this table is absent.
-- ============================================================

create table if not exists public.catalog_settings (
  key          text primary key,
  size_groups  jsonb not null default '[]'::jsonb,
  size_presets jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Seed with the current code defaults.
insert into public.catalog_settings (key, size_groups, size_presets)
values (
  'catalog',
  '[{"value":"roupa","label":"Roupa"},{"value":"calçado","label":"Calçado"},{"value":"acessório","label":"Acessório"}]'::jsonb,
  '{"roupa":["RN","P","M","G","GG","0-1m","1-3m","3-6m","6-9m","9-12m","12-18m","18-24m","1 ano","2 anos","3 anos","4 anos"],"calçado":["13","14","15","16","17","18","19","20","21","22","23","24","25","26"],"acessório":["Único"]}'::jsonb
)
on conflict (key) do nothing;

-- Keep updated_at fresh (reuses set_updated_at() from migration_003).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_catalog_settings_updated_at'
  ) then
    create trigger trg_catalog_settings_updated_at
      before update on public.catalog_settings
      for each row execute function set_updated_at();
  end if;
end $$;

-- RLS: served through the API (service-role) like every other data table.
alter table public.catalog_settings enable row level security;
