# AFA Southern Utah Slow-Pitch — Site

Public website, team registration, bracket builder, and live scoring for the
American Fastpitch Association's Southern Utah Slow Pitch division
(director: Joey Markakis). Stage one (public site + registration + waivers)
and stage two (bracket builder + scorekeeper door) are both built — see
"What's built vs. deferred" below for what's still open.

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
  scorekeeper/page.js             PIN gate + tournament/division picker
                                  (not in nav — direct URL only)
  scorekeeper/division/[divisionId]/page.js  Bracket builder + score entry
                                  + placements for one division
  api/register/route.js          POST handler: saves registration + roster,
                                  builds the PDF snapshot. No email, ever.
  api/register/sign/route.js     POST handler: saves one roster member's
                                  signature, regenerates the PDF. No email.
  api/scorekeeper/auth/route.js         POST {pin} -> session cookie
  api/scorekeeper/change-pin/route.js   POST {currentPin,newPin}, session-gated
  api/scorekeeper/bracket/generate/route.js  POST/DELETE — (re)generate or
                                              clear a division's bracket
  api/scorekeeper/games/[id]/route.js        PATCH — field/time, or team
                                              slots while draft
  api/scorekeeper/games/[id]/score/route.js  POST — enter a score, finalize,
                                              propagate to the next round
  api/scorekeeper/placements/route.js        POST — champion/runner-up +
                                              photos once a division finishes
  api/keepalive/route.js         Daily cron target — keeps the free Supabase
                                  project from auto-pausing
  robots.js                      Disallows /scorekeeper and /register/sign
components/
  RegistrationForm.js             Client-side multi-step registration wizard
  SignRosterMember.js             Client component for a player/coach's own
                                   personal sign page
  SignaturePad.js                 Draw-on-screen signature capture (shared)
  scorekeeper/PinPad.js            Big-target numeric PIN entry
  scorekeeper/BracketManager.js    Generate/edit/score a division's bracket
  scorekeeper/PlacementsUpload.js  Champion/runner-up name + compressed photo
