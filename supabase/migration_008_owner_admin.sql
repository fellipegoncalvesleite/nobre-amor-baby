-- ============================================================
-- Pequeno Encanto — grant manager role to owner email
-- Run this after migration_007 on existing databases.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when lower(new.email) in ('admin@example.com') then 'manager'
      when lower(new.email) = 'debug@example.com' then 'debug'
      else 'customer'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role;
  return new;
end;
$$ language plpgsql security definer;

insert into profiles (id, email, role)
select u.id, u.email, 'manager'
from auth.users u
where lower(u.email) in ('admin@example.com')
on conflict (id) do update
  set role = 'manager',
      email = excluded.email;
