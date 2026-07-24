-- Additive migration: divisions.day_label
-- Task: the lobby redesign (dispatch-brief-4) makes the group card the one
-- home for "what day does this group play" — director-entered text,
-- rendered verbatim (no date parsing/formatting). Nullable, additive only —
-- no existing column touched.
alter table public.divisions add column if not exists day_label text;
comment on column public.divisions.day_label is 'Director-entered day text (e.g. "Sat, Aug 22"), rendered verbatim on the group card. Nullable — most divisions have none yet.';

-- Seed: "Do It for the T-Shirts" (slug 2026-t-shirt-tournament). Men's and
-- Women's play Saturday; Coed plays Sunday — previously stated only as
-- prose in tournaments.notes, now the group card's own fact.
update public.divisions d
set day_label = 'Sat, Aug 22'
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name in ('Men''s', 'Women''s');

update public.divisions d
set day_label = 'Sun, Aug 23'
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name = 'Coed';

-- The two day sentences move from notes prose to the grid above; notes
-- keeps only what has no other home.
update public.tournaments
set notes = 'Open division runs if enough teams enter. $10/game ump fees. 6-team minimum per division. No combining divisions. No equalizers.'
where slug = '2026-t-shirt-tournament';