lib/
  supabase.js                     Two clients: public (anon, RLS-gated) and
                                   service (service_role, server-only, never
                                   import from a Client Component)
  data.js                         Public read queries + formatting helpers
  waiver.js                       Release text (verbatim from the official
                                   form) + field limits
  scorekeeper-auth.js              PIN verify/change + HMAC-signed session
                                   cookie (no session table, no dependency
                                   beyond bcryptjs + Node's built-in crypto)
  pdf/build-waiver-pdf.js         Builds the PDF snapshot — embeds whichever
                                   signatures exist yet, "awaiting signature"
                                   for the rest
  pdf/regenerate.js                Shared fetch-and-rebuild-PDF helper, used
                                   by both the register and sign routes
  bracket/structure.js             Pure double-elimination structure
                                   generator — no I/O, unit-tested standalone
  bracket/resolve.js               Shared slot-resolution logic (byes,
                                   winners, losers) used at generation time
                                   and live as real scores come in
  bracket/generate.js              Persists a generated structure to `games`
                                   + `brackets`, runs the eager bye cascade
  bracket/propagate.js             Live propagation after a real score;
                                   the draft/locked check
  bracket/status.js                Division-complete + champion/runner-up
                                   detection (handles the GF2 decider rule)
  content/rules.js                 Plain-text rules content — edit by hand
supabase/
  schema.sql                       Full schema + RLS policies + grants
  seed-2026-season.sql              Real, confirmed 2026 season (all 11
                                     tournaments, JD-confirmed 2026-07-21)
vercel.json                        Daily cron config
```

## Data model

- `tournaments`, `divisions`, `placements`, `brackets`, `games` — public
  data, no PII. RLS: SELECT granted to `anon`/`authenticated`. No
  INSERT/UPDATE/DELETE grant exists for anyone but `service_role` — writes
  to `brackets`/`games` go through the scorekeeper API routes, which check
  the PIN-derived session cookie in application code before ever calling
  `service_role` (there's no per-user Postgres role for this; the PIN gate
  is app-level, the DB-level lock is "nobody but service_role can write,
  period"). Verified live: an anon-key POST to `/rest/v1/games` returns
  `permission denied` (42501).
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
- `settings` — currently just the scorekeeper PIN's bcrypt hash. RLS on,
  zero policies, no grants at all — same lockdown as `registrations`. Never
  read by anything but `lib/scorekeeper-auth.js`, server-side.
- Storage buckets: `waivers` (private — PDF snapshots), `posters` (public),
  `photos` (public — champion/runner-up photos, uploaded by the scorekeeper
  door, compressed client-side before upload).

Verified live against production: anon key gets `permission denied` on
`registrations`, `roster_members`, and `settings`; anon key can read but not
write `games`/`brackets`; a request to `/register/sign/<made-up-token>`
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

## The bracket engine (stage two)

`lib/bracket/structure.js` is a pure function — team names in, a full set of
match descriptors out — with no DB or I/O, so it was unit-tested standalone
(see the test cases described in this section) before ever touching
storage. Every case from 2 to 32 teams, including byes and the "if
necessary" grand-final decider, resolves cleanly with no dead ends.

**Shape.** Standard double elimination. Bracket size pads up to the next
power of two; the standard seeding order (1v8, 4v5, 2v7, 3v6 for an 8-slot
bracket) keeps top seeds apart by default — the director can still drag any
team to any slot before lock if the auto-seed isn't what they want. Losers
rounds alternate "condense" (previous survivors play each other) and
"drop-in" (survivors play the newly-eliminated winners-bracket losers, in
reversed order — the standard anti-rematch heuristic; it reduces but
doesn't guarantee zero repeat matchups, full manual editing is the backstop
for anything it misses). The grand final is always two games: game one, and
an "if necessary" decider that only gets played if the losers-bracket team
wins game one — otherwise it's auto-cancelled the moment game one finalizes.

**Byes cascade automatically.** A bye win at generation time can itself
feed a losers-bracket slot whose *other* feeder is a real, not-yet-played
game — `lib/bracket/resolve.js` and `propagate.js` share one resolution
function so this cascades correctly whether it happens eagerly at
generation time (before anyone's played anything) or live, mid-tournament,
as real games finish.

**Draft vs. locked.** A bracket is draft until any *real* (scorekeeper-
entered, non-bye) game has a score — see `isBracketDraft()` in
`propagate.js`. While draft: every slot is manually editable (drag/select
any team into any slot), and "Regenerate" wipes and rebuilds from current
registrations (covers late adds/drops). Once locked: team/slot edits and
regeneration are refused (409) — only scores and field/time reassignment
flow through from then on. Byes finalizing at generation time do **not**
count as locking the bracket; only a human-entered result does.

### Interpretation call — the "dropdown (consolation)" format variant

The spec calls for a format dropdown offering standard double elimination
plus "the dropdown (consolation) variant." The consolation bracket's exact
shape (how many placement games, how it's seeded, whether it's single or
double elimination itself) isn't specified precisely enough to build
correctly without guessing at league-specific convention. The format
dropdown exists in the bracket-builder UI as instructed, but selecting the
consolation option currently falls back to standard double elimination with
an inline note explaining that. **Question for JD/Joey:** what should the
consolation bracket actually look like for early losers? Once answered,
`lib/bracket/structure.js` is the only file that needs a second code path —
the DB schema, propagation, and UI already treat `format` as a stored,
future-relevant field.

## Scorekeeper door (stage two)

Lives at `/scorekeeper` — **not linked from the nav**, direct URL only, and
disallowed in `robots.js` so it doesn't get indexed. Phone-first, PIN not
password (director's call, not JD's — a shared operational PIN for whoever's
running the tournament, not per-user accounts).

- **Auth**: `POST /api/scorekeeper/auth` checks the PIN against a bcrypt
  hash in `settings`, then sets an HMAC-signed cookie (`lib/scorekeeper-
  auth.js`) — stateless, no session table, 12-hour expiry. Every
  scorekeeper write route calls `requireScorekeeperSession()` first.
- **Brute-force protection** (`lib/scorekeeper-throttle.js`, Catmull's
  finding 2026-07-21): 15 rapid wrong-PIN guesses used to all return 401
  with no backoff — a short PIN is brute-forceable in minutes otherwise.
  Now backed by a Postgres table + a `for update`-locking function
  (`check_and_record_scorekeeper_attempt` in `schema.sql`) so the counters
  are correct even under Vercel's auto-scaled parallel invocations — plain
  in-memory counters would reset per instance and stop nothing. Two scopes:
  per-IP (5 fails / 15 min triggers escalating lockout: 1, 5, 15, 60, 240
  minutes) and a `global` scope with the same schedule, which catches a
  distributed attack spread across many IPs — there's one shared PIN, not
  per-user accounts, so an account-wide backstop is the correct second
  layer. The PIN itself stays short and simple (directors are
  non-technical, per spec) — the throttle is the actual defense, not PIN
  length. `/api/scorekeeper/change-pin` gets the same protection (same
  bcrypt-compare attack surface).
- **Changing the PIN**: once signed in, `POST /api/scorekeeper/change-pin`
  with the current PIN + a new 4-8 digit PIN. No UI button for this yet
  (API only) — add one if Joey wants to rotate it without asking JD/Marcus.
  **The initial PIN was generated randomly and is not written anywhere in
  this repo** — it was reported once, out of band, in the build handoff.
  If it's lost, generate a new hash and update the `settings` row directly
  via the Supabase SQL runner (see `lib/scorekeeper-auth.js`'s `setPin`
  for the exact hashing call).
- **Bracket builder + score entry**: `/scorekeeper/division/[divisionId]`
  — generate the bracket, edit slots while draft, enter scores (big number
  inputs), reassign field/time on any game anytime. Team names for the
  slot-editor dropdowns come from `registrations.team_name` — the one
  field that ever leaves that table for this purpose, read server-side
  only, same pattern the rest of the site already uses for placements.
- **Placements + photos**: once a division's bracket produces a champion
  (`lib/bracket/status.js`), a "Record Champion & Runner-Up" panel appears.
  Photos are compressed client-side (canvas resize to 1000px, JPEG 0.7)
  before upload — keeps payloads well under Vercel's request-body limit and
  matches the spec's "compressed client-side" instruction.

## Environment variables

See `.env.example`.

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe in the browser bundle, RLS-gated.
- `SUPABASE_SERVICE_ROLE_KEY` — **no `NEXT_PUBLIC_` prefix, on purpose**.
  Next.js only inlines `NEXT_PUBLIC_*` vars into client bundles; this one
  must never be renamed to start with that prefix.
- `SCOREKEEPER_SESSION_SECRET` — HMACs the scorekeeper session cookie.
  Rotating it instantly logs out every active scorekeeper session (harmless
  — they just re-enter the PIN).

No email/SMS config exists on purpose (see "No outbound comms" above).

## Visual identity

Set by Lacy (2026-07-21, with cosmetic fixes 2026-07-21) — she rules the
render, don't restyle casually:
- Navy masthead, eagle logo at left, name in white, thin red bar underneath
  (the one decorative use of red). The wordmark shrinks and wraps instead
  of truncating on narrow phones — no ellipsis.
- Red is reserved for the actual register/sign action on the **public**
  site (the nav "Register" button, the homepage CTA, "Submit Registration,"
  each signer's own "Sign" button). Everything else clickable there is a
  navy underline — no red hovers, no red "remove" buttons. The scorekeeper
  door (an internal tool, not part of the public storefront) uses navy for
  all of its actions, including score submission — red stays scoped to the
  public register/sign moment specifically, so the scarcity rule doesn't
  dilute.
- The season poster is the homepage hero: framed like a flyer pinned to a
  board (`.poster-frame` in `globals.css` — thin border, slight shadow,
  never cropped, never behind text). A small "schedule coming soon" note
  sits above it when there's no confirmed date, and the placeholder/
  reference version of the hero (no live date yet) renders noticeably
  smaller and quieter than a real confirmed event would.
- One display face (`Anton`, via `next/font/google`, self-hosted at build
  time) used only for tournament names — every other heading stays plain
  bold. Don't spend the display face on page titles or section headers.
- Section dividers are `.chalk-line` / `.chalk-panel` (a textured
  white-on-tan rule) instead of boxed cards with borders and shadows. The
  registration form's input surfaces (`.form-panel`) are the one exception —
  a form needs a contained surface, that's tool chrome, not display content.
- Results (once photos exist) show champion + runner-up side by side per
  division with plain captions underneath. Empty states read "No results
  yet — check back after the next tournament," not generic filler.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the Supabase keys + a session secret
npm run dev
```

## Deploy

Push to `main` on GitHub (`afasoftballutah` account) — Vercel is **not**
yet Git-connected (see `known-issues.md` KI-022 in the power-desktop repo),
so this doesn't auto-deploy today. Manual deploy: `vercel --prod` with the
Vercel CLI logged into the league's account.

## What's built vs. deferred

**Built:** Home, Tournaments, Rules, Register (digitized waiver, per-person
signed PDF, no outbound comms), the bracket builder (generate/edit/lock,
byes, GF2 decider), the scorekeeper door (PIN auth, score entry, field/time
reassignment, champion/runner-up + photos). All public pages served from
the Vercel CDN with ISR (`revalidate = 30` seconds); the scorekeeper tool
itself is always dynamic (never cached).

**Deferred:**
- The "dropdown (consolation)" bracket format — see the interpretation
  call above; needs a topology answer from JD/Joey first.
- Payments (registration form is structured so this can drop in without a
  redo).
- Admin panel for "who gets notified of what" — the moment any outbound
  comms are wanted, that's the feature to build; nothing sends today.
- A UI for changing the scorekeeper PIN (API exists, no button yet).
- The official rules doc from Joey (the site shows a general placeholder
  summary — real 2026 tournament dates are in as of 2026-07-21).
