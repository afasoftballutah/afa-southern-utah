-- People and teams that outlive one registration.
--
-- JD, 2026-07-27: "I think I would rather build the dbs so we can have a
-- comprehensive director view to work off of."
--
-- Today a roster_members row is a registration entry, not a person. If Fallen
-- signs up for a second tournament that is twelve NEW rows, and Kaydee
-- Anderson exists twice with nothing joining them. A director view built on
-- that can only ever describe one weekend.
--
-- WHAT CHANGED MY MIND ABOUT STORED IDENTITY. Until now the argument against
-- these tables was that a typo becomes a permanent duplicate, and name
-- matching is self-healing only while nothing is stored. That argument still
-- holds for GAMES — a name typed at a ballpark, at speed, with no review. It
-- does not hold here. A registration name is typed once, by the manager, and
-- read by a director. And a person now carries a birth date, which is a far
-- stronger key than any team name.
--
-- So: registrations and rosters resolve to stored identities. Games stay
-- text, and the team pages keep deriving from them. Linking games to teams
-- waits until the merge tool below has been used in anger.
--
-- PRIVACY. players holds a full name and a date of birth for real people,
-- some of whom may be minors. It is service_role only — RLS on, zero
-- policies, no anon or authenticated grant, same as registrations and
-- roster_members. Nothing public reads it. A public player page is a separate
-- decision that has not been made; do not add one by widening a grant.

-- ============================================================
-- players — a person across tournaments
-- ============================================================

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  -- Case and spacing folded for matching. Kept as a stored column rather than
  -- an index expression so it can be selected, compared and merged on.
  normalized_name text not null,
  birth_date date,
  merged_into_id uuid references public.players(id),
  created_at timestamptz not null default now()
);

comment on table public.players is
  'A person across tournaments. Service_role only — holds real names and dates of birth. Never exposed publicly; a public player page is a decision nobody has made.';
comment on column public.players.merged_into_id is
  'Set when this row was found to be a duplicate. The row is NEVER deleted — roster_members still point at it — and every read follows the chain to the surviving player. See merge_players().';

-- Name plus birth date is the identity. It is strong: two people on one
-- roster sharing both is not a case this league will meet, and the birth date
-- is already collected for the waiver.
--
-- A person with NO birth date gets no uniqueness at all. Deliberate: matching
-- on name alone would merge two different people, which is worse than
-- carrying a duplicate a director can see and fix.
create unique index if not exists players_identity
  on public.players (normalized_name, birth_date)
  where birth_date is not null and merged_into_id is null;

create index if not exists idx_players_name on public.players (normalized_name);

-- ============================================================
-- teams — a team across tournaments
-- ============================================================

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  -- Same identity the public team pages use: name + gender + class.
  gender text check (gender in ('mens', 'womens', 'coed')),
  class_id uuid references public.classes(id),
  merged_into_id uuid references public.teams(id),
  created_at timestamptz not null default now()
);

comment on table public.teams is
  'A team across tournaments, resolved from REGISTRATIONS only. Game rows keep carrying text names — a name typed at a ballpark has no review step, and a stored identity would make each typo a permanent second team. Service_role only for now.';
comment on column public.teams.merged_into_id is
  'Set when this row was found to be a duplicate. Never deleted. See merge_teams().';

