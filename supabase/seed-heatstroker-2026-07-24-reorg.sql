-- Heatstroker re-seed: upstream league reorganization, 2026-07-24 evening
-- (dispatch-brief-13). QuickScores reorganized the "Coed E Heatstroker"
-- league TODAY, after the earlier scrape (dispatch-brief-7 /
-- seed-heatstroker-pools.sql). The old "Coed Uppers" league (LeagueID
-- 1730210) no longer exists (404) — its 5 teams (Apex, MMT, New Era,
-- Backwards K, Speed Demons) are now folded into the main league's pools
-- B/C/D/E. The truth is now ONE league, 28 teams, NINE pools A-I, source:
-- https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1728825
--
-- Fetched with plain curl (not WebFetch, which has produced fabricated
-- dates in this project before) and parsed by hand from the raw HTML.
-- Team names verbatim, no title-casing, no cleanup.
--
-- DISCREPANCIES vs the brief's expected shape, reported per the brief's
-- own instruction to trust the page over the brief:
--  1. Pool schedule count: a naive regex keyed on `class="event"` finds
--     only 27 of the 28 pool games. The 28th (Pool H: Glove Workz vs GWZ,
--     Sat 12:00 AM, Field 1) is tagged `class="event NewDay"` — QuickScores
--     adds that extra class to the first game of a new calendar day. A
--     scraper matching the class attribute literally (as opposed to
--     "starts with event") silently drops it. Caught here by cross-
--     checking the Pool H team list (3 teams => 3 games expected) against
--     the schedule count (2 games found) before trusting the parse. Real
--     total: 28 pool games, matching pools A-H at 3 teams/3 games each and
--     pool I at 4 teams/4 games (round-robin is NOT played out fully for
--     the 4-team pool — only 4 of the 6 possible pairings are scheduled;
--     transcribed as printed, not filled in).
--  2. Bracket "Winner of Game N" feed text: the brief assumed every
--     unresolved bracket slot prints literal text ("Winner of Game 5" or
--     "Loser of Game 4"). The live page only prints the LOSER-feed text
--     literally; WINNER-feed slots are rendered blank (span with no text)
--     and rely on the visual bracket-tree lines (nested table rowspans) to
--     show the connection instead of words. Since the brief's own
--     non-negotiable forbids leaving these null, "Winner of Game N" was
--     reconstructed from the table's own rowspan/nesting geometry (which
--     game's cell row-range contains the blank slot's row, one branch
--     back) — a mechanical read of the page's structure, not a guess about
--     who wins. Cross-checked two ways: (a) every reference points only to
--     a strictly earlier game number, consistent with the printed game
--     order/times; (b) Gold and Bronze are both 9-seed brackets and
--     produced BYTE-IDENTICAL feed patterns from independent parses (only
--     the seed labels, dates/fields differ) — strong evidence the
--     structural read is right, since QuickScores draws both from the same
--     9-team template.
--  3. Game counts matched the brief's expectation exactly once the above
--     was fixed: Gold 17, Silver 19, Bronze 17 (9 + 10 + 9 = 28 entrants).
--
-- Times: QuickScores renders bare wall-clock local time (America/Denver,
-- UTC-6 in July / MDT). Converted here to absolute UTC instants (+6h),
-- same convention as the existing seed-heatstroker-pools.sql.
--
-- Field text: pool_games.field follows the existing "Field N" convention
-- already in the table (matches seed-heatstroker-pools.sql and how the
-- schedule page groups/sorts by field text) — NOT the page's fuller
-- "Canyon Complex Field #N" label. games.field for the bracket rows uses
-- the fuller "Canyon Complex Field #N" text AS PRINTED on the bracket
-- table, per the brief's explicit instruction for Task 2 ("field... as
-- printed") — this is a deliberate difference between the two tables in
-- this one file, not an inconsistency.

-- ============================================================
-- TASK 1 — Re-seed pool play
-- ============================================================

-- 1. Delete existing pool_games for BOTH Coed E and Coed Uppers.
delete from public.pool_games
where division_id in (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name in ('Coed E', 'Coed Uppers')
);

-- 2. Delete the Coed Uppers division row. Checked before deleting: zero
-- rows in registrations, placements, games, and brackets reference it
-- (verified via Management API query against gbwusopifbyhlcppbfnl,
-- 2026-07-24) — only pool_games referenced it, and those are gone as of
-- step 1. Cascade is safe.
delete from public.divisions
where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
  and name = 'Coed Uppers';

