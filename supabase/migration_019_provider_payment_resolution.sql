-- ============================================================
-- Nobre Amor Baby — provider-side payment resolution authority
-- Run after migration_018_transactional_inventory.sql.
-- ============================================================

create table if not exists public.order_closure_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  target_status text not null,
  reason text not null,
  state text not null default 'pending',
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint order_closure_requests_target_status_check
    check (target_status in ('cancelled', 'rejected')),
  constraint order_closure_requests_state_check
    check (state in ('pending', 'waiting_provider', 'ready_to_finalize', 'completed', 'manual_review', 'failed')),
  constraint order_closure_requests_reason_check
    check (btrim(reason) <> '')
);

create unique index if not exists idx_order_closure_requests_one_open
  on public.order_closure_requests(order_id)
  where state <> 'completed';

create index if not exists idx_order_closure_requests_state
  on public.order_closure_requests(state, updated_at);

create table if not exists public.payment_resolution_actions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete cascade,
  closure_request_id uuid references public.order_closure_requests(id) on delete set null,
  kind text not null,
  provider_action text not null,
  state text not null default 'claimed',
  provider text not null default 'asaas',
  provider_payment_id text not null,
  provider_marker text not null,
  last_provider_status text,
  last_error_code text,
  provider_accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_resolution_actions_kind_check
    check (kind in ('order_close_delete', 'order_close_refund', 'duplicate_paid_refund', 'provider_refund_review')),
  constraint payment_resolution_actions_provider_action_check
    check (provider_action in ('delete', 'refund')),
  constraint payment_resolution_actions_state_check
    check (state in (
      'claimed',
      'provider_call_in_flight',
      'provider_pending',
      'provider_uncertain',
      'completed',
      'failed',
      'manual_review',
      'superseded'
    )),
  constraint payment_resolution_actions_provider_check
    check (provider = 'asaas'),
  constraint payment_resolution_actions_provider_id_check
    check (btrim(provider_payment_id) <> ''),
  constraint payment_resolution_actions_marker_check
    check (btrim(provider_marker) <> '')
);

-- A payment can only have one provider mutation of a given type. This is
-- intentionally stronger than action-kind uniqueness so a duplicate-paid refund
-- can be reused by a later order closure rather than creating a second refund.
create unique index if not exists idx_payment_resolution_actions_attempt_provider_action
  on public.payment_resolution_actions(payment_attempt_id, provider_action);

create index if not exists idx_payment_resolution_actions_order_state
  on public.payment_resolution_actions(order_id, state, updated_at);

create index if not exists idx_payment_resolution_actions_provider_payment
  on public.payment_resolution_actions(provider, provider_payment_id);

alter table public.order_closure_requests enable row level security;
alter table public.payment_resolution_actions enable row level security;

revoke all on table public.order_closure_requests from public, anon, authenticated;
revoke all on table public.payment_resolution_actions from public, anon, authenticated;
grant select, insert, update on table public.order_closure_requests to service_role;
grant select, insert, update on table public.payment_resolution_actions to service_role;

-- Completed closures are terminal even for stale service-role writers. Node also
-- uses compare-and-set updates, but the database invariant is the final guard.
create or replace function public.prevent_completed_order_closure_reopen()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.state = 'completed' and new.state <> 'completed' then
    raise exception using errcode = 'P0001', message = 'completed_order_closure_is_terminal';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_closure_completed_terminal on public.order_closure_requests;
create trigger trg_order_closure_completed_terminal
  before update on public.order_closure_requests
  for each row execute function public.prevent_completed_order_closure_reopen();

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

  -- Lock the order first so competing closure requests serialize even before a
  -- closure row exists.
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

  if found then
    if v_existing.target_status <> p_target_status then
      raise exception using errcode = 'P0001', message = 'order_closure_conflict';
    end if;
    return v_existing;
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

-- GLOBAL RESOLUTION LOCK ORDER:
-- orders -> order_closure_requests -> payment_attempts -> payment_resolution_actions
-- Lock the parent/business aggregate first, then the closure coordination row,
-- then payment-attempt rows, and finally resolution-action rows. Keep this
-- hierarchy consistent across migration-019 payment-resolution transactions.

