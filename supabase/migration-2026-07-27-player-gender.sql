-- A player has a gender. A team has a division.
--
-- JD, 2026-07-27: "'Players' should not have a division. Teams have a
-- division. Players have a gender."
--
-- The two were being conflated on the Players table, which showed "Coed" —
-- but Coed is a property of the TEAM a person happened to play for that
-- weekend. The same person can play Men's in June and Coed in August, so
-- division was never theirs to carry. Gender is.
--
-- Deliberately M/F and not the divisions vocabulary (mens/womens/coed), so
-- the two ladders stay visibly distinct in code and in the UI. A coed roster
-- is a mix of these; a Men's division is a team of one.
alter table public.players
  add column if not exists gender text
  check (gender is null or gender in ('M', 'F'));

comment on column public.players.gender is
  'M or F, or null when not recorded. A PERSON''s gender. Not to be confused with divisions.gender (mens/womens/coed), which describes a team.';

create index if not exists idx_players_gender on public.players (gender);
