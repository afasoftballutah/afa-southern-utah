-- A separate credential for changing the roster.
--
-- Sign-up flow step 5 needs a manager to add a player who turns up on
-- Saturday and remove one who drops out. The spec said to put those controls
-- on the shared roster page, "for the manager only (roster_token holder)".
--
-- That is wrong, and the reason matters. roster_token is the link the manager
-- PASTES INTO THE TEAM CHAT. Every holder is the whole team. Controls behind
-- it are controls the whole team has, so any player could remove a teammate.
--
-- So roster editing gets its own token, which the manager never shares. Two
-- links, two audiences:
--
--   roster_token  -> the team. Find your name, sign. Read-only.
--   manage_token  -> the manager. Add and remove people.
--
-- A NOTE ON WHAT THE SHARED LINK ALREADY EXPOSES, so it is on the record
-- rather than discovered later: the roster page renders every person's
-- personal signing link, so anyone holding the team link can open a
-- teammate's page and sign for them. That is inherent in "one link everybody
-- taps" — the alternative is delivering fifteen links individually, which is
-- the exact friction the shared link exists to remove. It is an accepted
-- trade for a team group chat. It is NOT an acceptable trade for roster
-- edits, which is why they live behind this second token instead.

alter table public.registrations
  add column if not exists manage_token uuid not null default gen_random_uuid();

comment on column public.registrations.manage_token is
  'The manager''s private credential for editing the roster. NEVER shared with the team — that is roster_token, which is read-only by design. Unguessable, never listed, exact match only.';