-- Nulls do not compare equal, so a division with no class would let the same
-- team be created twice. coalesce pins it to a fixed sentinel instead.
create unique index if not exists teams_identity
  on public.teams (normalized_name, coalesce(gender, ''), coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where merged_into_id is null;

-- ============================================================
-- The links
-- ============================================================

alter table public.roster_members
  add column if not exists player_id uuid references public.players(id) on delete set null;
alter table public.registrations
  add column if not exists team_id uuid references public.teams(id) on delete set null;

comment on column public.roster_members.player_id is
  'The person this roster entry is. Null when we could not resolve one — no birth date, so no safe key. Resolved on write; a null is a director task, not an error.';
comment on column public.registrations.team_id is
  'The team this registration is. Resolved on write from name + the division''s gender and class.';

create index if not exists idx_roster_members_player on public.roster_members (player_id);
create index if not exists idx_registrations_team on public.registrations (team_id);

-- ============================================================
-- Merge — shipped WITH the tables, never after
-- ============================================================
--
-- A stored identity without a repair tool is a trap: the first typo becomes
-- permanent and nothing can undo it. These are the reason the tables are
-- allowed to exist at all.

create or replace function public.merge_players(keep_id uuid, drop_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if keep_id = drop_id then
    raise exception 'Cannot merge a player into itself';
  end if;
  if not exists (select 1 from players where id = keep_id and merged_into_id is null) then
    raise exception 'Target player % does not exist or is itself merged away', keep_id;
  end if;

  update roster_members set player_id = keep_id where player_id = drop_id;
  -- Anything already pointing at the dropped row follows it forward, so a
  -- second merge cannot strand a chain.
  update players set merged_into_id = keep_id where merged_into_id = drop_id;
  -- Keep the better birth date rather than silently losing one.
  update players k set birth_date = coalesce(k.birth_date, d.birth_date)
    from players d where k.id = keep_id and d.id = drop_id;
  update players set merged_into_id = keep_id where id = drop_id;
end $$;

create or replace function public.merge_teams(keep_id uuid, drop_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if keep_id = drop_id then
    raise exception 'Cannot merge a team into itself';
  end if;
  if not exists (select 1 from teams where id = keep_id and merged_into_id is null) then
    raise exception 'Target team % does not exist or is itself merged away', keep_id;
  end if;

  update registrations set team_id = keep_id where team_id = drop_id;
  update teams set merged_into_id = keep_id where merged_into_id = drop_id;
  update teams set merged_into_id = keep_id where id = drop_id;
end $$;

revoke all on function public.merge_players(uuid, uuid) from public, anon, authenticated;
revoke all on function public.merge_teams(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_players(uuid, uuid) to service_role;
grant execute on function public.merge_teams(uuid, uuid) to service_role;

-- ============================================================
-- Grants — this project auto-exposes NOTHING
-- ============================================================

alter table public.players enable row level security;
alter table public.teams enable row level security;

grant all on public.players to service_role;
grant all on public.teams to service_role;
-- No anon, no authenticated. Stated, not assumed.

-- ============================================================
-- Backfill from what is already on file
-- ============================================================

-- Normalisation must match lib/teams.js normalizePersonName: trim, collapse
-- runs of whitespace, fold curly apostrophes to straight, lowercase.
insert into public.players (full_name, normalized_name, birth_date)
select distinct on (lower(regexp_replace(btrim(replace(m.name, '’', '''')), '\s+', ' ', 'g')), m.birth_date)
       btrim(m.name),
       lower(regexp_replace(btrim(replace(m.name, '’', '''')), '\s+', ' ', 'g')),
       m.birth_date
  from public.roster_members m
 where m.birth_date is not null
on conflict do nothing;

update public.roster_members m
   set player_id = p.id
  from public.players p
 where m.player_id is null
   and m.birth_date = p.birth_date
   and p.normalized_name = lower(regexp_replace(btrim(replace(m.name, '’', '''')), '\s+', ' ', 'g'));

insert into public.teams (name, normalized_name, gender, class_id)
select distinct on (lower(regexp_replace(btrim(replace(r.team_name, '’', '''')), '\s+', ' ', 'g')), d.gender, d.class_id)
       btrim(r.team_name),
       lower(regexp_replace(btrim(replace(r.team_name, '’', '''')), '\s+', ' ', 'g')),
       d.gender,
       d.class_id
  from public.registrations r
  join public.divisions d on d.id = r.division_id
on conflict do nothing;

update public.registrations r
   set team_id = t.id
  from public.teams t, public.divisions d
 where d.id = r.division_id
   and r.team_id is null
   and t.normalized_name = lower(regexp_replace(btrim(replace(r.team_name, '’', '''')), '\s+', ' ', 'g'))
   and t.gender is not distinct from d.gender
   and t.class_id is not distinct from d.class_id;
