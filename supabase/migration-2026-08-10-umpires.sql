-- Umpire roster (director) + assignment on games (scorekeeper + director).
-- PII stays service_role only; public pages never select this table.
-- Optional display names can be joined server-side for scorekeeper UI only.

create table if not exists public.umpires (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  card_number text,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  email text,
  -- Pitch type: F / S / B on the AFA batch form
  pitch_fast boolean not null default false,
  pitch_slow boolean not null default true,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.umpires is
  'Local umpire roster for the director. Not public. Matches AFA batch registration fields.';

create index if not exists idx_umpires_status on public.umpires(status);
create index if not exists idx_umpires_name on public.umpires(last_name, first_name);

alter table public.umpires enable row level security;
-- No anon policies — service_role only (same pattern as registrations).
grant all on public.umpires to service_role;

-- Bracket games
alter table public.games
  add column if not exists umpire1_id uuid references public.umpires(id) on delete set null,
  add column if not exists umpire2_id uuid references public.umpires(id) on delete set null;

-- Pool games
alter table public.pool_games
  add column if not exists umpire1_id uuid references public.umpires(id) on delete set null,
  add column if not exists umpire2_id uuid references public.umpires(id) on delete set null;

comment on column public.games.umpire1_id is 'Primary / plate umpire for this bracket game.';
comment on column public.games.umpire2_id is 'Optional second umpire.';
comment on column public.pool_games.umpire1_id is 'Primary umpire for this pool game.';
comment on column public.pool_games.umpire2_id is 'Optional second umpire.';

create index if not exists idx_games_umpire1 on public.games(umpire1_id);
create index if not exists idx_pool_games_umpire1 on public.pool_games(umpire1_id);
