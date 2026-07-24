-- AFA Southern Utah Slow-Pitch — Stage One Schema
-- Applied via Supabase Management API SQL runner (no local psql needed).
-- Posture: Data API auto-expose OFF by default on this project — every table below
-- states its intended exposure explicitly. RLS is ON for all tables; policies are
-- additive allow-lists. No policy = no access (except service_role, which bypasses
-- RLS entirely and is never sent to the browser).

-- ============================================================
-- tournaments — PUBLIC READ. No PII. Schedule/results source.
-- ============================================================
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  venue_name text not null,
  venue_address text,
  entry_fee_cents integer,
  deposit_cents integer,
  game_guarantee text, -- e.g. '3GG', '4GG'
  divisions_offered text, -- free text summary, e.g. "Coed Uppers, Coed Lowers, Church"
  poster_url text,
  fb_album_url text,
  contacts jsonb not null default '[]', -- [{name, phone}]
  is_placeholder boolean not null default false,
  status text not null default 'upcoming', -- upcoming | complete
  -- region added 2026-07-23 (JD ruling): southern_utah is home base (registration,
  -- brackets, scorekeeper). northern_utah and series are published-schedule-only for
  -- now — same shape, so they can graduate to full tournaments later with no redo.
  region text not null default 'southern_utah'
    check (region in ('southern_utah', 'northern_utah', 'series')),
  -- notes added 2026-07-23: short plain-text operational lines that have no
  -- dedicated column (e.g. "$10/game ump fees", "6-team minimum per
  -- division"). Nullable — most tournaments have none. Rendered as plain
  -- text under the facts list on the event page.
  notes text,
  created_at timestamptz not null default now()
);
comment on table public.tournaments is 'Public schedule data. No PII. Safe for anon read.';

-- ============================================================
-- classes — PUBLIC READ, director-write (via scorekeeper door, a later
-- step). League-level skill classes (Rec/E/D/Open/...). Added 2026-07-23,
-- spec: afa-divisions-spec.md, "Build order" step 1. Directors add classes
-- themselves later (insert a row, no code change); this migration seeds
-- the four the league already runs. Aliases (e.g. Open's Championship/
-- Champ/Uppers) resolve to ONE class row, never create a second.
-- ============================================================
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  hr_limit integer, -- nullable — league hasn't ruled its own HR limits yet
  bands_note text,
  rules_notes text,
  created_at timestamptz not null default now()
);
comment on table public.classes is 'Public league-level skill classes (Rec/E/D/Open/...). No PII. Safe for anon read. Director-write via the scorekeeper door (future step) — no code change to add a class, just a row.';

-- ============================================================
-- divisions — PUBLIC READ. No PII.
-- ============================================================
create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null, -- e.g. 'Coed Uppers'
  bracket_type text not null default 'double_elim', -- double_elim | double_elim_consolation
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- Division model — gender x class (added 2026-07-23, spec:
  -- afa-divisions-spec.md). All nullable, additive only; existing rows stay
  -- valid untouched. The rendered name is `display_name ?? "{Gender}
  -- {Class}"`. `name` stays as-is until the migration is verified in
  -- production use, then becomes generated/derived — not this step.
  gender text check (gender in ('mens', 'womens', 'coed')),
  class_id uuid references public.classes(id),
  display_name text,
  -- day_label added 2026-07-23 (lobby redesign, dispatch-brief-4): the day
  -- this group plays, director-entered text, rendered verbatim on the
  -- group card. Nullable — most divisions have none yet.
  day_label text,
  -- day_date added 2026-07-23 (dispatch-brief-5): the real date behind
  -- day_label. day_label stays the display verbatim text; day_date is the
  -- machine truth the calendar route and per-event .ics links key off.
  -- Nullable — most divisions have none yet.
  day_date date,
  unique (tournament_id, name)
);
comment on table public.divisions is 'Public division list per tournament. No PII. Safe for anon read.';
comment on column public.divisions.day_label is 'Director-entered day text (e.g. "Sat, Aug 22"), rendered verbatim on the group card. Nullable — most divisions have none yet.';
comment on column public.divisions.day_date is 'The real date behind day_label — machine truth for per-event calendar links/splitting. Nullable — most divisions have none yet; day_label is display, day_date is the date to compute from.';