create or replace function public.ensure_payment_resolution_action(
  p_order_id uuid,
  p_payment_attempt_id uuid,
  p_closure_request_id uuid,
  p_kind text,
  p_provider_action text,
  p_provider_payment_id text
)
returns public.payment_resolution_actions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_closure public.order_closure_requests%rowtype;
  v_existing public.payment_resolution_actions%rowtype;
  v_action public.payment_resolution_actions%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_marker text;
begin
  if p_kind is null or p_kind not in ('order_close_delete', 'order_close_refund', 'duplicate_paid_refund', 'provider_refund_review') then
    raise exception using errcode = '22023', message = 'invalid_resolution_kind';
  end if;
  if p_provider_action is null or p_provider_action not in ('delete', 'refund') then
    raise exception using errcode = '22023', message = 'invalid_provider_action';
  end if;
  if p_provider_payment_id is null or pg_catalog.btrim(p_provider_payment_id) = '' then
    raise exception using errcode = '22023', message = 'provider_payment_id_required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  if p_closure_request_id is not null then
    select * into v_closure
    from public.order_closure_requests
    where id = p_closure_request_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'order_closure_not_found';
    end if;
    if v_closure.order_id <> v_order.id then
      raise exception using errcode = '23514', message = 'closure_order_mismatch';
    end if;
  end if;

  select * into v_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment_attempt_not_found';
  end if;
  if v_attempt.order_id <> v_order.id then
    raise exception using errcode = '23514', message = 'payment_attempt_order_mismatch';
  end if;
  if v_attempt.provider <> 'asaas'
    or v_attempt.provider_payment_id is null
    or v_attempt.provider_payment_id <> p_provider_payment_id
  then
    raise exception using errcode = '23514', message = 'provider_payment_identity_mismatch';
  end if;

  select * into v_existing
  from public.payment_resolution_actions
  where payment_attempt_id = p_payment_attempt_id
    and provider_action = p_provider_action
  for update;

  if found then
    if v_existing.provider_payment_id <> p_provider_payment_id then
      raise exception using errcode = '23505', message = 'payment_resolution_provider_conflict';
    end if;
    if v_existing.closure_request_id is null and p_closure_request_id is not null then
      update public.payment_resolution_actions
      set closure_request_id = p_closure_request_id,
          updated_at = pg_catalog.now()
      where id = v_existing.id
      returning * into v_existing;
    end if;
    return v_existing;
  end if;

  v_marker := case
    when p_provider_action = 'refund' then 'NAB refund ' || v_id::text
    else 'NAB delete ' || v_id::text
  end;

  insert into public.payment_resolution_actions (
    id,
    order_id,
    payment_attempt_id,
    closure_request_id,
    kind,
    provider_action,
    state,
    provider,
    provider_payment_id,
    provider_marker
  ) values (
    v_id,
    p_order_id,
    p_payment_attempt_id,
    p_closure_request_id,
    p_kind,
    p_provider_action,
    'claimed',
    'asaas',
    p_provider_payment_id,
    v_marker
  )
  returning * into v_action;

  return v_action;
end;
$$;

create or replace function public.claim_payment_resolution_execution(p_action_id uuid)
returns public.payment_resolution_actions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action public.payment_resolution_actions%rowtype;
begin
  select * into v_action
  from public.payment_resolution_actions
  where id = p_action_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment_resolution_action_not_found';
  end if;

  if v_action.state <> 'claimed' then
    return null;
  end if;

  update public.payment_resolution_actions
  set state = 'provider_call_in_flight',
      updated_at = pg_catalog.now(),
      last_error_code = null
  where id = p_action_id
  returning * into v_action;

  return v_action;
end;
$$;

