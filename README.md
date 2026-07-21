# AFA Southern Utah Slow-Pitch — Site

Public website, team registration, and results for the American Fastpitch
Association's Southern Utah Slow Pitch division (director: Joey Markakis).
Stage one: public site + registration + waivers. Stage two (bracket builder,
scorekeeper door) is not built yet — see "What's deferred" below.

## Stack

Next.js 16 (App Router) + Supabase (Postgres, Storage) + Vercel + Tailwind
CSS v4. Nothing else. No CMS. No Facebook/Meta API. This is a deliberate
choice — see `session-data/afa/afa-spec.md` in the power-desktop repo for the
full spec and the reasoning ("JD hands this over" is the overriding
constraint).

**No outbound comms anywhere in this codebase.** This is a hard constraint
(JD ruling, 2026-07-21) — it's a test site. Registration saves data and
generates a signed PDF locally; nothing ever emails, texts, or otherwise
sends to anyone. There's no email dependency installed at all (removed, not
just unconfigured). "Who gets notified of what" is a future admin-panel
feature, not built here.

## Structure

```
app/
  page.js                       Home — season poster hero + last results
  tournaments/page.js           Season list
  tournaments/[slug]/page.js    Tournament detail + results gallery
  rules/page.js                  Static rules (edit lib/content/rules.js)
  register/page.js               Registration entry point (server component,
                                  fetches tournament/division list)
  register/sign/[token]/page.js  Personal remote-sign page — one per
                                  player/coach, gated by an unguessable token
  api/register/route.js          POST handler: saves registration + roster,
                                  builds the PDF snapshot. No email, ever.
  api/register/sign/route.js     POST handler: saves one roster member's
                                  signature, regenerates the PDF. No email.
  api/keepalive/route.js         Daily cron target — keeps the free Supabase
                                  project from auto-pausing
components/
  RegistrationForm.js             Client-side multi-step registration wizard
                                  (team/manager info + roster list; manager
                                  signs her own line live, at submission)
  SignRosterMember.js             Client component for a player/coach's own
                                  personal sign page
  SignaturePad.js                 Draw-on-screen signature capture (shared)
lib/
  supabase.js                     Two clients: public (anon, RLS-gated) and
                                   service (service_role, server-only, never
                                   import from a Client Component)
  data.js                         Public read queries + formatting helpers
  waiver.js                       Release text (verbatim from the official
                                   form) + field limits
  pdf/build-waiver-pdf.js         Builds the PDF snapshot — embeds whichever
                                   signatures exist yet, "awaiting signature"
                                   for the rest
  pdf/regenerate.js                Shared fetch-and-rebuild-PDF helper, used
                                   by both the register and sign routes
  content/rules.js                 Plain-text rules content — edit by hand
supabase/
  schema.sql                       Full schema + RLS policies + grants
  seed-placeholder.sql             2023 season data, loaded as placeholder
vercel.json                        Daily cron config
```

## Data model

- `tournaments`, `divisions`, `placements` — public data, no PII. RLS: SELECT
  granted to `anon`/`authenticated`, no write policies for anyone but
  `service_role`.
- `registrations` — team + manager info + the manager's own signature (PII).
  RLS is enabled with **zero policies**, and no GRANT to `anon`/`authenticated`
  at all. Only `service_role` (used exclusively server-side) can read or
  write it.
- `roster_members` — one row per player/coach, locked exactly the same way
  (RLS on, zero policies, no anon/authenticated grant). Each row carries its
  own `signing_token` (random UUID) — the personal remote-sign link is
  `/register/sign/{signing_token}`. Knowledge of the token is the
  credential, same trust model any e-sign share link uses: unguessable,
  never listed anywhere, looked up by exact match only (no enumeration
  route exists). The manager shares each link herself however she likes —
  this app never sends them anywhere.
- Storage buckets: `waivers` (private — PDF snapshots), `posters` (public),
  `photos` (public — champion/runner-up photos, stage two).

Verified live against production: an anon-key request against either
`/rest/v1/registrations` or `/rest/v1/roster_members` returns
`permission denied` (42501). A request to `/register/sign/<made-up-token>`
returns a 404, not a PII leak.

