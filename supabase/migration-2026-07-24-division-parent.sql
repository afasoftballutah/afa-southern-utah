-- Bracket stages are CHILDREN of a division, not peers of it (JD ruling
-- 2026-07-24). Coed E doesn't sit beside Gold and Silver — it BECOMES
-- them, and which one a team lands in is decided by pool play finish.
-- Top-level divisions (parent_division_id is null) are the only ones that
-- get a card on the tournament lobby; children surface inside the parent's
-- page as bracket toggles. Each child still owns its own bracket row, so
-- the bracket engine is untouched by this.
alter table public.divisions
  add column if not exists parent_division_id uuid references public.divisions(id) on delete cascade;

-- Heatstroker: Gold/Silver become stages of Coed E, and shed the redundant
-- "Coed E — " prefix now that the parent supplies that context.
update public.divisions d
   set parent_division_id = p.id
  from public.divisions p
 where p.tournament_id = d.tournament_id
   and p.name = 'Coed E'
   and d.name in ('Coed E — Gold', 'Coed E — Silver', 'Gold', 'Silver')
   and d.id <> p.id;

update public.divisions set name = 'Gold',   display_name = 'Gold'   where name = 'Coed E — Gold';
update public.divisions set name = 'Silver', display_name = 'Silver' where name = 'Coed E — Silver';
