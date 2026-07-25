-- Dispatch brief 20 — poster facts: prizes, closed registration, external
-- registration. Additive only. JD ruling: St. George City runs registration
-- for this tournament (not this site); registration closed 2026-07-12;
-- prizes render in Specifics. Venue/fee/dates/contacts untouched.
alter table public.tournaments
  add column if not exists prizes text,
  add column if not exists registration_closes date,
  add column if not exists registration_url text,
  add column if not exists registration_note text;

comment on column public.tournaments.prizes is 'What the winners get, rendered as its own Specifics sub-section (between Divisions and Tournament rules). Nullable — most tournaments have none set yet.';
comment on column public.tournaments.registration_closes is 'The date entries close. Drives the Registration block''s display text and its disabled/non-interactive state once past. Nullable.';
comment on column public.tournaments.registration_url is 'An EXTERNAL registration page, set when the league/city runs registration elsewhere. When set, this tournament does NOT use the site''s own registration form. Nullable.';
comment on column public.tournaments.registration_note is 'Extra ways to register, plain text (e.g. in-person office, phone, email). Nullable.';

update public.tournaments
set
  prizes = '1st place: custom short sleeve jerseys and a cooler with drinks. 2nd place: 12 custom batting gloves.',
  registration_closes = '2026-07-12',
  registration_url = 'https://www.sgcityutah.gov/softball',
  registration_note = 'In person at the St. George City Commons Office. Email softball@sgcityutah.gov or call 435-627-4563.'
where slug = '2026-coed-heat-stroker';
