-- Where a team finished, alongside the fact that they are finished (JD,
-- 2026-07-26: "can you show their bracket and placement as they are
-- eliminated as well? [Gold - 9th Place]").
--
-- Not computed. The league's bracket drawing prints the placement itself
-- — a small tinted cell reading "9th" beside the team's name — so the
-- hourly sync reads it off the same page it reads the scores off. Working
-- it out ourselves would mean re-deriving double-elimination finish order
-- from the game graph, and disagreeing with the league's own sheet about
-- what place someone came is worse than not saying.
alter table public.team_status
  add column if not exists bracket_name text,
  add column if not exists placement text;

comment on column public.team_status.bracket_name is
  'Division the team finished in ("Gold"), from the bracket page the placement was read off.';
comment on column public.team_status.placement is
  'The league''s own finish label, verbatim ("9th"). Null when their bracket has not printed one yet.';