-- ============================================================
-- placements — PUBLIC READ. Champion/runner-up + photo. No PII (team name only).
-- Populated by stage-two scorekeeper door; table exists now so results
-- sections render (empty) without a schema migration later.
-- ============================================================
create table if not exists public.placements (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  place text not null check (place in ('champion', 'runner_up')),
  team_name text not null,
  photo_url text,
  created_at timestamptz not null default now()
);
comment on table public.placements is 'Public results (champion/runner-up + photo). No PII. Safe for anon read.';

-- ============================================================
-- registrations — PRIVATE. Sensitive PII (addresses, signatures, minors' data).
-- NEVER exposed to the Data API (auto-expose stays off for this table) and
-- NEVER given a public RLS policy. Only the service_role key (used exclusively
-- server-side, inside the /api/register route) can read or write this table.
-- ============================================================
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id),
  division_id uuid not null references public.divisions(id),
  team_name text not null,
  class text,
  afa_membership_number text,
  manager_name text not null,
  manager_email text not null,
  manager_phone text,
  manager_cell text,
  manager_address text,
  manager_city text,
  manager_state text,
  manager_zip text,
  manager_signature_png text not null, -- base64 data URL captured on-screen at submission — the manager is present and signs immediately, same as the paper form's Manager block
  release_text_version text not null default 'waiver-2026-v1',
  pdf_storage_path text, -- path in the private 'waivers' bucket, regenerated as each roster member signs
  submitted_at timestamptz not null default now()
);
comment on table public.registrations is 'PRIVATE. PII + signatures. No Data API exposure, no RLS policies — service_role only. No outbound email exists anywhere in this codebase (JD ruling 2026-07-21) — do not add a send here without a new explicit ruling.';

-- ============================================================
-- roster_members — PRIVATE. One row per player/coach on a registration.
-- Each gets its own signing_token (a random UUID — unguessable, not
-- enumerable, never listed publicly) that serves as a personal remote
-- signing link: /register/sign/{signing_token}. Knowledge of the token
-- is the credential, the same trust model DocuSign-style e-sign links use.
-- The manager shares the link herself (text, in person, whatever) — this
-- app never sends it anywhere. Locked exactly like `registrations`: RLS
-- on, zero policies, no anon/authenticated grant. The one API route that
-- reads by token (app/api/register/sign/route.js) uses service_role and
-- looks up by exact token match only — there is no list/enumerate path.
-- ============================================================
create table if not exists public.roster_members (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  role text not null check (role in ('player', 'coach')),
  name text not null,
  birth_date date, -- players only
  address text, -- players only
  email text, -- coaches only
  phone text, -- coaches only
  signing_token uuid not null default gen_random_uuid() unique,
  signature_png text, -- null until they sign
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.roster_members is 'PRIVATE. PII + signatures, one row per player/coach. No Data API exposure, no RLS policies — service_role only. signing_token gates the personal remote-sign link.';

-- ============================================================
-- brackets — PUBLIC READ. One row per division once generated. No PII —
-- format/sizing metadata only. Writes are service_role only, gated in
-- application code by the scorekeeper PIN (see lib/scorekeeper-auth.js) —
-- there is no per-user Postgres role for this, the PIN check happens in
-- the API route before any service_role write is issued.
-- ============================================================
create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  bracket_group text not null default 'main' check (bracket_group in ('main', 'consolation')),
  format text not null default 'double_elim', -- double_elim | double_elim_consolation
  team_count integer not null, -- for 'consolation': the max possible entrant count (main team_count - 1)
  bracket_size integer not null, -- team_count padded up to the next power of 2
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (division_id, bracket_group)
);
comment on table public.brackets is 'Public bracket metadata. No PII. Safe for anon read. Writes gated by scorekeeper PIN in application code. Two rows per division when format=double_elim_consolation (main + consolation).';

