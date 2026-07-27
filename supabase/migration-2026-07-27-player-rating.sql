-- A player has a RATING. A team has a CLASS. They are not the same ladder.
--
-- JD, 2026-07-27: "D can have up to 3 Cs. Open can be anyone. E can have up to
-- three Ds or a C and one D. REC can have nobody letter-ranked."
--
-- Those rules only make sense if a person can be rated C, and C is not one of
-- the classes this league runs (Rec, E, D, Open). So the two vocabularies are
-- separate:
--
--   player rating   A, B, C, D, E, or unranked   what a person is
--   team class      Rec, E, D, Open              what a team plays in
--
-- A team's class is then an ELIGIBILITY question — the lowest class whose
-- limits its roster does not break — not a lookup of one player. See
-- lib/class.js.
--
-- players.class_id was added earlier today under the wrong idea, that a person
-- carried a team class. Its values are migrated to ratings and the column is
-- dropped, because leaving both would guarantee they drift apart.

alter table public.players
  add column if not exists rating text
  check (rating is null or rating in ('A', 'B', 'C', 'D', 'E'));

comment on column public.players.rating is
  'A, B, C, D, E, or null for unranked. What this person is rated, carried between tournaments. NOT a team class — see the eligibility rules in lib/class.js for how a roster becomes a class.';

-- Carry over what was already entered. Rec was never a rating, it is the
-- class for a roster with nobody ranked, so a player marked Rec becomes
-- unranked — which is what Rec meant about that person all along.
update public.players p
   set rating = c.name
  from public.classes c
 where p.class_id = c.id
   and p.rating is null
   and c.name in ('D', 'E');

alter table public.players drop column if exists class_id;

create index if not exists idx_players_rating on public.players (rating);
