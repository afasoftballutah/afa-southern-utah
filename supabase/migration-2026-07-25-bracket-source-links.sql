-- Dispatch-brief-24: wire the transcribed Gold/Silver/Bronze brackets into
-- the existing scoring + propagation machinery (lib/bracket/propagate.js,
-- app/api/scorekeeper/games/[id]/score/route.js). Those brackets were
-- transcribed straight off the league's printed bracket and carry their
-- feed relationships as TEXT only ("Winner of Game 5" / "Loser of Game 5")
-- with team1_source_game_id/team2_source_game_id left null — exactly the
-- columns the engine already uses to cascade a result forward. This is a
-- one-time backfill of those columns from that text. It never touches
-- team1_name/team2_name — the placeholder text stays the visible label
-- until a real result overwrites it live, same as any engine-generated
-- bracket.
--
-- For these three divisions `round` holds the league's printed game
-- number (verified unique per division: measured 2026-07-25, no
-- duplicates), so "Game N" in the transcribed text resolves to the game
-- row in the SAME division whose round = N. bracket_side is 'winners' on
-- every one of these rows (the transcription never modeled a separate
-- losers/final side) — that also means propagate.js's grand-final-cancel
-- rule (bracket_side='final') and consolation-entrant rule
-- (isEliminatingLoss, which requires bracket_side 'losers' or 'final')
-- can never fire for these games, so propagateAfterFinalize is safe to
-- call unmodified (see report).
--
-- Scoped to Gold/Silver/Bronze by division_id as belt-and-suspenders —
-- measured 2026-07-25: no other division in the database has any
-- "Winner of Game N"/"Loser of Game N" team name text, so this scoping
-- changes nothing in practice, but keeps the backfill from ever touching
-- an unrelated division if the pattern is ever reused elsewhere.

update public.games AS dep
   set team1_source_game_id = src.id,
       team1_source_result = lower((regexp_match(dep.team1_name, '^(Winner|Loser) of Game ([0-9]+)$'))[1]),
       updated_at = now()
  from public.games AS src
 where dep.division_id in (
         '00e80340-8db4-4149-bb8f-c77cb1e6e425', -- Gold
         '54a34837-0573-4ad8-87a3-2feaef7024a8', -- Silver
         '5f95d12b-ada4-4657-a23b-025f35cc9cc7'  -- Bronze
       )
   and dep.team1_name ~ '^(Winner|Loser) of Game ([0-9]+)$'
   and dep.team1_source_game_id is null
   and src.division_id = dep.division_id
   and src.round = (regexp_match(dep.team1_name, '^(Winner|Loser) of Game ([0-9]+)$'))[2]::int;

update public.games AS dep
   set team2_source_game_id = src.id,
       team2_source_result = lower((regexp_match(dep.team2_name, '^(Winner|Loser) of Game ([0-9]+)$'))[1]),
       updated_at = now()
  from public.games AS src
 where dep.division_id in (
         '00e80340-8db4-4149-bb8f-c77cb1e6e425', -- Gold
         '54a34837-0573-4ad8-87a3-2feaef7024a8', -- Silver
         '5f95d12b-ada4-4657-a23b-025f35cc9cc7'  -- Bronze
       )
   and dep.team2_name ~ '^(Winner|Loser) of Game ([0-9]+)$'
   and dep.team2_source_game_id is null
   and src.division_id = dep.division_id
   and src.round = (regexp_match(dep.team2_name, '^(Winner|Loser) of Game ([0-9]+)$'))[2]::int;
