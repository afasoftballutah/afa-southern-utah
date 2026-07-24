-- Additive migration: tournaments.ump_fee_cents, tournaments.division_notes,
-- tournaments.special_rules
-- Task: Specifics card redesign (dispatch-brief-6, TASK C) — the standard
-- grid every tournament has (entry/deposit/guarantee/ump fee) needs a
-- structured ump-fee column, and the free-text notes column splits into
-- division policy sentences vs event-specific rules. Nullable, additive
-- only — no existing column touched. `notes` stays for other rows; the
-- T-Shirts row's content moves into the new columns and its `notes` is
-- cleared.
alter table public.tournaments
  add column if not exists ump_fee_cents integer,
  add column if not exists division_notes text,
  add column if not exists special_rules text;

comment on column public.tournaments.ump_fee_cents is 'Per-game umpire fee, in cents. Part of the standard numbers grid (entry/deposit/guarantee/ump fee) on the Specifics card. Nullable — most tournaments have none set yet.';
comment on column public.tournaments.division_notes is 'Division policy sentences (team minimums, combining rules, conditional divisions). Rendered as its own Specifics sub-section. Nullable.';
comment on column public.tournaments.special_rules is 'Event-specific rules (e.g. equalizer policy). Rendered as its own Specifics sub-section. Nullable.';
