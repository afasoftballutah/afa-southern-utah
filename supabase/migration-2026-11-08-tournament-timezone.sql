-- tournaments.timezone — the zone a tournament's games are played and shown in.
--
-- The league is Mountain Time, so every page renders in America/Denver
-- (lib/zone.js LEAGUE_TZ). The 2026 AFA World Series is in Mesquite, NV —
-- Pacific. With this set, that tournament's game times render in its own
-- zone and carry the zone's short name ("2 PM PST"), director time pickers
-- read and write in it, and the calendar export (UTC instants) is unchanged.
--
-- IANA name ('America/Los_Angeles'). Nullable, additive: null = league time,
-- so every existing tournament renders exactly as before.

alter table public.tournaments
  add column if not exists timezone text;

comment on column public.tournaments.timezone is
  'IANA time zone for this tournament''s games (e.g. America/Los_Angeles). Null = league time (America/Denver). Labelled with the zone''s short name wherever times show.';

-- Rollback: alter table public.tournaments drop column if exists timezone;
