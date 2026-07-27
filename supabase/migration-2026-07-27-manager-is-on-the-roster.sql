-- The manager plays. One waiver, not two.
--
-- JD, 2026-07-27: "all managers should be on their teams roster - this is
-- regular. Dont need two waivers."
--
-- Earlier today the manager got her own signing token, separate from the
-- roster. That was wrong in a way the live data showed immediately: Fallen's
-- manager is Brayden Brooks, Brayden Brooks is on the roster, and the team
-- link listed him twice with two links and two waivers to sign.
--
-- A manager in this league is a player who also runs the team. So the manager
-- IS a roster_members row. One row, one token, one signature — and that same
-- signature fills the "Manager's Signature" line on the AFA form.

-- Which roster row is the manager. Null only for a legacy registration whose
-- manager could not be matched by name; the route always sets it on write.
alter table public.registrations
  add column if not exists manager_member_id uuid references public.roster_members(id);

comment on column public.registrations.manager_member_id is
  'The roster_members row that IS the manager. A manager plays for her own team, so she signs ONE waiver like everyone else, and that signature fills the manager line on the form. Set on write; the roster page marks this row "manager".';

-- Match existing registrations to their manager's roster row by name.
update public.registrations r
   set manager_member_id = m.id
  from public.roster_members m
 where m.registration_id = r.id
   and r.manager_member_id is null
   and lower(btrim(m.name)) = lower(btrim(r.manager_name));

-- The separate manager credential is retired. It existed for a few hours and
-- was only ever used by the Fallen test row. Leaving a live, unused signing
-- token in the table is a standing risk for no benefit, so drop it rather
-- than deprecate it.
alter table public.registrations
  drop column if exists manager_signing_token;

-- manager_signature_png and manager_signed_at stay. They are now a MIRROR of
-- the manager's roster row, written by the sign route at the same moment, so
-- the PDF's manager line and the roster table cannot disagree.
comment on column public.registrations.manager_signature_png is
  'Mirror of the manager''s roster_members.signature_png, written at the same moment. Feeds the "Manager''s Signature" line on the AFA form. Never signed separately — see manager_member_id.';

-- Re-sync the mirror for rows that already have a signed manager row.
update public.registrations r
   set manager_signature_png = m.signature_png,
       manager_signed_at = m.signed_at
  from public.roster_members m
 where m.id = r.manager_member_id
   and m.signed_at is not null;

-- Clear a stale mirror where the manager's roster row is NOT signed. Fallen
-- carries one: the manager signed through the retired separate link, which
-- no longer exists, so that signature has nothing behind it.
update public.registrations r
   set manager_signature_png = null,
       manager_signed_at = null
  from public.roster_members m
 where m.id = r.manager_member_id
   and m.signed_at is null
   and r.manager_signature_png is not null;

-- "Official" is now a plain roster question: is anyone still outstanding?
-- The manager is inside that count, so she needs no separate term.
-- Dropped, not replaced: the column order changes, and `create or replace
-- view` refuses to rename an existing output column.
drop view if exists public.registration_signing_progress;

create view public.registration_signing_progress as
  select r.id as registration_id,
         count(m.*) filter (where m.removed_at is null) as active_members,
         count(m.*) filter (where m.removed_at is null and m.signed_at is not null) as signed_members,
         bool_or(m.id = r.manager_member_id and m.signed_at is not null) as manager_signed,
         (count(m.*) filter (where m.removed_at is null) > 0
          and count(m.*) filter (where m.removed_at is null and m.signed_at is null) = 0) as is_official
    from public.registrations r
    left join public.roster_members m on m.registration_id = r.id
   group by r.id;

comment on view public.registration_signing_progress is
  'Derived signing state. Official = at least one active roster member and none outstanding. The manager is a roster member, so she is counted there rather than separately. Service_role only.';

revoke all on public.registration_signing_progress from anon, authenticated;
grant select on public.registration_signing_progress to service_role;

-- roster_members.role only allowed 'player' and 'coach'. A manager who was
-- not already in the player list now gets her own row, and it needs a role
-- that says so. Caught by the live route the first time it ran.
alter table public.roster_members
  drop constraint if exists roster_members_role_check;
alter table public.roster_members
  add constraint roster_members_role_check
  check (role in ('player', 'coach', 'manager'));

-- Clean up the orphan that failure left behind: a registration whose roster
-- insert rolled back, leaving a team with no members. The route now deletes
-- its own registration when the roster fails, so this is a one-off.
delete from public.registrations r
 where not exists (select 1 from public.roster_members m where m.registration_id = r.id);

-- manager_member_id needs an ON DELETE action. Without one the reference is
-- rigid in both directions: deleting a registration cascades to its roster
-- rows, that cascade tries to remove the row this column points at, and the
-- FK refuses — so a registration could never be deleted at all. Caught while
-- clearing test data.
--
-- SET NULL is right. The manager pointer is a label on a roster row, not the
-- roster row's reason to exist. Losing the label is survivable; losing the
-- ability to delete a registration is not.
alter table public.registrations
  drop constraint if exists registrations_manager_member_id_fkey;
alter table public.registrations
  add constraint registrations_manager_member_id_fkey
  foreign key (manager_member_id) references public.roster_members(id) on delete set null;
