-- Daily first-pitch / field-open time for a tournament (same each calendar day).
-- Scheduler note: one shared clock for the whole event — all divisions play in
-- parallel on the same fields/times; do not schedule each division as an
-- isolated timeline.

alter table public.tournaments
  add column if not exists day_start_time time;

comment on column public.tournaments.day_start_time is
  'League-local wall-clock time games begin each day of this tournament (e.g. 08:00). Shared across all divisions for scheduling.';

-- Umpire availability as a time window (not free text).
alter table public.tournament_umpires
  add column if not exists available_from time,
  add column if not exists available_until time;

comment on column public.tournament_umpires.available_from is
  'Earliest time this umpire can work each day (league-local). Defaults to tournaments.day_start_time when added.';

comment on column public.tournament_umpires.available_until is
  'Latest time this umpire can work each day (league-local). Null = open-ended / not set.';

-- Preserve any free-text availability already entered into notes if notes empty.
update public.tournament_umpires
set notes = availability
where notes is null
  and availability is not null
  and btrim(availability) <> '';

comment on column public.tournament_umpires.availability is
  'Legacy free-text availability. Prefer available_from / available_until; kept for history.';
