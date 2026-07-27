-- The manager signs whenever, like everyone else.
--
-- JD, 2026-07-27: "should be able to sign it whenever, even after
-- submitting. Signing makes it official."
--
-- Until now the manager was the one person who HAD to sign at the moment of
-- submit — /api/register rejected the request without a signature, and the
-- column was NOT NULL. Every other person on the roster already had the
-- opposite deal: a personal unguessable token and no deadline. That split
-- had no reason behind it. A manager filling the form in at a ballpark on a
-- phone should be able to get the team in and sign later, from the same
-- shared roster link her players use.
--
-- So: submitting RECORDS a team. Signing makes it OFFICIAL. Those are now
-- two separate moments for everybody.
--
-- Additive and idempotent. One live registration exists (Fallen, test data)
-- and it keeps its placeholder signature; nothing is rewritten here.

-- A registration can now exist before anyone has signed it.
alter table public.registrations
  alter column manager_signature_png drop not null;

-- The manager's own signing credential, matching roster_members.signing_token
-- in shape and trust model: unguessable, never listed, looked up by exact
-- match only. Distinct from roster_token, which is the SHARED link the whole
-- team uses to find their individual pages.
alter table public.registrations
  add column if not exists manager_signing_token uuid not null default gen_random_uuid();

alter table public.registrations
  add column if not exists manager_signed_at timestamptz;

comment on column public.registrations.manager_signature_png is
  'Nullable since 2026-07-27. Null means the manager has not signed yet, not that the registration is invalid — submitting records the team, signing makes it official.';
comment on column public.registrations.manager_signing_token is
  'The manager''s personal signing credential. Same trust model as roster_members.signing_token — unguessable, never listed, exact match only. NOT the same as roster_token, which is the shared team link.';
comment on column public.registrations.manager_signed_at is
  'When the manager signed. Null until she does.';

-- Backfill the one row that predates this: it carries a placeholder image,
-- not a signature, so it is honestly UNSIGNED. Clearing it keeps
-- "signed = has a signature" true, which every count on the roster page and
-- the director view depends on.
update public.registrations
   set manager_signature_png = null,
       manager_signed_at = null
 where director_notes like 'TEST DATA%'
   and manager_signed_at is null;

-- A registration is official when the manager has signed and every roster
-- member who is still on the team has signed. Derived, never stored — the
-- same reasoning that keeps tournaments.status from being trusted.
create or replace view public.registration_signing_progress as
  select r.id as registration_id,
         (r.manager_signature_png is not null) as manager_signed,
         count(m.*) filter (where m.removed_at is null) as active_members,
         count(m.*) filter (where m.removed_at is null and m.signed_at is not null) as signed_members,
         (r.manager_signature_png is not null
          and count(m.*) filter (where m.removed_at is null and m.signed_at is null) = 0) as is_official
    from public.registrations r
    left join public.roster_members m on m.registration_id = r.id
   group by r.id, r.manager_signature_png;

comment on view public.registration_signing_progress is
  'Derived signing state. Official = the manager has signed and no active roster member is outstanding. Removed members never block it. Service_role only, like its base tables — it reads PII-adjacent rows and gets no public grant.';

-- This project auto-exposes NOTHING. The view inherits no grants; state that
-- rather than leave it to be assumed.
revoke all on public.registration_signing_progress from anon, authenticated;
grant select on public.registration_signing_progress to service_role;