-- ============================================================
-- games — PUBLIC READ. The bracket IS the schedule. Team names only (same
-- public-safe pattern as placements) — never joined to registrations for
-- public consumption. Writes are service_role only, gated by the
-- scorekeeper PIN in application code.
-- ============================================================
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  bracket_group text not null default 'main' check (bracket_group in ('main', 'consolation')),
  bracket_side text not null check (bracket_side in ('winners', 'losers', 'final')),
  round integer not null,
  slot integer not null,
  team1_name text,
  team2_name text,
  -- Self-referential feed: when the feeder game finalizes, this slot's team
  -- name is filled in automatically (winner or loser of that game). Nullable
  -- because round-1 winners-bracket slots get their team names directly at
  -- generation time instead (main bracket: a real registered team, or a
  -- permanent bye; consolation bracket: a permanent bye, or "open" — see
  -- team1_is_open_entry below).
  team1_source_game_id uuid references public.games(id),
  team1_source_result text check (team1_source_result in ('winner', 'loser')),
  team2_source_game_id uuid references public.games(id),
  team2_source_result text check (team2_source_result in ('winner', 'loser')),
  -- Consolation-bracket winners-round-1 slots only. A team enters the
  -- consolation bracket once it's eliminated (2nd loss) from the MAIN
  -- bracket, starting fresh at 0 losses (JD's ruling, 2026-07-21) — but
  -- WHICH team lands in which slot isn't known until that actually
  -- happens live, so these slots start with team*_name null and get
  -- filled in as eliminations occur (FIFO by elimination order), rather
  -- than at generation time like every other slot. A null name with this
  -- flag false is a permanent bye instead (never gets a team) — the two
  -- look identical otherwise, hence a flag per slot, not per row: one
  -- match can pair one open slot against one bye.
  team1_is_open_entry boolean not null default false,
  team2_is_open_entry boolean not null default false,
  is_bye boolean not null default false, -- auto-resolved walkover, not a human-entered score
  field text,
  scheduled_time timestamptz,
  team1_score integer,
  team2_score integer,
  winner_slot text check (winner_slot in ('team1', 'team2')),
  status text not null default 'pending', -- pending | final | cancelled (cancelled = an unneeded "if necessary" game)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, bracket_group, bracket_side, round, slot)
);
comment on table public.games is 'Public bracket/schedule data. Team names only, no PII. Safe for anon read. Writes gated by scorekeeper PIN in application code.';

-- ============================================================
-- settings — PRIVATE. Key/value store, currently just the scorekeeper PIN
-- hash. No Data API exposure, no RLS policies — service_role only, same as
-- registrations/roster_members.
-- ============================================================
create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
comment on table public.settings is 'PRIVATE. Scorekeeper PIN hash lives here. No Data API exposure, no RLS policies — service_role only.';

alter table public.tournaments enable row level security;
alter table public.classes enable row level security;
alter table public.divisions enable row level security;
alter table public.placements enable row level security;
alter table public.registrations enable row level security;
alter table public.roster_members enable row level security;
alter table public.brackets enable row level security;
alter table public.games enable row level security;
alter table public.settings enable row level security;

-- Public read policies — anon (and authenticated) may SELECT only. No INSERT/UPDATE/DELETE policy exists
-- for anyone but service_role, which bypasses RLS by design.
drop policy if exists "public read tournaments" on public.tournaments;
create policy "public read tournaments" on public.tournaments for select using (true);

drop policy if exists "public read classes" on public.classes;
create policy "public read classes" on public.classes for select using (true);

