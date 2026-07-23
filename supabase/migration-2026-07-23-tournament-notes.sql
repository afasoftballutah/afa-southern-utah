-- Additive migration: tournaments.notes
-- Task: "Do It for the T-Shirts" event page needed a place for short
-- plain-text operational lines that have no dedicated column ($10/game ump
-- fees, 6-team minimum per division, no combining divisions, no
-- equalizers). Nullable, additive only — no existing column touched.
alter table public.tournaments add column if not exists notes text;
comment on column public.tournaments.notes is 'Short plain-text operational lines (fees/minimums/rules) rendered under the facts list on the event page. Nullable — most tournaments have none.';
