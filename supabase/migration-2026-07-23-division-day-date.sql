-- Additive migration: divisions.day_date
-- Task: dispatch-brief-5. day_label (added dispatch-brief-4) is
-- director-entered display text, rendered verbatim. day_date is the real
-- date behind it — machine truth the calendar route and per-event .ics
-- links key off. Nullable, additive only — no existing column touched.
alter table public.divisions add column if not exists day_date date;
comment on column public.divisions.day_date is 'The real date behind day_label — machine truth for per-event calendar links/splitting. Nullable — most divisions have none yet; day_label is display, day_date is the date to compute from.';

-- Seed: "T-Shirt Tournament" (slug 2026-t-shirt-tournament). Men's and
-- Women's play Saturday 8/22; Coed plays Sunday 8/23 — matching the
-- day_label prose already on these rows.
update public.divisions d
set day_date = '2026-08-22'
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name in ('Men''s', 'Women''s');

update public.divisions d
set day_date = '2026-08-23'
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name = 'Coed';

-- Group order ruling (JD, 2026-07-23): Women's, Men's, Coed on the grid.
-- sort_order 10/20/30 replaces the old 0/1/2 seed values on these three
-- rows only.
update public.divisions d
set sort_order = 10
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name = 'Women''s';

update public.divisions d
set sort_order = 20
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name = 'Men''s';

update public.divisions d
set sort_order = 30
from public.tournaments t
where d.tournament_id = t.id
  and t.slug = '2026-t-shirt-tournament'
  and d.name = 'Coed';
