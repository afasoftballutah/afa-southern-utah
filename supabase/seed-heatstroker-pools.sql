-- Coed E Heatstroker — pool play data. Task: dispatch-brief-7, applied
-- 2026-07-23 the night before pool play (Fri 7/24). This is the audit
-- trail for the real schedule, scraped directly from QuickScores:
-- https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1728825
-- (league "Coed E Heatstroker", org sgcity). Team names verbatim, no
-- guesses — copied from the page's own Pool Play Standings table (the
-- authoritative team-name list; the schedule view prefixes each name with
-- its pool letter in brackets, e.g. "[A] Glove Workz" — that bracket
-- prefix is a QuickScores display label, not part of the registered name,
-- so it is stored in the `pool` column and stripped from team1_name/
-- team2_name).
--
-- DISCREPANCY vs dispatch brief's expected shape, reported per the
-- brief's own instruction to trust the page: the brief expected 24 teams.
-- The live page lists 23 teams across the six pools (A=4, B=4, C=3, D=4,
-- E=4, F=4 = 23) and 23 pool games — the 23-game total and the "C has 3
-- teams" detail both matched; only the 24-team figure did not. Verified by
-- counting distinct TeamIDs on the page's own standings table and cross-
-- checking against every team appearing in the schedule; no 24th team
-- exists anywhere on the page (no bye, no withdrawn-team note).
--
-- Times: QuickScores renders these as bare wall-clock local time (e.g.
-- datetime="2026-07-24T21:00" -> "9:00 PM", no UTC offset in the markup).
-- Southern Utah / St. George is America/Denver, which is UTC-6 (MDT) in
-- July. Converted here to the absolute UTC instant so `timestamptz`
-- storage is correct regardless of server timezone; the app renders it
-- back out in America/Denver (lib/bracket/tree.js LEAGUE_TZ) for display.

-- 1. Rename the Heatstroker's existing division (keeps day_label/day_date).
update public.divisions
set name = 'Coed E', display_name = 'Coed E'
where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
  and name = 'Coed';

-- 2. Two more divisions for Saturday's Gold/Silver brackets — empty tonight
-- (drawn/built by the director Saturday, using the existing bracket
-- engine). day_date left NULL; day_label is director-facing prose only.
insert into public.divisions (tournament_id, name, display_name, sort_order, day_label, day_date)
select id, 'Coed E — Gold', 'Coed E — Gold', 20, 'Sat–Mon', null
from public.tournaments where slug = '2026-coed-heat-stroker'
on conflict (tournament_id, name) do nothing;

insert into public.divisions (tournament_id, name, display_name, sort_order, day_label, day_date)
select id, 'Coed E — Silver', 'Coed E — Silver', 30, 'Sat–Mon', null
from public.tournaments where slug = '2026-coed-heat-stroker'
on conflict (tournament_id, name) do nothing;

-- 3. Fix the tournament end date (brackets run through Monday).
-- Coed E's day_label already reads 'Fri–Sat, Jul 24–25' (pool play days) —
-- untouched, correct as-is.
update public.tournaments
set end_date = '2026-07-27'
where slug = '2026-coed-heat-stroker';

