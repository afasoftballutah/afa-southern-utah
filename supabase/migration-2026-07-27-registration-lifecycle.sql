-- Sign-up flow, step 2 — the registration lifecycle.
-- See session-data/afa/spec-signup-flow.md.
--
-- The flow already exists: /register writes a registration plus one
-- roster_members row per person, each with its own signing_token, and builds
-- the waiver PDF. What it cannot do is say a team paid, let a manager share
-- ONE link instead of fifteen, add a player who turns up on Saturday, or
-- survive a double-tap on submit. These columns are what steps 3–6 need.
--
-- Additive and idempotent. All new columns are nullable or defaulted, so
-- existing rows stay valid; both tables are empty today in any case.
--
-- PRIVACY. registrations and roster_members are service_role only — RLS on,
-- zero policies, no anon/authenticated grant (schema.sql lines 336–337,
-- 387–388; re-verified live 2026-07-27). New columns inherit that, so there
-- is nothing to grant here and nothing SHOULD be granted. roster_token is a
-- credential; it must never be selected by a public client.

-- ============================================================
-- registrations — lifecycle and the shared roster link
-- ============================================================

alter table public.registrations
  add column if not exists roster_token uuid not null default gen_random_uuid();

alter table public.registrations
  add column if not exists status text not null default 'submitted';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registrations_status_check'
  ) then
    alter table public.registrations
      add constraint registrations_status_check
      check (status in ('submitted', 'confirmed', 'withdrawn'));
  end if;
end $$;

alter table public.registrations
  add column if not exists paid_at timestamptz,
  add column if not exists amount_paid_cents integer,
  add column if not exists director_notes text;

comment on column public.registrations.roster_token is
  'Unguessable link the MANAGER shares with her own team so each player can find their personal signing page. Never listed, never exposed to a public client. Distinct from roster_members.signing_token, which is per person and shows that person''s own details.';
comment on column public.registrations.status is
  'submitted | confirmed | withdrawn. Set by the director. A withdrawn team frees its name for re-registration — see the unique index below.';
comment on column public.registrations.paid_at is
  'Set by the director when money actually changed hands. Null means unpaid. Nothing in this project processes payments; this records what happened off-site.';
comment on column public.registrations.amount_paid_cents is
  'What was actually taken, which is not always tournaments.entry_fee_cents.';
comment on column public.registrations.director_notes is
  'Director-only free text. Never rendered on a public page.';

-- One live registration per team per division. The manager taps submit, the
-- network stalls, she taps again — without this she is registered twice and
-- the director sees a phantom team. Withdrawn rows are excluded so a team can
-- come back after pulling out.
--
-- btrim + lower only. This deliberately does NOT reach for the full
-- normalizeTeam (lib/quickscores.js), which also folds curly apostrophes —
-- that lives in JS and cannot be an index expression without an immutable
-- wrapper. The route should normalize before insert; this index is the
-- backstop, not the whole rule.
create unique index if not exists registrations_one_live_per_division
  on public.registrations (tournament_id, division_id, lower(btrim(team_name)))
  where status <> 'withdrawn';

-- ============================================================
-- roster_members — soft delete
-- ============================================================

-- A signature is a legal record. A player who is removed from the roster is
-- hidden, never deleted, and the regenerated waiver PDF must exclude them.
alter table public.roster_members
  add column if not exists removed_at timestamptz;

comment on column public.roster_members.removed_at is
  'Soft delete. Set when a manager removes someone from the roster. Rows with a signature are NEVER hard-deleted — the signed waiver is a record. Every roster read, and the PDF regeneration, must filter removed_at is null.';

create index if not exists idx_roster_members_active
  on public.roster_members (registration_id)
  where removed_at is null;
