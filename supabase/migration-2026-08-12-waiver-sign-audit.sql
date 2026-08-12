-- E-sign audit for AFA waivers.
-- One waiver per person per tournament (already). This records WHEN they
-- signed and FROM WHERE we can lawfully see: request IP + coarse edge geo
-- (city / region / country). Not GPS. Not a device fingerprint.
--
-- signed_* on roster_members is the snapshot that copies with the signature
-- onto other seats in the same event. waiver_sign_events is the append-only
-- log of the actual sign act.

alter table public.roster_members
  add column if not exists signed_ip text,
  add column if not exists signed_place text,
  add column if not exists signed_user_agent text,
  add column if not exists signed_via text;

comment on column public.roster_members.signed_ip is
  'Client IP at signing (x-forwarded-for). E-sign audit; director-only.';
comment on column public.roster_members.signed_place is
  'Coarse place from edge geo headers, e.g. "St. George, UT, US". Not GPS.';
comment on column public.roster_members.signed_user_agent is
  'Browser User-Agent at signing. Truncated. E-sign audit only.';
comment on column public.roster_members.signed_via is
  'How they signed: sign-link | director | register.';

create table if not exists public.waiver_sign_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  roster_member_id uuid not null references public.roster_members(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  person_key text,
  signed_at timestamptz not null,
  signed_ip text,
  signed_place text,
  signed_user_agent text,
  signed_via text not null default 'sign-link',
  created_at timestamptz not null default now()
);

comment on table public.waiver_sign_events is
  'PRIVATE. Append-only e-sign audit: when and from where a person signed the AFA waiver for a tournament. One row per actual sign act, not per copied seat.';

create index if not exists idx_waiver_sign_events_tournament
  on public.waiver_sign_events (tournament_id, signed_at desc);
create index if not exists idx_waiver_sign_events_member
  on public.waiver_sign_events (roster_member_id);
create index if not exists idx_waiver_sign_events_player
  on public.waiver_sign_events (player_id);

alter table public.waiver_sign_events enable row level security;
-- No anon policies — service_role only (same as roster_members).
grant all on public.waiver_sign_events to service_role;
