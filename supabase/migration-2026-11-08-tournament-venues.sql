-- tournaments.venues — a tournament played at more than one park.
--
-- venue_name / venue_address hold one place. The 2026 AFA World Series plays
-- Men's D at Hunter Park and Pioneer Park in Mesquite, and games.field
-- carries which one ("Hunter F1", "Pioneer F3"). This lists the parks so
-- the tournament page can link each to a map and the calendar export can
-- put the right address on each game.
--
-- [{ "name": "Hunter Park", "address": "500 E Mesquite Blvd, Mesquite, NV 89027",
--    "field_prefix": "Hunter", "map_url": "https://www.google.com/maps/search/?api=1&query=..." }]
--
-- field_prefix is how a games.field names the park. Nullable, additive:
-- null keeps the single venue_name / venue_address behaviour everywhere.
-- Public like the rest of the tournaments row (addresses of public parks).

alter table public.tournaments
  add column if not exists venues jsonb;

comment on column public.tournaments.venues is
  'Parks for a multi-venue tournament: [{name, address, field_prefix, map_url}]. games.field starts with field_prefix (e.g. "Hunter F1"). Null = use venue_name/venue_address.';

-- Rollback: alter table public.tournaments drop column if exists venues;
