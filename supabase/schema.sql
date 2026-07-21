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
  created_at timestamptz not null default now()
);
comment on table public.tournaments is 'Public schedule data. No PII. Safe for anon read.';

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
  unique (tournament_id, name)
);
comment on table public.divisions is 'Public division list per tournament. No PII. Safe for anon read.';

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
  division_id uuid not null references public.divisions(id) on delete cascade unique,
  format text not null default 'double_elim', -- double_elim | double_elim_consolation (latter not yet implemented — see README)
  team_count integer not null,
  bracket_size integer not null, -- team_count padded up to the next power of 2
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.brackets is 'Public bracket metadata. No PII. Safe for anon read. Writes gated by scorekeeper PIN in application code.';

-- ============================================================
-- games — PUBLIC READ. The bracket IS the schedule. Team names only (same
-- public-safe pattern as placements) — never joined to registrations for
-- public consumption. Writes are service_role only, gated by the
-- scorekeeper PIN in application code.
-- ============================================================
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  bracket_side text not null check (bracket_side in ('winners', 'losers', 'final')),
  round integer not null,
  slot integer not null,
  team1_name text,
  team2_name text,
  -- Self-referential feed: when the feeder game finalizes, this slot's team
  -- name is filled in automatically (winner or loser of that game). Nullable
  -- because round-1 winners-bracket slots get their team names directly at
  -- generation time instead.
  team1_source_game_id uuid references public.games(id),
  team1_source_result text check (team1_source_result in ('winner', 'loser')),
  team2_source_game_id uuid references public.games(id),
  team2_source_result text check (team2_source_result in ('winner', 'loser')),
  is_bye boolean not null default false, -- auto-resolved walkover at generation time, not a human-entered score
  field text,
  scheduled_time timestamptz,
  team1_score integer,
  team2_score integer,
  winner_slot text check (winner_slot in ('team1', 'team2')),
  status text not null default 'pending', -- pending | final | cancelled (cancelled = the GF2 "if necessary" game, when not needed)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, bracket_side, round, slot)
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
create index if not exists idx_placements_division on public.placements(division_id);
create index if not exists idx_registrations_tournament on public.registrations(tournament_id);
create index if not exists idx_registrations_division on public.registrations(division_id);
create index if not exists idx_roster_members_registration on public.roster_members(registration_id);
create index if not exists idx_roster_members_signing_token on public.roster_members(signing_token);
create index if not exists idx_games_division on public.games(division_id);
create index if not exists idx_games_team1_source on public.games(team1_source_game_id);
create index if not exists idx_games_team2_source on public.games(team2_source_game_id);
