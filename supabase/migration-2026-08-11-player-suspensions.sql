-- Player suspensions: by tournament and/or date range. Director-managed.
-- Suspended players may remain on rosters but do not count toward requirements.

create table if not exists public.player_suspensions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  -- Null = not limited to one event (date-only or until lifted).
  tournament_id uuid references public.tournaments (id) on delete set null,
  -- Inclusive bounds in America/Denver league calendar. Either/both may be null.
  starts_on date,
  ends_on date,
  note text,
  -- Soft lift — row kept for history.
  lifted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_suspensions_dates_ok check (
    starts_on is null
    or ends_on is null
    or starts_on <= ends_on
  )
);

comment on table public.player_suspensions is
  'Director-entered player suspensions. Scope: tournament and/or date range; open-ended until lifted when both empty. Does not block waiver.';

comment on column public.player_suspensions.tournament_id is
  'When set, suspension applies only while evaluating this tournament.';

comment on column public.player_suspensions.note is
  'Why suspended — free text for the director (ejection, paperwork, etc.).';

create index if not exists idx_player_suspensions_player
  on public.player_suspensions (player_id)
  where lifted_at is null;

create index if not exists idx_player_suspensions_tournament
  on public.player_suspensions (tournament_id)
  where lifted_at is null and tournament_id is not null;

alter table public.player_suspensions enable row level security;

grant all on public.player_suspensions to service_role;
-- No anon/authenticated policies — service_role only (same as roster PII).
