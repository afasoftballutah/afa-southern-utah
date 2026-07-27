-- How many men and women a coed division requires.
--
-- JD, 2026-07-27: "a CoEd tournament, when being set up, should say how many
-- men and women. 5 and 5 should be default for Coed (sometimes it will be 7/3
-- or 6/4) for now but should be able to be changed. then the rosters should
-- check against these numbers (more than the required is fine, but less than
-- is a flag that a team cant compete)."
--
-- On the DIVISION, not the tournament: one event can run Men's, Women's and
-- Coed side by side, and only the coed one has a split to meet.
--
-- These are MINIMUMS on the roster, not a lineup rule. A team with 7 men and
-- 5 women clears a 5/5 division — more than required is fine. Fewer is a flag,
-- and it is a flag rather than a block because a director may know something
-- the roster does not say.
alter table public.divisions
  add column if not exists min_men integer check (min_men is null or min_men >= 0),
  add column if not exists min_women integer check (min_women is null or min_women >= 0);

comment on column public.divisions.min_men is
  'Minimum men on a roster for this division. Null means no requirement. Coed divisions default to 5. More than the minimum is fine; fewer is flagged, never blocked.';
comment on column public.divisions.min_women is
  'Minimum women on a roster for this division. Null means no requirement. Coed divisions default to 5.';

-- Every coed division on file starts at 5 and 5, which is the league's normal
-- split. A director changes the ones that are 7/3 or 6/4.
update public.divisions
   set min_men = coalesce(min_men, 5),
       min_women = coalesce(min_women, 5)
 where gender = 'coed';
