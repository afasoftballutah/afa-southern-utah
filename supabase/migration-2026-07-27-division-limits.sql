-- How many teams a division holds, and how many people a roster needs.
--
-- JD, 2026-07-27: "Mens and Womens both require 10 of that gender. Team
-- should show X/max, if there is no max, then show the number needed or the
-- total number signed up as max, whichever is greater."
--
-- So a division carries two limits it did not before:
--   max_teams   the bracket size. Null means nobody has capped it, and the
--               UI falls back to whichever is larger — the minimum needed to
--               run, or the number already signed up. A division never
--               displays a max smaller than the teams in it.
--   min_teams   how many it takes to run at all. The league writes "Six-team
--               minimum per division" in its notes today; this makes it a
--               number something can check.
alter table public.divisions
  add column if not exists max_teams integer check (max_teams is null or max_teams > 0),
  add column if not exists min_teams integer check (min_teams is null or min_teams > 0);

comment on column public.divisions.max_teams is
  'Bracket size. Null means uncapped — the UI shows max(min_teams, teams signed up) instead, so the denominator is never smaller than the numerator.';
comment on column public.divisions.min_teams is
  'Teams needed to run the division at all. Six is the league default.';

update public.divisions set min_teams = coalesce(min_teams, 6);

-- Roster minimums by gender. Coed already carries 5/5; Men's and Women's need
-- ten of their own and none of the other.
update public.divisions
   set min_men = 10, min_women = 0
 where gender = 'mens' and min_men is null;

update public.divisions
   set min_women = 10, min_men = 0
 where gender = 'womens' and min_women is null;
