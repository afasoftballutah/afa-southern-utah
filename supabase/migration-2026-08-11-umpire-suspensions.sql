-- Umpire suspensions: by tournament and/or date range. Director-managed.
-- Suspended umpires stay on the roster and may still be assigned (flagged).

create table if not exists public.umpire_suspensions (
  id uuid primary key default gen_random_uuid(),
  umpire_id uuid not null references public.umpires (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete set null,
  starts_on date,
  ends_on date,
  note text,
  lifted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umpire_suspensions_dates_ok check (
    starts_on is null
    or ends_on is null
    or starts_on <= ends_on
  )
);

comment on table public.umpire_suspensions is
  'Director-entered umpire suspensions. Scope: tournament and/or date range; open-ended until lifted when both empty.';

comment on column public.umpire_suspensions.note is
  'Why suspended — free text for the director.';

create index if not exists idx_umpire_suspensions_umpire
  on public.umpire_suspensions (umpire_id)
  where lifted_at is null;

create index if not exists idx_umpire_suspensions_tournament
  on public.umpire_suspensions (tournament_id)
  where lifted_at is null and tournament_id is not null;

alter table public.umpire_suspensions enable row level security;

grant all on public.umpire_suspensions to service_role;
