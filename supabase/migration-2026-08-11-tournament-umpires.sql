-- Umpires assigned to a tournament with availability notes (director-managed).
-- Not public self-signup — director adds people from the local umpire roster.

create table if not exists public.tournament_umpires (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  umpire_id uuid not null references public.umpires (id) on delete cascade,
  -- available | limited | unavailable
  status text not null default 'available'
    check (status in ('available', 'limited', 'unavailable')),
  -- Free text: "Sat all day", "Sun after 2pm", "both days plate only", etc.
  availability text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, umpire_id)
);

comment on table public.tournament_umpires is
  'Director-managed crew for one tournament: who is on the list and when they are available.';

comment on column public.tournament_umpires.availability is
  'Human-readable availability for this event (days, times, constraints).';

comment on column public.tournament_umpires.status is
  'available = good to schedule; limited = partial; unavailable = listed but not working.';

create index if not exists idx_tournament_umpires_tournament
  on public.tournament_umpires (tournament_id);

create index if not exists idx_tournament_umpires_umpire
  on public.tournament_umpires (umpire_id);

alter table public.tournament_umpires enable row level security;

grant all on public.tournament_umpires to service_role;
