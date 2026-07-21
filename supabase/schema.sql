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
  manager_signature_png text not null, -- base64 data URL captured on-screen at submission
  players jsonb not null default '[]', -- [{name, birth_date, address}]
  coaches jsonb not null default '[]', -- [{name, email, phone}]
  release_text_version text not null default 'waiver-2026-v1',
  pdf_storage_path text, -- path in the private 'waivers' bucket, set after PDF generation
  submitted_at timestamptz not null default now(),
  email_status text not null default 'pending', -- pending | sent | failed
  email_error text
);
comment on table public.registrations is 'PRIVATE. PII + signatures. No Data API exposure, no RLS policies — service_role only.';

alter table public.tournaments enable row level security;
alter table public.divisions enable row level security;
alter table public.placements enable row level security;
alter table public.registrations enable row level security;

-- Public read policies — anon (and authenticated) may SELECT only. No INSERT/UPDATE/DELETE policy exists
-- for anyone but service_role, which bypasses RLS by design.
drop policy if exists "public read tournaments" on public.tournaments;
create policy "public read tournaments" on public.tournaments for select using (true);

drop policy if exists "public read divisions" on public.divisions;
create policy "public read divisions" on public.divisions for select using (true);

drop policy if exists "public read placements" on public.placements;
create policy "public read placements" on public.placements for select using (true);

-- registrations: deliberately zero policies. RLS is enabled with no grants, so anon/authenticated
-- get nothing at all. Only service_role (server-side only, never shipped to the browser) can touch it.

-- Helpful indexes
create index if not exists idx_divisions_tournament on public.divisions(tournament_id);
create index if not exists idx_placements_division on public.placements(division_id);
create index if not exists idx_registrations_tournament on public.registrations(tournament_id);
create index if not exists idx_registrations_division on public.registrations(division_id);