**Important Supabase-project-specific gotcha**: this project's Data API
posture is "auto-expose new tables OFF" — which turned out to mean new
tables get **no role grants at all** by default, for `anon`,
`authenticated`, AND `service_role`. If you add a new table, you must
explicitly `GRANT SELECT` (or whatever's appropriate) to the roles that need
it, or every query — including from the service-role server code — will
fail with `permission denied`. This bit the build once; see
`supabase/schema.sql`'s grant statements for the pattern to copy.

## Registration → signed PDF flow (no email, ever)

1. Manager fills out the multi-step form at `/register`: tournament,
   division, team info, manager info, and the roster (player names/birth
   dates/addresses, coach names/emails/phones — no signatures collected for
   them here). She signs her own line live, since she's present submitting.
2. `POST /api/register` saves the registration row, creates one
   `roster_members` row per player/coach (each with a fresh `signing_token`),
   and builds an initial PDF snapshot (players/coaches show "awaiting
   signature").
3. The confirmation screen lists every player/coach with a **Copy link**
   button for their personal sign link. The manager shares these herself —
   text, in person, whatever. Nothing is emailed automatically.
4. Each person opens their link (`/register/sign/[token]`), reads the
   verbatim release text, draws their own signature, and submits.
   `POST /api/register/sign` saves it and regenerates the PDF snapshot.
5. The stored PDF (`waivers/{registrationId}.pdf`) always reflects current
   status — signed rows show the real signature image, unsigned rows say
   "awaiting signature." There's no dashboard to view overall completion
   yet; that's future admin-panel territory.

### Interpretation call — read this before changing the sign flow

Each player/coach getting their own personal remote-signing link (rather
than the manager signing once for the whole roster) was JD's explicit
ruling on 2026-07-21, replacing the launch build's manager-signs-once
approach. This is now the real workflow — don't revert it without a new
ruling.

## Environment variables

See `.env.example` — just the two Supabase keys. No email/SMS config
exists on purpose (see "No outbound comms" above).

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe in the browser bundle, RLS-gated.
- `SUPABASE_SERVICE_ROLE_KEY` — **no `NEXT_PUBLIC_` prefix, on purpose**.
  Next.js only inlines `NEXT_PUBLIC_*` vars into client bundles; this one
  must never be renamed to start with that prefix.

## Visual identity

Set by Lacy (2026-07-21) — she rules the render, don't restyle casually:
- Navy masthead, eagle logo at left, name in white, thin red bar underneath
  (the one decorative use of red).
- Red is reserved for the actual register/sign action (the nav "Register"
  button, the homepage CTA, "Submit Registration," and each signer's own
  "Sign" button). Everything else clickable is a navy underline — no red
  hovers, no red "remove" buttons.
- The season poster is the homepage hero: framed like a flyer pinned to a
  board (`.poster-frame` in `globals.css` — thin border, slight shadow,
  never cropped, never behind text). A small "schedule coming soon" note
  sits above it when there's no confirmed date, it doesn't replace the poster.
- One display face (`Anton`, via `next/font/google`, self-hosted at build
  time) used only for tournament names — every other heading stays plain
  bold. Don't spend the display face on page titles or section headers.
- Section dividers are `.chalk-line` / `.chalk-panel` (a textured
  white-on-tan rule) instead of boxed cards with borders and shadows. The
  registration form's input surfaces (`.form-panel`) are the one exception —
  a form needs a contained surface, that's tool chrome, not display content.
- Results (once photos exist) show champion + runner-up side by side per
  division with plain captions underneath.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the Supabase anon key + service role key
npm run dev
```

## Deploy

Push to `main` on GitHub (`afasoftballutah` account) — Vercel is **not**
yet Git-connected (see `known-issues.md` KI-022 in the power-desktop repo),
so this doesn't auto-deploy today. Manual deploy: `vercel --prod` with the
Vercel CLI logged into the league's account.

## What's built (stage one) vs. deferred (stage two)

**Built:** Home, Tournaments (season list + detail + results gallery),
Rules (placeholder content), Register (digitized waiver, per-person signed
PDF, no outbound comms), all public pages served from the Vercel CDN with
ISR (`revalidate = 30` seconds).

**Deferred to stage two** (see `afa-spec.md`):
- Scorekeeper door (PIN-gated score entry, photo upload at final score)
- Bracket builder (generator + manual drag-to-edit + lock-on-first-score)
- Payments (form is structured so this can drop in without a redo)
- Admin panel for "who gets notified of what" — the moment any outbound
  comms are wanted, that's the feature to build; nothing sends today.
- Real 2026 tournament dates and the official rules doc (both pending from
  Joey — the site currently shows clearly-labeled 2023 data as a reference)
