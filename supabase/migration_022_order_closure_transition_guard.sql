-- ============================================================
-- Nobre Amor Baby — atomic order-closure transition eligibility
-- Run after migration_021_api_rate_limits.sql.
-- ============================================================

create or replace function public.request_order_closure(
  p_order_id uuid,
  p_target_status text,
  p_reason text
)
returns public.order_closure_requests
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_closure_requests%rowtype;
  v_request public.order_closure_requests%rowtype;
begin
  if p_target_status is null or p_target_status not in ('cancelled', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_closure_target';
  end if;
  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception using errcode = '22023', message = 'closure_reason_required';
  end if;

  -- Preserve the global lock hierarchy. The authoritative order row remains
  -- locked through closure eligibility validation and insertion.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  select * into v_existing
  from public.order_closure_requests
  where order_id = p_order_id
    and state <> 'completed'
  order by created_at asc, id asc
  limit 1
  for update;

  -- An accepted open closure is already the coordination authority. Reuse or
  -- conflict must be resolved before considering new-closure eligibility.
  if found then
    if v_existing.target_status <> p_target_status then
      raise exception using errcode = 'P0001', message = 'order_closure_conflict';
    end if;
    return v_existing;
  end if;

  if not (
    (p_target_status = 'rejected' and v_order.status = 'new')
    or (
      p_target_status = 'cancelled'
      and v_order.status in ('new', 'confirmed', 'packing')
    )
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_closure_transition';
  end if;

  insert into public.order_closure_requests (
    order_id,
    target_status,
    reason,
    state
  ) values (
    p_order_id,
    p_target_status,
    pg_catalog.btrim(p_reason),
    'pending'
  )
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.request_order_closure(uuid, text, text) from public;
revoke execute on function public.request_order_closure(uuid, text, text) from anon, authenticated;
grant execute on function public.request_order_closure(uuid, text, text) to service_role;
