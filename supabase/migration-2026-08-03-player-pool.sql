-- Tournament free-agent pool: players released when a team drops or a
-- manager cuts them back into the pool for other teams in that event.

create table if not exists public.tournament_player_pool (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  -- Gender of the division they left (mens/womens/coed). Claim only into
  -- a registration with the same division gender.
  division_gender text check (division_gender in ('mens', 'womens', 'coed')),
  player_id uuid references public.players(id) on delete set null,
  name text not null,
  birth_date date,
  source_registration_id uuid references public.registrations(id) on delete set null,
  source_member_id uuid references public.roster_members(id) on delete set null,
  released_at timestamptz not null default now(),
  claimed_registration_id uuid references public.registrations(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.tournament_player_pool is
  'Players available to claim onto another team in the same tournament (and same gender bracket). Service_role only.';

create index if not exists idx_pool_open
  on public.tournament_player_pool (tournament_id, division_gender)
  where claimed_at is null;

create index if not exists idx_pool_player
  on public.tournament_player_pool (player_id)
  where claimed_at is null;

alter table public.tournament_player_pool enable row level security;
grant all on public.tournament_player_pool to service_role;