-- ============================================================
-- Grants — the complete, verified map (2026-07-23). This project's Data
-- API posture is "auto-expose new tables OFF": new tables get NO role
-- grants at all by default, not even service_role — every grant must be
-- explicit, and any new table needs its lines added here.
--
-- Verified against information_schema.role_table_grants on the live DB
-- 2026-07-23, AFTER a hardening pass: Supabase default-privilege residue
-- had left anon/authenticated holding TRUNCATE, TRIGGER, and REFERENCES
-- on every table INCLUDING the private PII ones. TRUNCATE is not gated
-- by RLS. Not reachable through PostgREST today, but the privilege had
-- no reason to exist — revoked on all current tables AND from default
-- privileges so future tables don't regrow it:
--   revoke truncate, trigger, references on all tables in schema public
--     from anon, authenticated;
--   alter default privileges in schema public revoke truncate, trigger,
--     references on tables from anon, authenticated;
--
-- The resulting law: anon/authenticated = SELECT on the six public
-- tables below, NOTHING on registrations/roster_members/settings/
-- scorekeeper_auth_throttle. service_role = ALL on everything
-- (server-side only, never shipped to a browser).
grant select on public.tournaments to anon, authenticated;
grant select on public.divisions to anon, authenticated;
grant select on public.placements to anon, authenticated;
grant select on public.brackets to anon, authenticated;
grant select on public.games to anon, authenticated;
grant select on public.classes to anon, authenticated;
grant all on public.tournaments to service_role;
grant all on public.divisions to service_role;
grant all on public.placements to service_role;
grant all on public.brackets to service_role;
grant all on public.games to service_role;
grant all on public.classes to service_role;
grant all on public.registrations to service_role;
grant all on public.roster_members to service_role;
grant all on public.settings to service_role;
grant all on public.scorekeeper_auth_throttle to service_role;

drop policy if exists "public read divisions" on public.divisions;
create policy "public read divisions" on public.divisions for select using (true);

drop policy if exists "public read placements" on public.placements;
create policy "public read placements" on public.placements for select using (true);

drop policy if exists "public read brackets" on public.brackets;
create policy "public read brackets" on public.brackets for select using (true);

drop policy if exists "public read games" on public.games;
create policy "public read games" on public.games for select using (true);

-- registrations, roster_members, settings: deliberately zero policies. RLS is enabled with no
-- grants, so anon/authenticated get nothing at all. Only service_role (server-side only, never
-- shipped to the browser) can touch these tables.

-- Helpful indexes
create index if not exists idx_divisions_tournament on public.divisions(tournament_id);
create index if not exists idx_divisions_class on public.divisions(class_id);
create index if not exists idx_placements_division on public.placements(division_id);
create index if not exists idx_registrations_tournament on public.registrations(tournament_id);
create index if not exists idx_registrations_division on public.registrations(division_id);
create index if not exists idx_roster_members_registration on public.roster_members(registration_id);
create index if not exists idx_roster_members_signing_token on public.roster_members(signing_token);
create index if not exists idx_games_division on public.games(division_id);
create index if not exists idx_games_team1_source on public.games(team1_source_game_id);
create index if not exists idx_games_team2_source on public.games(team2_source_game_id);

-- Seed the four classes the league already runs (2026-07-23). Open/
-- Championship/Champ/Uppers are the same class by the league's own usage
-- (JD ruling 2026-07-23) — aliases resolve them to one row, not four.
-- Directors add classes beyond this themselves later, via the scorekeeper
-- door. No hr_limit values — the league hasn't ruled its own numbers.
insert into public.classes (name, aliases, sort_order)
values
  ('Rec', '{}', 10),
  ('E', '{}', 20),
  ('D', '{}', 30),
  ('Open', '{Championship,Champ,Uppers}', 40)
on conflict (name) do nothing;

