-- Class belongs to the PLAYER.
--
-- JD, 2026-07-27: "each player has the class. the director can decide what to
-- do with it for a particular tournament. The team registers for the
-- tournament with the players and then gets put into a suggested class based
-- on the tournament."
--
-- I had this backwards. Class was sitting on the division and on the
-- registration — a property of the event, or a word the manager typed. It is
-- neither. It is a rating a person carries between tournaments, the same way
-- their name and birth date do, and a team's class is a CONSEQUENCE of who is
-- on the roster.
--
-- So the chain runs:
--
--   player.class_id            what this person is rated
--        |
--   roster for a registration  who actually showed up
--        |
--   suggested class            derived, shown with its reasoning
--        |
--   registrations.class_id     what the director actually entered them as
--
-- The last step stays a director's decision. A suggestion that overrode them
-- would be worse than no suggestion at all — they know things the roster does
-- not say.

alter table public.players
  add column if not exists class_id uuid references public.classes(id);

comment on column public.players.class_id is
  'What this person is rated: Rec, E, D, Open. Carried between tournaments, like their name. A team''s class is DERIVED from the classes of its roster — see the suggestion in lib/class.js — and never stored on the person.';

create index if not exists idx_players_class on public.players (class_id);

-- registrations.class was free text a manager typed. Keep it — it is what
-- somebody wrote — but add the real link, so "what class did this team
-- actually play" is answerable without string matching.
alter table public.registrations
  add column if not exists class_id uuid references public.classes(id);

comment on column public.registrations.class_id is
  'The class this team was actually entered in, set by the director. Distinct from the derived suggestion, and from registrations.class which is the free text a manager typed on the form.';

comment on column public.registrations.class is
  'Free text the manager typed. Superseded by class_id; kept because it is what somebody actually wrote. Do not read it when class_id is present.';

-- Backfill the link from the text where it matches a real class, so existing
-- registrations stop being invisible to anything that reads class_id.
update public.registrations r
   set class_id = c.id
  from public.classes c
 where r.class_id is null
   and r.class is not null
   and lower(btrim(r.class)) = lower(c.name);

create index if not exists idx_registrations_class on public.registrations (class_id);