-- 3. The real pool schedule, 28 games, scraped verbatim from the live page.
insert into public.pool_games (division_id, pool, scheduled_time, field, team1_name, team2_name)
select d.id, v.pool, v.scheduled_time::timestamptz, v.field, v.team1_name, v.team2_name
from (values
  ('A', '2026-07-25 03:00:00+00', 'Field 1', 'New Era', 'Say We Won''t'),
  ('B', '2026-07-25 03:00:00+00', 'Field 2', 'Apex', 'Bad Pitches'),
  ('C', '2026-07-25 03:00:00+00', 'Field 3', 'MMT', 'Outfield Matters'),
  ('D', '2026-07-25 03:00:00+00', 'Field 4', 'Backwards K', 'Only Bangers'),
  ('E', '2026-07-25 03:00:00+00', 'Field 5', 'Speed Demons', 'Misfits'),
  ('F', '2026-07-25 03:00:00+00', 'Field 6', 'Fallen', 'Not TOO DEEP'),
  ('G', '2026-07-25 03:00:00+00', 'Field 7', 'Empire', 'Ball Busters'),
  ('A', '2026-07-25 04:00:00+00', 'Field 1', 'New Era', 'Band of Randoms'),
  ('B', '2026-07-25 04:00:00+00', 'Field 2', 'Apex', 'The Pliggas'),
  ('C', '2026-07-25 04:00:00+00', 'Field 3', 'MMT', 'Fallen Angels'),
  ('D', '2026-07-25 04:00:00+00', 'Field 4', 'Backwards K', 'Scared Hitless'),
  ('E', '2026-07-25 04:00:00+00', 'Field 5', 'Speed Demons', 'J.E.T.S.'),
  ('F', '2026-07-25 04:00:00+00', 'Field 6', 'Fallen', 'JKL'),
  ('G', '2026-07-25 04:00:00+00', 'Field 7', 'Empire', 'Unstable Legends'),
  ('A', '2026-07-25 05:00:00+00', 'Field 1', 'Say We Won''t', 'Band of Randoms'),
  ('B', '2026-07-25 05:00:00+00', 'Field 2', 'Bad Pitches', 'The Pliggas'),
  ('C', '2026-07-25 05:00:00+00', 'Field 3', 'Outfield Matters', 'Fallen Angels'),
  ('D', '2026-07-25 05:00:00+00', 'Field 4', 'Only Bangers', 'Scared Hitless'),
  ('E', '2026-07-25 05:00:00+00', 'Field 5', 'Misfits', 'J.E.T.S.'),
  ('F', '2026-07-25 05:00:00+00', 'Field 6', 'Not TOO DEEP', 'JKL'),
  ('G', '2026-07-25 05:00:00+00', 'Field 7', 'Ball Busters', 'Unstable Legends'),
  ('H', '2026-07-25 06:00:00+00', 'Field 1', 'Glove Workz', 'GWZ'),
  ('I', '2026-07-25 06:00:00+00', 'Field 2', 'Del Fuegos', 'Off Constantly'),
  ('I', '2026-07-25 06:00:00+00', 'Field 3', 'Swingers Club', 'Foul Play'),
  ('H', '2026-07-25 07:00:00+00', 'Field 1', 'Glove Workz', 'Fat Head Todd'),
  ('I', '2026-07-25 07:00:00+00', 'Field 2', 'Del Fuegos', 'Swingers Club'),
  ('I', '2026-07-25 07:00:00+00', 'Field 3', 'Off Constantly', 'Foul Play'),
  ('H', '2026-07-25 08:00:00+00', 'Field 1', 'GWZ', 'Fat Head Todd')
) as v(pool, scheduled_time, field, team1_name, team2_name)
cross join (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name = 'Coed E'
) as d;

-- ============================================================
-- TASK 2 — Transcribe the Gold, Silver and Bronze brackets
-- ============================================================

-- Bronze division doesn't exist yet — create it as a child of Coed E,
-- same pattern as Gold/Silver.
insert into public.divisions (tournament_id, name, display_name, sort_order, day_label, day_date, parent_division_id)
select t.id, 'Bronze', 'Bronze', 45, 'Sat–Sun', null, p.id
from public.tournaments t
join public.divisions p on p.tournament_id = t.id and p.name = 'Coed E'
where t.slug = '2026-coed-heat-stroker'
on conflict (tournament_id, name) do nothing;

