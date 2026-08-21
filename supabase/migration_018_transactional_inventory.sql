-- ============================================================
-- Nobre Amor Baby — transactional inventory + fulfillment authority
-- Run after migration_017_atomic_payment_webhooks.sql.
-- ============================================================

-- Historical stock ownership cannot be reconstructed from the old
-- confirmed-only, per-item mutation flow. Backfill it explicitly without
-- changing any product quantity, then default only future orders to unreserved.
alter table public.orders
  add column if not exists inventory_state text,
  add column if not exists inventory_reserved_at timestamptz,
  add column if not exists inventory_released_at timestamptz,
  add column if not exists inventory_consumed_at timestamptz,
  add column if not exists packing_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists done_at timestamptz;

update public.orders
set inventory_state = 'legacy_untracked'
where inventory_state is null;

alter table public.orders
  alter column inventory_state set default 'unreserved',
  alter column inventory_state set not null;

alter table public.orders
  drop constraint if exists orders_inventory_state_check;

alter table public.orders
  add constraint orders_inventory_state_check
  check (inventory_state in ('unreserved', 'reserved', 'released', 'consumed', 'legacy_untracked'));

-- Normalize only invalid historical quantities downward to zero. Never invent
-- positive stock. Product availability is derived exclusively from stock_count.
update public.products
set stock_count = 0
where stock_count is null or stock_count < 0;

update public.products
set size_options = '{}'
where size_options is null;

update public.products
set in_stock = (stock_count > 0)
where in_stock is distinct from (stock_count > 0) or in_stock is null;

alter table public.products
  alter column stock_count set default 0,
  alter column stock_count set not null,
  alter column in_stock set default false,
  alter column in_stock set not null,
  alter column size_options set default '{}',
  alter column size_options set not null;

alter table public.products
  drop constraint if exists products_stock_count_nonnegative;

alter table public.products
  add constraint products_stock_count_nonnegative
  check (stock_count >= 0);

alter table public.products
  drop constraint if exists products_in_stock_matches_count;

alter table public.products
  add constraint products_in_stock_matches_count
  check (in_stock = (stock_count > 0));

create or replace function public.enforce_product_stock_invariant()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.stock_count is null or new.stock_count < 0 then
    raise exception using errcode = '23514', message = 'invalid_stock_count';
  end if;
  new.in_stock := (new.stock_count > 0);
  return new;
end;
$$;

drop trigger if exists trg_products_stock_invariant on public.products;
create trigger trg_products_stock_invariant
  before insert or update of stock_count, in_stock on public.products
  for each row execute function public.enforce_product_stock_invariant();

