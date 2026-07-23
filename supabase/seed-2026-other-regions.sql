-- Northern Utah + Tournament Series schedules — JD ruling 2026-07-23:
-- both belong on the site alongside Southern Utah (home base).
-- Source: two director-forwarded posters (session-data/afa/afa-visual-direction.md
-- in power-desktop for the full source list and image provenance).
-- Published-schedule-only for now: name, dates, venue, contact. No brackets,
-- no registration, no poster image (none supplied) — facts as plain text only,
-- per the site's existing "facts always duplicated as text" law.
-- No game_guarantee/divisions_offered/entry_fee given on either poster — left
-- null rather than guessed (no-guesses-in-formal-docs rule).
-- status is 'complete' if end_date is before 2026-07-23 (the day this was run),
-- 'upcoming' otherwise — same convention the Southern Utah seed uses.

alter table public.tournaments
  add column if not exists region text not null default 'southern_utah'
  check (region in ('southern_utah', 'northern_utah', 'series'));

-- ============================================================
-- Northern Utah AFA Events — 2026
-- ============================================================
insert into public.tournaments
  (slug, name, start_date, end_date, venue_name, region, is_placeholder, status, contacts)
values
  ('2026-glove-showdown', 'Glove Showdown', '2026-03-27', '2026-03-29', 'Lakeside Park, Orem, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-spring-swing', 'Spring Swing', '2026-04-17', '2026-04-19', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-best-in-the-west', 'Best in the West', '2026-04-25', '2026-04-26', 'Centennial Park, West Valley, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-cinco-de-mayo-nu', 'Cinco de Mayo', '2026-05-01', '2026-05-03', 'Wendover, NV', 'northern_utah', false, 'complete', '[]'),
  ('2026-smash-bash', 'Smash Bash', '2026-05-15', '2026-05-17', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-do-it-for-the-t-shirt', 'Do It for the T-Shirt', '2026-05-29', '2026-05-31', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-double-play', 'Double Play', '2026-06-05', '2026-06-07', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-turf-wars', 'Turf Wars', '2026-06-19', '2026-06-21', 'Lakeside Park, Orem, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-sander-memorial', 'Sander Memorial', '2026-06-27', '2026-06-28', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'complete', '[]'),
  ('2026-wendover-classic', 'Wendover Classic', '2026-07-24', '2026-07-26', 'Wendover, NV', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-bob-barker-family-night', 'Bob Barker, Family Night', '2026-08-07', '2026-08-09', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-heat-wave', 'Heat Wave', '2026-08-22', '2026-08-23', 'Centennial Park, West Valley, UT', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-hit-and-sit', 'Hit & Sit', '2026-09-11', '2026-09-13', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-fall-ball', 'Fall Ball', '2026-09-25', '2026-09-27', 'Weber County Fairgrounds, Ogden, UT', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-monster-mash', 'Monster Mash', '2026-10-02', '2026-10-04', 'Wendover, NV', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-all-for-the-kids', 'All for the Kids', '2026-10-16', '2026-10-18', 'Lakeside Park, Orem, UT', 'northern_utah', false, 'upcoming', '[]'),
  ('2026-trick-or-treat', 'Trick or Treat', '2026-10-30', '2026-11-01', 'Lakeside Park, Orem, UT', 'northern_utah', false, 'upcoming', '[]')
on conflict (slug) do nothing;

-- ============================================================
-- AFA Tournament Series — 2026 (traveling circuit: Delta CO / Montrose CO / Roosevelt UT)
-- Contact: Arron Cowin. $100 nonrefundable deposit per event (deposit_cents).
-- ============================================================
insert into public.tournaments
  (slug, name, start_date, end_date, venue_name, region, deposit_cents, is_placeholder, status, contacts)
values
  ('2026-series-delta-may', 'AFA Tournament Series — Delta', '2026-05-23', '2026-05-24', 'Delta, CO', 'series', 10000, false, 'complete', '[{"name":"Arron Cowin"}]'),
  ('2026-series-roosevelt-june', 'AFA Tournament Series — Roosevelt', '2026-06-05', '2026-06-07', 'Roosevelt, UT', 'series', 10000, false, 'complete', '[{"name":"Arron Cowin"}]'),
  ('2026-series-montrose-all-nighter', 'AFA Tournament Series — Montrose (All Nighter)', '2026-06-26', '2026-06-27', 'Montrose, CO', 'series', 10000, false, 'complete', '[{"name":"Arron Cowin"}]'),
  ('2026-series-montrose-august', 'AFA Tournament Series — Montrose', '2026-08-21', '2026-08-23', 'Montrose, CO', 'series', 10000, false, 'upcoming', '[{"name":"Arron Cowin"}]'),
  ('2026-series-delta-september', 'AFA Tournament Series — Delta', '2026-09-19', '2026-09-20', 'Delta, CO', 'series', 10000, false, 'upcoming', '[{"name":"Arron Cowin"}]'),
  ('2026-series-roosevelt-october', 'AFA Tournament Series — Roosevelt', '2026-10-02', '2026-10-04', 'Roosevelt, UT', 'series', 10000, false, 'upcoming', '[{"name":"Arron Cowin"}]')
on conflict (slug) do nothing;
