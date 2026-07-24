-- Additive migration: pool_games
-- Task: dispatch-brief-7 (Coed E Heatstroker pool play, live Fri 7/24).
-- Pool play is a separate, self-contained stage from the bracket engine
-- (lib/bracket/*, brackets, games) — that engine stays untouched. These
-- rows are Friday-night round-robin-style pool games; Gold/Silver
-- double-elim brackets Saturday use the EXISTING games/brackets tables via
-- the existing engine, not this table.
create table if not exists public.pool_games (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  pool text not null,                -- 'A'..'F'
  scheduled_time timestamptz,        -- absolute instant; display in America/Denver
  field text,                        -- 'Field 1'..'Field 7'
  team1_name text not null,
  team2_name text not null,
  team1_score integer,
  team2_score integer,
  status text not null default 'scheduled' check (status in ('scheduled','final')),
  created_at timestamptz not null default now()
);
comment on table public.pool_games is 'Pool games are a separate stage from the bracket engine. Team lists and standings DERIVE from these rows; ties in standings are broken by the director at seeding, not computed. Public read, no PII.';

alter table public.pool_games enable row level security;

drop policy if exists "public read pool_games" on public.pool_games;
create policy "public read pool_games" on public.pool_games for select using (true);

-- Grants — this project's posture is "auto-expose new tables OFF": new
-- tables get NO grants by default, not even service_role. Explicit, same
-- pattern as every other public-read table in schema.sql's Grants section.
grant select on public.pool_games to anon, authenticated;
grant all on public.pool_games to service_role;

create index if not exists idx_pool_games_division on public.pool_games(division_id);
