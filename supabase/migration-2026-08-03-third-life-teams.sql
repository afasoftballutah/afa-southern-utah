-- Teams that earned a 3GG third life (went 0–2 in the main bracket).
-- Used to offer a Super Final path vs the main champion if they win consolation.

alter table public.divisions
  add column if not exists third_life_teams text[] not null default '{}';

comment on column public.divisions.third_life_teams is
  'Team names that went 0–2 in main (3GG hybrid) and keep a title path via consolation → Super Final.';