-- ============================================================
-- scorekeeper_auth_throttle — PRIVATE. Brute-force protection state for
-- /api/scorekeeper/auth (Catmull, 2026-07-21: 15 rapid wrong-PIN guesses
-- all returned 401 with no backoff — a 4-6 digit PIN is brute-forceable in
-- minutes to hours otherwise). One row per throttle "scope": either
-- `ip:<address>` (per-IP) or the literal string `global` (account-wide,
-- catches a distributed attack spread across many IPs — there's only one
-- shared PIN, not per-user accounts, so a global lock is the correct
-- backstop). RLS on, zero policies, no grants — same lockdown as
-- `settings`. Only ever touched by check_and_record_scorekeeper_attempt(),
-- which serializes concurrent attempts on the same scope with `for update`
-- so parallel Vercel invocations can't race the counter (Catmull's other
-- finding: Vercel auto-scales, so per-instance in-memory throttling would
-- have done nothing against parallel guessing).
-- ============================================================
create table if not exists public.scorekeeper_auth_throttle (
  scope text primary key,
  fail_count integer not null default 0,
  last_fail_at timestamptz,
  locked_until timestamptz,
  lockout_count integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.scorekeeper_auth_throttle is 'PRIVATE. Brute-force throttle state for the scorekeeper PIN. No Data API exposure, no RLS policies — service_role only, via the check_and_record_scorekeeper_attempt() function.';

alter table public.scorekeeper_auth_throttle enable row level security;
-- Deliberately zero policies and no grants — see comment above.

-- Atomically checks whether a scope is currently locked out and, if not,
-- records this attempt's result — incrementing the failure count (reset if
-- the last failure fell outside the rolling window) and applying an
-- escalating lockout once the threshold is crossed. `for update` locks the
-- row for the duration of the transaction, so concurrent requests against
-- the same scope are serialized rather than racing a lost update.
create or replace function public.check_and_record_scorekeeper_attempt(
  p_scope text,
  p_success boolean,
  p_window_seconds integer default 900,
  p_threshold integer default 5,
  p_lockout_minutes integer[] default array[1, 5, 15, 60, 240]
) returns table(is_locked boolean, locked_until timestamptz, retry_after_seconds integer)
language plpgsql
as $$
declare
  row_rec public.scorekeeper_auth_throttle%rowtype;
  now_ts timestamptz := now();
  new_fail_count integer;
  new_lockout_minutes integer;
  new_locked_until timestamptz;
begin
  insert into public.scorekeeper_auth_throttle (scope) values (p_scope)
    on conflict (scope) do nothing;

  select * into row_rec from public.scorekeeper_auth_throttle where scope = p_scope for update;

  if row_rec.locked_until is not null and row_rec.locked_until > now_ts then
    return query select true, row_rec.locked_until,
      ceil(extract(epoch from (row_rec.locked_until - now_ts)))::integer;
    return;
  end if;

  if p_success then
    update public.scorekeeper_auth_throttle
      set fail_count = 0, locked_until = null, lockout_count = 0, last_fail_at = null, updated_at = now_ts
      where scope = p_scope;
    return query select false, null::timestamptz, null::integer;
    return;
  end if;

  if row_rec.last_fail_at is null or row_rec.last_fail_at < now_ts - make_interval(secs => p_window_seconds) then
    new_fail_count := 1;
  else
    new_fail_count := row_rec.fail_count + 1;
  end if;

  if new_fail_count >= p_threshold then
    new_lockout_minutes := p_lockout_minutes[least(row_rec.lockout_count + 1, array_length(p_lockout_minutes, 1))];
    new_locked_until := now_ts + make_interval(mins => new_lockout_minutes);
    update public.scorekeeper_auth_throttle
      set fail_count = 0, last_fail_at = now_ts, locked_until = new_locked_until,
          lockout_count = row_rec.lockout_count + 1, updated_at = now_ts
      where scope = p_scope;
    return query select true, new_locked_until, (new_lockout_minutes * 60);
  else
    update public.scorekeeper_auth_throttle
      set fail_count = new_fail_count, last_fail_at = now_ts, updated_at = now_ts
      where scope = p_scope;
    return query select false, null::timestamptz, null::integer;
  end if;
end;
$$;

-- Read-only lock check — used to gate the request BEFORE running bcrypt
-- (saves the ~0.35s compare cost during an active lockout, and means a
-- locked-out caller never gets a timing signal from the compare at all).
create or replace function public.is_scorekeeper_locked(p_scope text)
returns table(is_locked boolean, locked_until timestamptz, retry_after_seconds integer)
language plpgsql
as $$
declare
  row_rec public.scorekeeper_auth_throttle%rowtype;
  now_ts timestamptz := now();
begin
  select * into row_rec from public.scorekeeper_auth_throttle where scope = p_scope;
  if row_rec.locked_until is not null and row_rec.locked_until > now_ts then
    return query select true, row_rec.locked_until,
      ceil(extract(epoch from (row_rec.locked_until - now_ts)))::integer;
  else
    return query select false, null::timestamptz, null::integer;
  end if;
end;
$$;

-- service_role only — anon/authenticated never get to call these directly.
grant execute on function public.check_and_record_scorekeeper_attempt(text, boolean, integer, integer, integer[]) to service_role;
grant execute on function public.is_scorekeeper_locked(text) to service_role;