-- 4. The real Friday-night pool schedule, 23 games, scraped verbatim.
insert into public.pool_games (division_id, pool, scheduled_time, field, team1_name, team2_name)
select d.id, v.pool, v.scheduled_time::timestamptz, v.field, v.team1_name, v.team2_name
from (values
  ('A', '2026-07-25 03:00:00+00', 'Field 1', 'Glove Workz', 'GWZ'),
  ('A', '2026-07-25 03:00:00+00', 'Field 2', 'J.E.T.S.', 'Empire'),
  ('A', '2026-07-25 04:00:00+00', 'Field 1', 'Glove Workz', 'J.E.T.S.'),
  ('A', '2026-07-25 04:00:00+00', 'Field 2', 'GWZ', 'Empire'),
  ('B', '2026-07-25 03:00:00+00', 'Field 6', 'Outfield Matters', 'Bad Pitches'),
  ('B', '2026-07-25 03:00:00+00', 'Field 7', 'Ball Busters', 'Only Bangers'),
  ('B', '2026-07-25 04:00:00+00', 'Field 6', 'Outfield Matters', 'Ball Busters'),
  ('B', '2026-07-25 04:00:00+00', 'Field 7', 'Bad Pitches', 'Only Bangers'),
  ('C', '2026-07-25 03:00:00+00', 'Field 3', 'Fallen', 'The Pliggas'),
  ('C', '2026-07-25 04:00:00+00', 'Field 3', 'Fallen', 'Fallen Angels'),
  ('C', '2026-07-25 05:00:00+00', 'Field 3', 'The Pliggas', 'Fallen Angels'),
  ('D', '2026-07-25 05:00:00+00', 'Field 1', 'Del Fuegos', 'Foul Play'),
  ('D', '2026-07-25 05:00:00+00', 'Field 2', 'JKL', 'Say We Won''t'),
  ('D', '2026-07-25 06:00:00+00', 'Field 1', 'Del Fuegos', 'JKL'),
  ('D', '2026-07-25 06:00:00+00', 'Field 2', 'Foul Play', 'Say We Won''t'),
  ('E', '2026-07-25 06:00:00+00', 'Field 3', 'Off Constantly', 'Band of Randoms'),
  ('E', '2026-07-25 06:00:00+00', 'Field 4', 'Unstable Legends', 'Swingers Club'),
  ('E', '2026-07-25 07:00:00+00', 'Field 3', 'Off Constantly', 'Unstable Legends'),
  ('E', '2026-07-25 07:00:00+00', 'Field 4', 'Band of Randoms', 'Swingers Club'),
  ('F', '2026-07-25 05:00:00+00', 'Field 6', 'Not TOO DEEP', 'Fat Head Todd'),
  ('F', '2026-07-25 05:00:00+00', 'Field 7', 'Scared Hitless', 'Misfits'),
  ('F', '2026-07-25 06:00:00+00', 'Field 6', 'Not TOO DEEP', 'Scared Hitless'),
  ('F', '2026-07-25 06:00:00+00', 'Field 7', 'Fat Head Todd', 'Misfits')
) as v(pool, scheduled_time, field, team1_name, team2_name)
cross join (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name = 'Coed E'
) as d;

-- ============================================================
-- AMENDMENT (mid-brief, JD via Design-Partner): a SECOND QuickScores
-- league runs the same weekend — "Coed Uppers Heatstroker", LeagueID
-- 1730210, same OrgDir sgcity. Its own division, own pool play, own
-- single bracket Saturday (existing engine) — no Gold/Silver split for
-- Uppers. Applied 2026-07-23, same night, after the amendment landed.
--
-- DISCREPANCIES vs the brief's expected shape for this league (page
-- trusted, per the brief's own instruction):
--  - Team count: brief said "Backwards K, Speed Demons" for Pool B (2
--    teams) and didn't give a Pool B game count assumption beyond the
--    combined "~4-5 pool games total" estimate. The live page's Pool B
--    schedule includes two additional <li> entries that are NOT games —
--    QuickScores lists a "Bye" placeholder row per team in a 2-team pool
--    (opponent name literally "Bye", no field/time). Excluded here; only
--    the one real Speed Demons vs Backwards K game is seeded. Real total:
--    4 pool games (Pool A: 3, full round robin of Apex/MMT/New Era —
--    matches brief exactly; Pool B: 1).
--  - Combined team total across both divisions: 23 (Coed E, see the
--    discrepancy note above this section) + 5 (Coed Uppers: Apex, MMT,
--    New Era, Backwards K, Speed Demons) = 28, not the 29 estimated in
--    the amendment.
-- ============================================================

-- Coed Uppers sits between Coed E (10) and the bracket divisions —
-- Gold/Silver move from 20/30 to 25/35 to make room at 15.
update public.divisions
set sort_order = 25
where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
  and name = 'Coed E — Gold';

update public.divisions
set sort_order = 35
where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
  and name = 'Coed E — Silver';

insert into public.divisions (tournament_id, name, display_name, sort_order, day_label, day_date)
select id, 'Coed Uppers', 'Coed Uppers', 15, 'Fri, Jul 24', '2026-07-24'
from public.tournaments where slug = '2026-coed-heat-stroker'
on conflict (tournament_id, name) do nothing;

-- The real Coed Uppers pool schedule, 4 games, scraped verbatim from
-- https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1730210
insert into public.pool_games (division_id, pool, scheduled_time, field, team1_name, team2_name)
select d.id, v.pool, v.scheduled_time::timestamptz, v.field, v.team1_name, v.team2_name
from (values
  ('A', '2026-07-25 03:00:00+00', 'Field 4', 'Apex', 'MMT'),
  ('A', '2026-07-25 04:00:00+00', 'Field 4', 'Apex', 'New Era'),
  ('A', '2026-07-25 05:00:00+00', 'Field 4', 'MMT', 'New Era'),
  ('B', '2026-07-25 05:00:00+00', 'Field 5', 'Speed Demons', 'Backwards K')
) as v(pool, scheduled_time, field, team1_name, team2_name)
cross join (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name = 'Coed Uppers'
) as d;
