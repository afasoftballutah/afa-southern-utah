-- NOT APPLIED. Do not run this against prod (or any) Supabase without
-- J.D.'s explicit OK. The live site uses an in-memory per-IP limiter
-- (lib/ip-rate-limit.js) until this is approved and applied.
--
-- Why a new table, not scorekeeper_auth_throttle: that table and
-- check_and_record_scorekeeper_attempt() are fail/success PIN lockouts.
-- A successful request resets the counter, so it cannot cap address
-- typeahead or registration POSTs. Reusing it would also mix those
-- counters with the shared PIN lockout.
--
-- After apply, switch lib/ip-rate-limit.js (or the route handlers) to
-- call check_and_record_public_rate_limit() with a per-route scope
-- such as 'lookup:ip:1.2.3.4'.

create table if not exists public.public_rate_limit (
  scope text primary key,
  hit_count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.public_rate_limit is
  'PRIVATE. Per-scope (usually per-IP + route) fixed-window counters for public forms. No Data API exposure, no RLS policies — service_role only.';

alter table public.public_rate_limit enable row level security;
-- Deliberately zero policies. Grants only to service_role.

grant all on public.public_rate_limit to service_role;

-- Atomically records one hit and reports whether the scope is over the
-- cap for this window. `for update` serializes concurrent Vercel
-- invocations on the same scope.
create or replace function public.check_and_record_public_rate_limit(
  p_scope text,
  p_limit integer,
  p_window_seconds integer
) returns table(is_limited boolean, retry_after_seconds integer)
language plpgsql
as $$
declare
  row_rec public.public_rate_limit%rowtype;
  now_ts timestamptz := now();
  new_count integer;
begin
  insert into public.public_rate_limit (scope, hit_count, window_start, updated_at)
    values (p_scope, 0, now_ts, now_ts)
    on conflict (scope) do nothing;

  select * into row_rec from public.public_rate_limit where scope = p_scope for update;

  if row_rec.window_start <= now_ts - make_interval(secs => p_window_seconds) then
    new_count := 1;
    update public.public_rate_limit
      set hit_count = 1, window_start = now_ts, updated_at = now_ts
      where scope = p_scope;
  else
    new_count := row_rec.hit_count + 1;
    update public.public_rate_limit
      set hit_count = new_count, updated_at = now_ts
      where scope = p_scope;
  end if;

  if new_count > p_limit then
    return query select true,
      greatest(1, ceil(extract(epoch from (row_rec.window_start + make_interval(secs => p_window_seconds) - now_ts)))::integer);
  else
    return query select false, 0;
  end if;
end;
$$;

grant execute on function public.check_and_record_public_rate_limit(text, integer, integer) to service_role;
