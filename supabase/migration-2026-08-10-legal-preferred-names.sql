-- Legal name + preferred name + email on people signups.
--
-- roster_members.name stays the DISPLAY name (preferred if set, else legal).
-- legal_first/last are for the waiver and identity matching.
-- Players use email (no phone). Coaches/managers keep phone. Umpires keep both.

-- ============================================================
-- roster_members
-- ============================================================
alter table public.roster_members
  add column if not exists legal_first_name text,
  add column if not exists legal_last_name text,
  add column if not exists preferred_name text;

comment on column public.roster_members.legal_first_name is
  'Legal first name for the waiver. Display name is preferred_name or legal first+last.';
comment on column public.roster_members.legal_last_name is
  'Legal last name for the waiver.';
comment on column public.roster_members.preferred_name is
  'Optional. What they go by on the roster if different from legal name.';
comment on column public.roster_members.email is
  'Contact email for any role (players, coaches, managers).';
comment on column public.roster_members.phone is
  'Phone for coaches/managers. Players should leave null — use email.';
comment on column public.roster_members.name is
  'Display name used on rosters and links. Preferred if set, else legal first + last.';

-- Best-effort backfill: keep existing display name; split legal when possible.
update public.roster_members
set
  preferred_name = coalesce(preferred_name, nullif(trim(name), '')),
  legal_first_name = coalesce(
    legal_first_name,
    nullif(split_part(trim(name), ' ', 1), '')
  ),
  legal_last_name = coalesce(
    legal_last_name,
    nullif(trim(substring(trim(name) from length(split_part(trim(name), ' ', 1)) + 2)), '')
  )
where name is not null
  and (legal_first_name is null or legal_last_name is null);

-- ============================================================
-- players (directory)
-- ============================================================
alter table public.players
  add column if not exists legal_first_name text,
  add column if not exists legal_last_name text,
  add column if not exists preferred_name text,
  add column if not exists email text;

comment on column public.players.legal_first_name is 'Legal first name.';
comment on column public.players.legal_last_name is 'Legal last name.';
comment on column public.players.preferred_name is 'Optional preferred / roster name.';
comment on column public.players.email is 'Contact email. No phone on players.';
comment on column public.players.full_name is
  'Display name (preferred or legal). Kept for matching and director lists.';

update public.players
set
  preferred_name = coalesce(preferred_name, nullif(trim(full_name), '')),
  legal_first_name = coalesce(
    legal_first_name,
    nullif(split_part(trim(full_name), ' ', 1), '')
  ),
  legal_last_name = coalesce(
    legal_last_name,
    nullif(trim(substring(trim(full_name) from length(split_part(trim(full_name), ' ', 1)) + 2)), '')
  )
where full_name is not null
  and (legal_first_name is null or legal_last_name is null);

-- ============================================================
-- umpires — first_name/last_name are legal; preferred optional
-- ============================================================
alter table public.umpires
  add column if not exists preferred_name text;

comment on column public.umpires.first_name is 'Legal first name.';
comment on column public.umpires.last_name is 'Legal last name.';
comment on column public.umpires.preferred_name is
  'Optional. What they go by if different from legal name.';
comment on column public.umpires.phone is 'Phone (required contact for umpires).';
comment on column public.umpires.email is 'Email (required contact for umpires).';
