-- Whether a team still has a game coming (JD, 2026-07-26: "if there is no
-- next game for a team, can you mark them as [eliminated]? want to be
-- informative but gentle" — "that should be part of the cron").
--
-- Computed, not entered: the hourly results sync works it out from the
-- games themselves and writes it here, so the public page can answer
-- "are we still in this?" without re-deriving it on every render.
--
-- Only two states are ever stored, and only when they are CERTAIN. A team
-- between games has no row at all — absence means "still playing", which
-- is both the common case and the safe default. See the sync route for
-- the exact rule; the short version is that a team is out when it lost a
-- bracket game, has nothing scheduled, and no unfilled slot downstream
-- could still be theirs.
create table if not exists public.team_status (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_name text not null,
  state text not null check (state in ('eliminated', 'champion')),
  last_game_label text,                -- "Bronze Game 5" — where it ended
  last_game_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tournament_id, team_name)
);

comment on table public.team_status is
  'Derived by the hourly QuickScores sync, never entered by hand. A team with no row still has a game coming — absence is the safe default. Public read, no PII.';

-- This project auto-exposes NOTHING: a new table gets no grants at all
-- until they are written out here (see the grants map in schema.sql).
alter table public.team_status enable row level security;
drop policy if exists "public read team_status" on public.team_status;
create policy "public read team_status" on public.team_status for select using (true);
grant select on public.team_status to anon, authenticated;
grant all on public.team_status to service_role;
