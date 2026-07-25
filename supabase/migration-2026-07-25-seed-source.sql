-- Seeding (dispatch-brief-22): "machine proposes, director disposes."
-- Standings compute; ties are broken by the DIRECTOR, never guessed.
-- Seeding resolves a pool's finish order into the real team names that
-- belong in the bracket's placeholder slots ("[A #1]" -> the actual team
-- that won Pool A). It must be safely RE-RUNNABLE — a score correction
-- later shouldn't lose what a slot originally meant — so the placeholder
-- is preserved in its own column instead of being overwritten in place.
--
-- Never touches pool_games (live tournament results). Only affects
-- public.games (the three transcribed bracket divisions).

alter table public.games add column if not exists team1_seed_ref text;
alter table public.games add column if not exists team2_seed_ref text;

comment on column public.games.team1_seed_ref is 'The pool-finish slot this game''s team1 came FROM (e.g. "[A #1]"), kept even after the real team name is filled in so seeding can be re-run after a score correction without losing what the slot originally meant. Null for slots resolved by bracket propagation instead of seeding.';
comment on column public.games.team2_seed_ref is 'Same as team1_seed_ref, for team2.';

-- One-time backfill: every bracket game slot whose team*_name currently
-- IS a raw seed placeholder (transcribed straight off the league's
-- printed bracket, e.g. "[A #1]" or "A #1") gets that same text copied
-- into its seed_ref column. "Winner of Game N" / "Loser of Game N" slots
-- never match this pattern and are left alone entirely — those are
-- resolved by the bracket engine's own propagation, not by seeding.
update public.games
   set team1_seed_ref = team1_name
 where team1_name ~ '^\[?[A-I] #[0-9]+\]?$'
   and team1_seed_ref is null;

update public.games
   set team2_seed_ref = team2_name
 where team2_name ~ '^\[?[A-I] #[0-9]+\]?$'
   and team2_seed_ref is null;