create or replace function public.reserve_order_inventory(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_request record;
  v_product public.products%rowtype;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  if v_order.inventory_state = 'reserved' then
    return v_order;
  end if;

  if v_order.inventory_state <> 'unreserved' then
    raise exception using errcode = 'P0001', message = 'inventory_reservation_conflict';
  end if;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception using errcode = '22023', message = 'order_items_required';
  end if;

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
    order by product_id, id
  loop
    if v_item.qty is null or v_item.qty <= 0 then
      raise exception using errcode = '22023', message = 'invalid_inventory_quantity';
    end if;
    if v_item.product_id is null or pg_catalog.btrim(v_item.product_id) = '' then
      raise exception using errcode = '22023', message = 'invalid_inventory_product';
    end if;
  end loop;

  -- Lock every involved product in deterministic ID order and validate all
  -- lines before any quantity is changed.
  for v_request in
    select oi.product_id, pg_catalog.sum(oi.qty::bigint) as requested_qty
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
    order by oi.product_id
  loop
    select *
    into v_product
    from public.products
    where id::text = v_request.product_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'inventory_product_not_found';
    end if;

    if v_product.is_public is distinct from true then
      raise exception using errcode = 'P0001', message = 'product_not_public';
    end if;

    if v_request.requested_qty > v_product.stock_count then
      raise exception using errcode = 'P0001', message = 'insufficient_inventory';
    end if;

    if not v_product.in_stock or v_product.stock_count = 0 then
      raise exception using errcode = 'P0001', message = 'product_out_of_stock';
    end if;

    if coalesce(pg_catalog.cardinality(v_product.size_options), 0) > 0
      and exists (
        select 1
        from public.order_items oi
        where oi.order_id = p_order_id
          and oi.product_id = v_request.product_id
          and (
            oi.size is null
            or pg_catalog.btrim(oi.size) = ''
            or not (oi.size = any(v_product.size_options))
          )
      )
    then
      raise exception using errcode = '22023', message = 'invalid_product_size';
    end if;
  end loop;

  update public.products p
  set stock_count = p.stock_count - requested.requested_qty::int
  from (
    select oi.product_id, pg_catalog.sum(oi.qty::bigint) as requested_qty
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  ) requested
  where p.id::text = requested.product_id;

  update public.orders
  set
    inventory_state = 'reserved',
    inventory_reserved_at = pg_catalog.now(),
    inventory_released_at = null,
    inventory_consumed_at = null
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.transition_order_fulfillment(
  p_order_id uuid,
  p_new_status text,
  p_rejected_reason text default null,
  p_cancel_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
  v_request record;
  v_product public.products%rowtype;
  v_is_tracked boolean;
  v_release_safe boolean := false;
begin
  if p_new_status is null or p_new_status not in (
    'new', 'confirmed', 'rejected', 'cancelled', 'packing', 'shipped', 'done'
  ) then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  -- An identical retry is a harmless no-op and, critically, can never release
  -- or consume inventory twice.
  if v_order.status = p_new_status then
    return v_order;
  end if;

  if not (
    (v_order.status = 'new' and p_new_status in ('confirmed', 'rejected', 'cancelled'))
    or (v_order.status = 'confirmed' and p_new_status in ('packing', 'cancelled'))
    or (v_order.status = 'packing' and p_new_status in ('shipped', 'cancelled'))
    or (v_order.status = 'shipped' and p_new_status = 'done')
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_fulfillment_transition';
  end if;

  if p_new_status = 'rejected'
    and (p_rejected_reason is null or pg_catalog.btrim(p_rejected_reason) = '')
  then
    raise exception using errcode = '22023', message = 'rejected_reason_required';
  end if;

  if p_new_status = 'cancelled'
    and (p_cancel_reason is null or pg_catalog.btrim(p_cancel_reason) = '')
  then
    raise exception using errcode = '22023', message = 'cancel_reason_required';
  end if;

  v_is_tracked := v_order.inventory_state <> 'legacy_untracked';

  if p_new_status = 'confirmed' then
    if v_is_tracked then
      if v_order.inventory_state <> 'reserved' then
        raise exception using errcode = 'P0001', message = 'inventory_not_reserved';
      end if;
      if v_order.payment_state <> 'paid'
        or v_order.active_payment_attempt_id is null
        or not exists (
          select 1
          from public.payment_attempts pa
          where pa.id = v_order.active_payment_attempt_id
            and pa.order_id = v_order.id
            and pa.state = 'paid'
            and pa.amount_verification_state = 'verified'
            and pa.provider = 'asaas'
            and pa.provider_payment_id is not null
            and pa.provider_reported_state = 'paid'
            and pa.provider_amount_cents = v_order.total_cents
        )
      then
        raise exception using errcode = 'P0001', message = 'verified_payment_required';
      end if;
    elsif v_order.payment_state <> 'paid' then
      raise exception using errcode = 'P0001', message = 'payment_required';
    end if;
  end if;

  if v_is_tracked and p_new_status in ('packing', 'shipped', 'done')
    and v_order.inventory_state <> 'reserved'
  then
    raise exception using errcode = 'P0001', message = 'inventory_state_conflict';
  end if;

  if v_is_tracked and p_new_status in ('rejected', 'cancelled') then
    if v_order.inventory_state = 'reserved' then
      if v_order.checkout_finalization_state = 'finalized' then
        if not exists (select 1 from public.payment_attempts where order_id = v_order.id) then
          v_release_safe := (
            v_order.payment_state = 'failed'
            and v_order.payment_external_id is null
            and v_order.payment_ref is null
          );
        else
          v_release_safe := v_order.payment_state in ('failed', 'cancelled', 'refunded') and not exists (
            select 1
            from public.payment_attempts pa
            where pa.order_id = v_order.id
              and not (
                pa.state in ('cancelled', 'refunded')
                or (
                  pa.state = 'failed'
                  and pa.provider_payment_id is null
                  and v_order.payment_external_id is null
                  and v_order.payment_ref is null
                )
              )
          );
        end if;
      end if;

      if not v_release_safe then
        raise exception using errcode = 'P0001', message = 'inventory_release_requires_payment_resolution';
      end if;

      for v_request in
        select oi.product_id, pg_catalog.sum(oi.qty::bigint) as requested_qty
        from public.order_items oi
        where oi.order_id = v_order.id
        group by oi.product_id
        order by oi.product_id
      loop
        if v_request.product_id is null or pg_catalog.btrim(v_request.product_id) = ''
          or v_request.requested_qty is null or v_request.requested_qty <= 0
        then
          raise exception using errcode = '22023', message = 'invalid_inventory_item';
        end if;

        select *
        into v_product
        from public.products
        where id::text = v_request.product_id
        for update;

        if not found then
          raise exception using errcode = 'P0002', message = 'inventory_product_not_found';
        end if;

        if v_product.stock_count::bigint + v_request.requested_qty > 2147483647 then
          raise exception using errcode = '22003', message = 'inventory_count_overflow';
        end if;
      end loop;

      update public.products p
      set stock_count = p.stock_count + requested.requested_qty::int
      from (
        select oi.product_id, pg_catalog.sum(oi.qty::bigint) as requested_qty
        from public.order_items oi
        where oi.order_id = v_order.id
        group by oi.product_id
      ) requested
      where p.id::text = requested.product_id;

      v_order.inventory_state := 'released';
      v_order.inventory_released_at := pg_catalog.now();
    elsif v_order.inventory_state <> 'unreserved' then
      raise exception using errcode = 'P0001', message = 'inventory_state_conflict';
    end if;
  end if;

  if v_is_tracked and p_new_status = 'done' then
    v_order.inventory_state := 'consumed';
    v_order.inventory_consumed_at := pg_catalog.now();
  end if;

  update public.orders
  set
    status = p_new_status,
    inventory_state = v_order.inventory_state,
    inventory_released_at = v_order.inventory_released_at,
    inventory_consumed_at = v_order.inventory_consumed_at,
    confirmed_at = case when p_new_status = 'confirmed' then pg_catalog.now() else confirmed_at end,
    rejected_reason = case when p_new_status = 'rejected' then pg_catalog.btrim(p_rejected_reason) else rejected_reason end,
    rejected_at = case when p_new_status = 'rejected' then pg_catalog.now() else rejected_at end,
    cancel_reason = case when p_new_status = 'cancelled' then pg_catalog.btrim(p_cancel_reason) else cancel_reason end,
    cancelled_at = case when p_new_status = 'cancelled' then pg_catalog.now() else cancelled_at end,
    packing_at = case when p_new_status = 'packing' then pg_catalog.now() else packing_at end,
    shipped_at = case when p_new_status = 'shipped' then pg_catalog.now() else shipped_at end,
    done_at = case when p_new_status = 'done' then pg_catalog.now() else done_at end
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

drop function if exists public.decrement_stock(uuid, int);
drop function if exists public.increment_stock(uuid, int);

revoke execute on function public.reserve_order_inventory(uuid) from public;
revoke execute on function public.reserve_order_inventory(uuid) from anon, authenticated;
grant execute on function public.reserve_order_inventory(uuid) to service_role;

revoke execute on function public.transition_order_fulfillment(uuid, text, text, text) from public;
revoke execute on function public.transition_order_fulfillment(uuid, text, text, text) from anon, authenticated;
grant execute on function public.transition_order_fulfillment(uuid, text, text, text) to service_role;
