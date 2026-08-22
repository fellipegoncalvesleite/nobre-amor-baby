-- ============================================================
-- Nobre Amor Baby — admin authority + profile role hardening
-- ============================================================
-- Existing manager/debug profile rows are intentionally preserved.
-- Future auth.users inserts always receive the customer role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (
    id,
    email,
    role
  )
  values (
    new.id,
    new.email,
    'customer'
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

-- Browser sessions may read profiles through the existing RLS policy, but role
-- authority is backend/operator managed and is never writable by browser roles.
alter table public.profiles enable row level security;
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

-- The backend service-role client remains the trusted profile-management path.
grant select, insert, update, delete on public.profiles to service_role;

-- Trigger execution is internal to auth.users; browser roles do not need direct
-- EXECUTE privileges on the SECURITY DEFINER function.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
