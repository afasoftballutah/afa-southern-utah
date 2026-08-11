-- Gender on a roster line: manager enters M/F when adding a player;
-- the player confirms/edits at waiver signing. Canonical player.gender
-- is still the directory field; this is the per-team snapshot.

alter table public.roster_members
  add column if not exists gender text
  check (gender is null or gender in ('M', 'F'));

comment on column public.roster_members.gender is
  'M or F as entered by the manager (or confirmed by the player at signing). Person gender for coed checks; players.gender is the directory value.';

-- Backfill from linked player rows when known.
update public.roster_members m
set gender = p.gender
from public.players p
where m.player_id = p.id
  and m.gender is null
  and p.gender in ('M', 'F');