create or replace function public.finalize_order_closure_if_resolved(p_closure_request_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_closure public.order_closure_requests%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
begin
  select order_id into v_order_id
  from public.order_closure_requests
  where id = p_closure_request_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_closure_not_found';
  end if;

  select * into v_order
  from public.orders
  where id = v_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  select * into v_closure
  from public.order_closure_requests
  where id = p_closure_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_closure_not_found';
  end if;

  if v_closure.order_id <> v_order.id then
    raise exception using errcode = '23514', message = 'order_closure_order_mismatch';
  end if;

  if v_closure.state = 'completed' then
    return v_order;
  end if;

  -- Lock all financial rows before deciding whether fulfillment can close.
  perform 1
  from public.payment_attempts
  where order_id = v_order.id
  order by id
  for update;

  perform 1
  from public.payment_resolution_actions
  where order_id = v_order.id
  order by id
  for update;

  if exists (
    select 1
    from public.payment_resolution_actions pra
    where pra.order_id = v_order.id
      and pra.state not in ('completed', 'superseded')
  ) then
    raise exception using errcode = 'P0001', message = 'payment_resolution_incomplete';
  end if;

  if exists (
    select 1
    from public.payment_attempts pa
    where pa.order_id = v_order.id
      and not (
        pa.state in ('cancelled', 'refunded')
        or (pa.state = 'failed' and pa.provider_payment_id is null)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'payment_resolution_incomplete';
  end if;

  update public.order_closure_requests
  set state = 'ready_to_finalize',
      updated_at = pg_catalog.now(),
      last_error_code = null
  where id = v_closure.id;

  select * into v_order
  from public.transition_order_fulfillment(
    v_order.id,
    v_closure.target_status,
    case when v_closure.target_status = 'rejected' then v_closure.reason else null end,
    case when v_closure.target_status = 'cancelled' then v_closure.reason else null end
  );

  update public.order_closure_requests
  set state = 'completed',
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      last_error_code = null
  where id = v_closure.id;

  return v_order;
end;
$$;

-- Database-level guard: once an order is closing, no new payment attempt may be
-- introduced by retry-payment or a checkout replay race.
create or replace function public.prevent_payment_attempt_during_order_closure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.order_closure_requests ocr
    where ocr.order_id = new.order_id
      and ocr.state <> 'completed'
  ) then
    raise exception using errcode = 'P0001', message = 'order_closure_in_progress';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payment_attempt_order_closure_guard on public.payment_attempts;
create trigger trg_payment_attempt_order_closure_guard
  before insert on public.payment_attempts
  for each row execute function public.prevent_payment_attempt_during_order_closure();

-- Once financial closure starts, fulfillment is owned by the closure finalizer.
-- Read the open closure without taking another row lock: request/finalize paths
-- already serialize through the order row, and the trigger must not invert that
-- lock ordering. Only the finalizer's exact ready target may change status.
create or replace function public.prevent_fulfillment_change_during_order_closure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_closure public.order_closure_requests%rowtype;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_closure
  from public.order_closure_requests
  where order_id = new.id
    and state <> 'completed'
  order by created_at asc, id asc
  limit 1;

  if found and not (
    v_closure.state = 'ready_to_finalize'
    and new.status = v_closure.target_status
  ) then
    raise exception using errcode = 'P0001', message = 'order_closure_in_progress';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_fulfillment_closure_guard on public.orders;
create trigger trg_orders_fulfillment_closure_guard
  before update of status on public.orders
  for each row execute function public.prevent_fulfillment_change_during_order_closure();

revoke all on function public.request_order_closure(uuid, text, text) from public;
revoke execute on function public.request_order_closure(uuid, text, text) from anon, authenticated;
grant execute on function public.request_order_closure(uuid, text, text) to service_role;

revoke all on function public.ensure_payment_resolution_action(uuid, uuid, uuid, text, text, text) from public;
revoke execute on function public.ensure_payment_resolution_action(uuid, uuid, uuid, text, text, text) from anon, authenticated;
grant execute on function public.ensure_payment_resolution_action(uuid, uuid, uuid, text, text, text) to service_role;

revoke all on function public.claim_payment_resolution_execution(uuid) from public;
revoke execute on function public.claim_payment_resolution_execution(uuid) from anon, authenticated;
grant execute on function public.claim_payment_resolution_execution(uuid) to service_role;

revoke all on function public.finalize_order_closure_if_resolved(uuid) from public;
revoke execute on function public.finalize_order_closure_if_resolved(uuid) from anon, authenticated;
grant execute on function public.finalize_order_closure_if_resolved(uuid) to service_role;


-- Checkpoint 8 atomic deletion compatibility extension.
-- Migration 017 intentionally prevented stale regressions, but provider deletion is
-- terminal evidence that an owned failed/expired charge no longer exists. Preserve
-- every existing lock, identity, amount, ownership, and event-idempotency rule while
-- narrowly allowing failed/expired -> cancelled for attempts and their owning order.
create or replace function public.apply_asaas_payment_webhook(
  p_order_id uuid,
  p_payment_attempt_id uuid,
  p_event_id text,
  p_provider_payment_id text,
  p_proposed_state text,
  p_provider_amount_cents bigint,
  p_provider_amount_valid boolean,
  p_payment_method text,
  p_payment_link_url text,
  p_payment_expires_at timestamptz,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_existing_event public.payment_webhook_events%rowtype;
  v_fallback public.payment_attempts%rowtype;
  v_attempt_next_state text;
  v_order_next_state text;
  v_amount_error text;
  v_result text := 'applied';
  v_owns_order boolean := false;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception using errcode = '22023', message = 'webhook_event_id_required';
  end if;

  if p_proposed_state is null or p_proposed_state not in (
    'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'
  ) then
    raise exception using errcode = '22023', message = 'invalid_payment_state';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  select *
  into v_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment_attempt_not_found';
  end if;

  if v_attempt.order_id <> v_order.id then
    raise exception using errcode = '23514', message = 'payment_attempt_order_mismatch';
  end if;

  select *
  into v_existing_event
  from public.payment_webhook_events
  where provider = 'asaas'
    and event_id = p_event_id;

  if found then
    if v_existing_event.order_id <> v_order.id
      or v_existing_event.payment_attempt_id <> v_attempt.id
    then
      raise exception using errcode = '23505', message = 'payment_webhook_event_conflict';
    end if;

    return pg_catalog.jsonb_build_object(
      'result', v_existing_event.result,
      'duplicate', true,
      'error_code', v_existing_event.error_code,
      'order_code', v_order.order_code,
      'payment_state', v_order.payment_state,
      'attempt_state', v_attempt.state,
      'active_payment_attempt_id', v_order.active_payment_attempt_id
    );
  end if;

  if v_attempt.provider_payment_id is not null
    and p_provider_payment_id is not null
    and v_attempt.provider_payment_id <> p_provider_payment_id
  then
    raise exception using errcode = '23505', message = 'payment_reference_conflict';
  end if;

  v_owns_order := (
    v_order.active_payment_attempt_id = v_attempt.id
    or (
      v_order.active_payment_attempt_id is null
      and v_attempt.attempt_kind = 'original'
    )
  );

  if p_proposed_state = 'paid' then
    if not coalesce(p_provider_amount_valid, false) or p_provider_amount_cents is null then
      v_amount_error := 'payment_amount_invalid';
    elsif p_provider_amount_cents <> v_order.total_cents then
      v_amount_error := 'payment_amount_mismatch';
    end if;

    if v_amount_error is not null then
      update public.payment_attempts
      set
        provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
        provider_reported_state = 'paid',
        provider_amount_cents = case
          when v_attempt.state = 'paid' and v_attempt.amount_verification_state = 'verified'
            then v_attempt.provider_amount_cents
          when v_attempt.state in ('refunded', 'cancelled')
            then v_attempt.provider_amount_cents
          else p_provider_amount_cents
        end,
        amount_verification_state = case
          when v_attempt.state = 'paid' and v_attempt.amount_verification_state = 'verified'
            then v_attempt.amount_verification_state
          when v_attempt.state in ('refunded', 'cancelled')
            then v_attempt.amount_verification_state
          when v_amount_error = 'payment_amount_mismatch' then 'mismatch'
          else 'invalid'
        end,
        state = case
          when v_attempt.state in ('paid', 'refunded', 'cancelled') then v_attempt.state
          else 'payment_review'
        end,
        updated_at = now()
      where id = v_attempt.id;

      insert into public.payment_webhook_events (
        provider,
        event_id,
        order_id,
        payment_attempt_id,
        provider_payment_id,
        proposed_state,
        provider_amount_cents,
        result,
        error_code
      ) values (
        'asaas',
        p_event_id,
        v_order.id,
        v_attempt.id,
        p_provider_payment_id,
        p_proposed_state,
        p_provider_amount_cents,
        'rejected_amount',
        v_amount_error
      );

      return pg_catalog.jsonb_build_object(
        'result', 'rejected_amount',
        'duplicate', false,
        'error_code', v_amount_error,
        'order_code', v_order.order_code,
        'payment_state', v_order.payment_state,
        'attempt_state', case
          when v_attempt.state in ('paid', 'refunded', 'cancelled') then v_attempt.state
          else 'payment_review'
        end,
        'active_payment_attempt_id', v_order.active_payment_attempt_id
      );
    end if;
  end if;

  v_attempt_next_state := case v_attempt.state
    when 'pending' then
      case when p_proposed_state in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')
        then p_proposed_state else v_attempt.state end
    when 'failed' then
      case when p_proposed_state in ('failed', 'paid', 'cancelled', 'refunded')
        then p_proposed_state else v_attempt.state end
    when 'expired' then
      case when p_proposed_state in ('expired', 'paid', 'cancelled', 'refunded')
        then p_proposed_state else v_attempt.state end
    when 'paid' then
      case when p_proposed_state in ('paid', 'refunded')
        then p_proposed_state else v_attempt.state end
    when 'refunded' then 'refunded'
    when 'cancelled' then 'cancelled'
    when 'payment_review' then
      case when p_proposed_state in ('paid', 'refunded', 'failed', 'expired', 'cancelled')
        then p_proposed_state else v_attempt.state end
    else p_proposed_state
  end;

  if v_attempt_next_state <> p_proposed_state then
    update public.payment_attempts
    set
      provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
      provider_reported_state = p_proposed_state,
      updated_at = now()
    where id = v_attempt.id;

    insert into public.payment_webhook_events (
      provider,
      event_id,
      order_id,
      payment_attempt_id,
      provider_payment_id,
      proposed_state,
      provider_amount_cents,
      result,
      error_code
    ) values (
      'asaas',
      p_event_id,
      v_order.id,
      v_attempt.id,
      p_provider_payment_id,
      p_proposed_state,
      p_provider_amount_cents,
      'ignored_stale',
      null
    );

    return pg_catalog.jsonb_build_object(
      'result', 'ignored_stale',
      'duplicate', false,
      'error_code', null,
      'order_code', v_order.order_code,
      'payment_state', v_order.payment_state,
      'attempt_state', v_attempt.state,
      'active_payment_attempt_id', v_order.active_payment_attempt_id
    );
  end if;

  update public.payment_attempts
  set
    provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
    provider_reported_state = p_proposed_state,
    provider_amount_cents = case
      when p_proposed_state = 'paid' then p_provider_amount_cents
      else provider_amount_cents
    end,
    amount_verification_state = case
      when p_proposed_state = 'paid' then 'verified'
      else amount_verification_state
    end,
    state = v_attempt_next_state,
    last_event_id = p_event_id,
    updated_at = now()
  where id = v_attempt.id;

  if p_proposed_state = 'paid'
    and v_order.payment_state = 'paid'
    and v_order.active_payment_attempt_id is distinct from v_attempt.id
    and v_order.payment_external_id is not null
    and p_provider_payment_id is not null
    and v_order.payment_external_id <> p_provider_payment_id
  then
    v_result := 'additional_paid';
  elsif p_proposed_state = 'refunded' and v_owns_order then
    select *
    into v_fallback
    from public.payment_attempts
    where order_id = v_order.id
      and id <> v_attempt.id
      and state = 'paid'
      and amount_verification_state = 'verified'
    order by created_at asc, id asc
    limit 1
    for update;

    if found then
      update public.orders
      set
        payment_provider = 'asaas',
        payment_method = coalesce(v_fallback.payment_method, payment_method),
        payment_ref = coalesce(v_fallback.provider_payment_id, payment_ref),
        payment_state = 'paid',
        payment_external_id = coalesce(v_fallback.provider_payment_id, payment_external_id),
        active_payment_attempt_id = v_fallback.id,
        payment_last_event = p_event_id
      where id = v_order.id;
      v_result := 'switch_to_paid';
    else
      update public.orders
      set
        payment_provider = 'asaas',
        payment_method = coalesce(p_payment_method, payment_method),
        payment_ref = coalesce(p_provider_payment_id, payment_ref),
        payment_state = 'refunded',
        payment_external_id = coalesce(p_provider_payment_id, payment_external_id),
        active_payment_attempt_id = v_attempt.id,
        payment_last_event = p_event_id
      where id = v_order.id;
      v_result := 'applied';
    end if;
  elsif not v_owns_order and p_proposed_state <> 'paid' then
    v_result := 'ignored_non_owner';
  elsif p_proposed_state = 'paid' then
    v_order_next_state := case v_order.payment_state
      when 'pending' then 'paid'
      when 'failed' then 'paid'
      when 'expired' then 'paid'
      when 'paid' then 'paid'
      when 'refunded' then 'refunded'
      when 'cancelled' then 'cancelled'
      else 'paid'
    end;

    if v_order_next_state = 'paid' then
      update public.orders
      set
        payment_provider = 'asaas',
        payment_method = coalesce(p_payment_method, payment_method),
        payment_ref = coalesce(p_provider_payment_id, payment_ref),
        payment_state = 'paid',
        payment_external_id = coalesce(p_provider_payment_id, payment_external_id),
        payment_link_url = coalesce(p_payment_link_url, payment_link_url),
        payment_expires_at = coalesce(p_payment_expires_at, payment_expires_at),
        active_payment_attempt_id = v_attempt.id,
        payment_last_event = p_event_id,
        paid_at = coalesce(paid_at, p_paid_at, now()),
        paid_total_cents = p_provider_amount_cents
      where id = v_order.id;
      v_result := 'applied';
    else
      v_result := 'ignored_stale';
    end if;
  elsif v_owns_order then
    v_order_next_state := case v_order.payment_state
      when 'pending' then
        case when p_proposed_state in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')
          then p_proposed_state else v_order.payment_state end
      when 'failed' then
        case when p_proposed_state in ('failed', 'paid', 'cancelled', 'refunded')
          then p_proposed_state else v_order.payment_state end
      when 'expired' then
        case when p_proposed_state in ('expired', 'paid', 'cancelled', 'refunded')
          then p_proposed_state else v_order.payment_state end
      when 'paid' then
        case when p_proposed_state in ('paid', 'refunded')
          then p_proposed_state else v_order.payment_state end
      when 'refunded' then 'refunded'
      when 'cancelled' then 'cancelled'
      else p_proposed_state
    end;

    if v_order_next_state = p_proposed_state then
      update public.orders
      set
        payment_provider = 'asaas',
        payment_method = coalesce(p_payment_method, payment_method),
        payment_ref = coalesce(p_provider_payment_id, payment_ref),
        payment_state = v_order_next_state,
        payment_external_id = coalesce(p_provider_payment_id, payment_external_id),
        payment_link_url = coalesce(p_payment_link_url, payment_link_url),
        payment_expires_at = coalesce(p_payment_expires_at, payment_expires_at),
        active_payment_attempt_id = v_attempt.id,
        payment_last_event = p_event_id
      where id = v_order.id;
      v_result := 'applied';
    else
      v_result := 'ignored_stale';
    end if;
  end if;

  insert into public.payment_webhook_events (
    provider,
    event_id,
    order_id,
    payment_attempt_id,
    provider_payment_id,
    proposed_state,
    provider_amount_cents,
    result,
    error_code
  ) values (
    'asaas',
    p_event_id,
    v_order.id,
    v_attempt.id,
    p_provider_payment_id,
    p_proposed_state,
    p_provider_amount_cents,
    v_result,
    null
  );

  select * into v_order from public.orders where id = p_order_id;
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id;

  return pg_catalog.jsonb_build_object(
    'result', v_result,
    'duplicate', false,
    'error_code', null,
    'order_code', v_order.order_code,
    'payment_state', v_order.payment_state,
    'attempt_state', v_attempt.state,
    'active_payment_attempt_id', v_order.active_payment_attempt_id,
    'provider_payment_id', v_attempt.provider_payment_id
  );
exception
  when unique_violation then
    -- Provider-payment uniqueness and event uniqueness are both financial identity
    -- constraints. A concurrent duplicate event normally serializes on the locked
    -- order row and is handled above; any other uniqueness collision must abort the
    -- entire transaction so the provider can retry after the conflict is resolved.
    raise;
end;
$$;
