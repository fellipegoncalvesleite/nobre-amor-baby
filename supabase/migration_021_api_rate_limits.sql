-- ============================================================
-- Nobre Amor Baby — durable public API abuse protection
-- ============================================================
-- One row is reused for the current fixed window of each scope/subject hash.
-- Raw user, email, IP, token, and payment data never belong in this table.

create table public.api_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count bigint not null,
  updated_at timestamptz not null,
  primary key (scope, subject_hash),
  constraint api_rate_limits_scope_check check (
    pg_catalog.char_length(scope) between 1 and 80
    and scope ~ '^[a-z0-9][a-z0-9:-]*$'
  ),
  constraint api_rate_limits_subject_hash_check check (
    subject_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint api_rate_limits_request_count_check check (request_count >= 0)
);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns table (
  allowed boolean,
  limit_value integer,
  remaining bigint,
  retry_after_seconds integer,
  reset_at timestamptz,
  request_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count bigint;
  v_reset_at timestamptz;
  v_retry numeric;
begin
  if p_scope is null
     or pg_catalog.char_length(p_scope) < 1
     or pg_catalog.char_length(p_scope) > 80
     or p_scope !~ '^[a-z0-9][a-z0-9:-]*$'
     or p_subject_hash is null
     or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null
     or p_limit < 1
     or p_limit > 100000
     or p_window_seconds is null
     or p_window_seconds < 1
     or p_window_seconds > 86400
     or p_cost is null
     or p_cost < 1
     or p_cost > p_limit then
    raise exception 'invalid_rate_limit_argument' using errcode = '22023';
  end if;

  insert into public.api_rate_limits as current_counter (
    scope,
    subject_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_scope,
    p_subject_hash,
    v_now,
    p_cost,
    v_now
  )
  on conflict (scope, subject_hash) do update
    set window_started_at = case
          when current_counter.window_started_at
               + pg_catalog.make_interval(secs => p_window_seconds) <= v_now
            then v_now
          else current_counter.window_started_at
        end,
        request_count = case
          when current_counter.window_started_at
               + pg_catalog.make_interval(secs => p_window_seconds) <= v_now
            then p_cost::bigint
          else current_counter.request_count + p_cost::bigint
        end,
        updated_at = v_now
  returning current_counter.window_started_at, current_counter.request_count
    into v_window_started_at, v_request_count;

  v_reset_at := v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds);

  allowed := v_request_count <= p_limit;
  limit_value := p_limit;
  remaining := greatest(p_limit::bigint - v_request_count, 0::bigint);
  reset_at := v_reset_at;
  request_count := v_request_count;

  if allowed then
    retry_after_seconds := 0;
  else
    v_retry := pg_catalog.ceil(extract(epoch from (v_reset_at - v_now)));
    retry_after_seconds := greatest(1, v_retry::integer);
  end if;

  return next;
end;
$$;

revoke execute on function public.consume_api_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer, integer)
  to service_role;