-- Gold: games 1-17, entries the 9 pool winners [A #1]...[I #1].
insert into public.games (division_id, bracket_side, round, slot, team1_name, team2_name, scheduled_time, field, is_bye)
select d.id, 'winners', v.round, v.slot, v.team1_name, v.team2_name, v.scheduled_time::timestamptz, v.field, false
from (values
  (1, 1, '[F #1]', '[G #1]', '2026-07-25 06:00:00+00', 'Canyon Complex Field #4'),
  (2, 2, '[I #1]', '[E #1]', '2026-07-26 03:00:00+00', 'Canyon Complex Field #5'),
  (3, 3, '[B #1]', '[D #1]', '2026-07-25 07:00:00+00', 'Canyon Complex Field #4'),
  (4, 4, '[C #1]', '[H #1]', '2026-07-26 03:00:00+00', 'Canyon Complex Field #4'),
  (5, 5, '[A #1]', 'Winner of Game 1', '2026-07-26 04:00:00+00', 'Canyon Complex Field #4'),
  (6, 6, 'Loser of Game 4', 'Loser of Game 1', '2026-07-26 04:00:00+00', 'Canyon Complex Field #5'),
  (7, 7, 'Winner of Game 5', 'Winner of Game 2', '2026-07-26 06:00:00+00', 'Canyon Complex Field #5'),
  (8, 8, 'Winner of Game 3', 'Winner of Game 4', '2026-07-26 06:00:00+00', 'Canyon Complex Field #4'),
  (9, 9, 'Winner of Game 6', 'Loser of Game 3', '2026-07-26 05:00:00+00', 'Canyon Complex Field #5'),
  (10, 10, 'Loser of Game 2', 'Loser of Game 5', '2026-07-26 05:00:00+00', 'Canyon Complex Field #4'),
  (11, 11, 'Loser of Game 7', 'Winner of Game 9', '2026-07-26 07:00:00+00', 'Canyon Complex Field #5'),
  (12, 12, 'Loser of Game 8', 'Winner of Game 10', '2026-07-26 07:00:00+00', 'Canyon Complex Field #4'),
  (13, 13, 'Winner of Game 7', 'Winner of Game 8', '2026-07-26 08:00:00+00', 'Canyon Complex Field #4'),
  (14, 14, 'Winner of Game 11', 'Winner of Game 12', '2026-07-26 08:00:00+00', 'Canyon Complex Field #5'),
  (15, 15, 'Loser of Game 13', 'Winner of Game 14', '2026-07-26 09:00:00+00', 'Canyon Complex Field #4'),
  (16, 16, 'Winner of Game 13', 'Winner of Game 15', '2026-07-26 10:00:00+00', 'Canyon Complex Field #4'),
  (17, 17, 'Winner of Game 16', 'Loser of Game 16', '2026-07-26 11:00:00+00', 'Canyon Complex Field #4')
) as v(round, slot, team1_name, team2_name, scheduled_time, field)
cross join (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name = 'Gold' and parent_division_id is not null
) as d;

-- Silver: games 1-19, entries [A #2]...[I #2] plus [I #3] (10 seeds).
insert into public.games (division_id, bracket_side, round, slot, team1_name, team2_name, scheduled_time, field, is_bye)
select d.id, 'winners', v.round, v.slot, v.team1_name, v.team2_name, v.scheduled_time::timestamptz, v.field, false
from (values
  (1, 1, '[D #2]', '[E #2]', '2026-07-25 06:00:00+00', 'Canyon Complex Field #5'),
  (2, 2, '[G #2]', '[F #2]', '2026-07-25 06:00:00+00', 'Canyon Complex Field #6'),
  (3, 3, '[H #2]', '[I #3]', '2026-07-26 03:00:00+00', 'Canyon Complex Field #3'),
  (4, 4, '[C #2]', '[B #2]', '2026-07-25 07:00:00+00', 'Canyon Complex Field #5'),
  (5, 5, '[A #2]', 'Winner of Game 1', '2026-07-26 03:00:00+00', 'Canyon Complex Field #2'),
  (6, 6, '[I #2]', 'Winner of Game 2', '2026-07-26 03:00:00+00', 'Canyon Complex Field #1'),
  (7, 7, 'Loser of Game 4', 'Loser of Game 1', '2026-07-26 04:00:00+00', 'Canyon Complex Field #2'),
  (8, 8, 'Loser of Game 3', 'Loser of Game 2', '2026-07-26 04:00:00+00', 'Canyon Complex Field #1'),
  (9, 9, 'Winner of Game 5', 'Winner of Game 3', '2026-07-26 06:00:00+00', 'Canyon Complex Field #2'),
  (10, 10, 'Winner of Game 6', 'Winner of Game 4', '2026-07-26 06:00:00+00', 'Canyon Complex Field #1'),
  (11, 11, 'Winner of Game 7', 'Loser of Game 6', '2026-07-26 05:00:00+00', 'Canyon Complex Field #2'),
  (12, 12, 'Winner of Game 8', 'Loser of Game 5', '2026-07-26 05:00:00+00', 'Canyon Complex Field #1'),
  (13, 13, 'Loser of Game 9', 'Winner of Game 11', '2026-07-26 07:00:00+00', 'Canyon Complex Field #2'),
  (14, 14, 'Loser of Game 10', 'Winner of Game 12', '2026-07-26 07:00:00+00', 'Canyon Complex Field #1'),
  (15, 15, 'Winner of Game 9', 'Winner of Game 10', '2026-07-26 08:00:00+00', 'Canyon Complex Field #1'),
  (16, 16, 'Winner of Game 13', 'Winner of Game 14', '2026-07-26 08:00:00+00', 'Canyon Complex Field #2'),
  (17, 17, 'Loser of Game 15', 'Winner of Game 16', '2026-07-26 09:00:00+00', 'Canyon Complex Field #1'),
  (18, 18, 'Winner of Game 15', 'Winner of Game 17', '2026-07-26 10:00:00+00', 'Canyon Complex Field #1'),
  (19, 19, 'Winner of Game 18', 'Loser of Game 18', '2026-07-26 11:00:00+00', 'Canyon Complex Field #1')
) as v(round, slot, team1_name, team2_name, scheduled_time, field)
cross join (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name = 'Silver' and parent_division_id is not null
) as d;

-- Bronze: games 1-17, entries [A #3]...[H #3] plus [I #4] (9 seeds).
insert into public.games (division_id, bracket_side, round, slot, team1_name, team2_name, scheduled_time, field, is_bye)
select d.id, 'winners', v.round, v.slot, v.team1_name, v.team2_name, v.scheduled_time::timestamptz, v.field, false
from (values
  (1, 1, '[F #3]', '[G #3]', '2026-07-25 06:00:00+00', 'Canyon Complex Field #7'),
  (2, 2, '[D #3]', '[H #3]', '2026-07-26 03:00:00+00', 'Canyon Complex Field #7'),
  (3, 3, '[B #3]', '[E #3]', '2026-07-25 07:00:00+00', 'Canyon Complex Field #7'),
  (4, 4, '[C #3]', '[I #4]', '2026-07-26 03:00:00+00', 'Canyon Complex Field #6'),
  (5, 5, '[A #3]', 'Winner of Game 1', '2026-07-26 04:00:00+00', 'Canyon Complex Field #6'),
  (6, 6, 'Loser of Game 4', 'Loser of Game 1', '2026-07-26 04:00:00+00', 'Canyon Complex Field #7'),
  (7, 7, 'Winner of Game 5', 'Winner of Game 2', '2026-07-26 06:00:00+00', 'Canyon Complex Field #7'),
  (8, 8, 'Winner of Game 3', 'Winner of Game 4', '2026-07-26 06:00:00+00', 'Canyon Complex Field #6'),
  (9, 9, 'Winner of Game 6', 'Loser of Game 3', '2026-07-26 05:00:00+00', 'Canyon Complex Field #7'),
  (10, 10, 'Loser of Game 2', 'Loser of Game 5', '2026-07-26 05:00:00+00', 'Canyon Complex Field #6'),
  (11, 11, 'Loser of Game 7', 'Winner of Game 9', '2026-07-26 07:00:00+00', 'Canyon Complex Field #7'),
  (12, 12, 'Loser of Game 8', 'Winner of Game 10', '2026-07-26 07:00:00+00', 'Canyon Complex Field #6'),
  (13, 13, 'Winner of Game 7', 'Winner of Game 8', '2026-07-26 08:00:00+00', 'Canyon Complex Field #3'),
  (14, 14, 'Winner of Game 11', 'Winner of Game 12', '2026-07-26 08:00:00+00', 'Canyon Complex Field #6'),
  (15, 15, 'Loser of Game 13', 'Winner of Game 14', '2026-07-26 09:00:00+00', 'Canyon Complex Field #3'),
  (16, 16, 'Winner of Game 13', 'Winner of Game 15', '2026-07-26 10:00:00+00', 'Canyon Complex Field #3'),
  (17, 17, 'Winner of Game 16', 'Loser of Game 16', '2026-07-26 11:00:00+00', 'Canyon Complex Field #3')
) as v(round, slot, team1_name, team2_name, scheduled_time, field)
cross join (
  select id from public.divisions
  where tournament_id = (select id from public.tournaments where slug = '2026-coed-heat-stroker')
    and name = 'Bronze' and parent_division_id is not null
) as d;

-- Deliberately NO rows in public.brackets for Gold, Silver, or Bronze.
-- This is what keeps BracketTree from trying to draw a tree it can't lay
-- out (the division page only renders the tree when a `brackets` row
-- exists for that division) — this transcription is not wired to the
-- bracket engine. That is a separate, later job.
