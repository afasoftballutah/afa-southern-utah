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

## Structure

```
app/
  page.js                    Home — next tournament + last results
  tournaments/page.js        Season list
  tournaments/[slug]/page.js Tournament detail + results
  rules/page.js               Static rules (edit lib/content/rules.js)
  register/page.js            Registration entry point (server component,
                               fetches tournament/division list)
  api/register/route.js       POST handler: saves registration, builds the
                               signed PDF, uploads it, emails the director
  api/keepalive/route.js      Daily cron target — keeps the free Supabase
                               project from auto-pausing
components/
  RegistrationForm.js          Client-side multi-step registration wizard
  SignaturePad.js              Draw-on-screen signature capture
lib/
  supabase.js                  Two clients: public (anon, RLS-gated) and
                                service (service_role, server-only, never
                                import from a Client Component)
  data.js                       Public read queries + formatting helpers
  waiver.js                     Release text (verbatim from the official
                                form) + field limits
  pdf/build-waiver-pdf.js       Builds the signed PDF replica of the form
  email/send-registration-email.js  Sends the signed PDF to the director
                                     via the league's own Gmail (SMTP)
  content/rules.js               Plain-text rules content — edit by hand
supabase/
  schema.sql                    Full schema + RLS policies + grants
  seed-placeholder.sql          2023 season data, loaded as placeholder
vercel.json                     Daily cron config
```

## Data model

- `tournaments`, `divisions`, `placements` — public data, no PII. RLS: SELECT
  granted to `anon`/`authenticated`, no write policies for anyone but
  `service_role`.
- `registrations` — PII (addresses, signatures, minors' birth dates). RLS is
  enabled with **zero policies**, and no GRANT to `anon`/`authenticated` at
  all. Only `service_role` (used exclusively inside `app/api/register/route.js`,
  never shipped to the browser) can read or write it. This was verified live:
  an anon-key request against `/rest/v1/registrations` returns
  `permission denied for table registrations` (42501).
- Storage buckets: `waivers` (private — signed PDFs), `posters` (public),
  `photos` (public — champion/runner-up photos, stage two).

**Important Supabase-project-specific gotcha**: this project's Data API
posture is "auto-expose new tables OFF" — which turned out to mean new
tables get **no role grants at all** by default, for `anon`,
`authenticated`, AND `service_role`. If you add a new table, you must
explicitly `GRANT SELECT` (or whatever's appropriate) to the roles that need
it, or every query — including from the service-role server code — will
fail with `permission denied`. This bit the build once; see
`supabase/schema.sql`'s grant statements for the pattern to copy.

## Registration → signed PDF → email flow

1. Manager fills out the multi-step form at `/register` (tournament,
   division, team info, manager info, players, coaches, release + signature).
2. `POST /api/register` saves the registration row (service-role client,
   bypasses RLS by design — this is the one legitimate writer).
3. Builds a PDF (`lib/pdf/build-waiver-pdf.js`, using `pdf-lib`) that
   replicates the official form: header, verbatim release text, team/manager
   info, the manager's drawn signature image, and player/coach tables.
4. Uploads the PDF to the private `waivers` bucket, path `{registrationId}.pdf`.
5. Emails the director a copy via the league's own Gmail account (SMTP,
   `nodemailer`). If email fails, the registration is **not** rolled back —
   the record and PDF are already safely stored either way. Failure reason
   is recorded on the row (`email_status`, `email_error`).

### Interpretation call — read this before changing signature handling

The official paper form has a signature column for every player and coach,
not just the manager. A phone-first, single-sitting digital form can't
reasonably collect 18 separate hand-drawn signatures in one session. **This
build has the team manager sign once**, authorizing the whole roster; the
generated PDF prints "on file (mgr signed)" in every player/coach signature
cell instead of a blank or a forgery. This is a judgment call, not something
in the spec — flagged for JD/Joey to confirm. If stricter per-player
signing is wanted later, the stage-two path is individual signing links
sent to each player, which is a real feature, not a tweak.

## Environment variables

See `.env.example`. Two are easy to get backwards, so read carefully:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe in the browser bundle, RLS-gated.
- `SUPABASE_SERVICE_ROLE_KEY` — **no `NEXT_PUBLIC_` prefix, on purpose**.
  Next.js only inlines `NEXT_PUBLIC_*` vars into client bundles; this one
  must never be renamed to start with that prefix.

### Setting up director email (one-time, requires the Gmail password)

The league's Gmail account (`afasoftballutah@gmail.com`) sends the signed
waiver PDFs. This needs a Google **App Password**, not the regular Gmail
password:

1. Sign into `afasoftballutah@gmail.com`.
2. Turn on 2-Step Verification (Google Account → Security), if not already on.
3. Google Account → Security → App Passwords → create one for "Mail".
4. Set `GMAIL_USER=afasoftballutah@gmail.com` and
   `GMAIL_APP_PASSWORD=<the 16-character app password>` in Vercel's
   Environment Variables (Project Settings → Environment Variables), and
   redeploy.
5. Set `DIRECTOR_EMAIL` to whichever address should receive registrations.
   The placeholder value pulled from the 2023 poster
   (`jesusalou@yahoo.com`) is unverified — confirm with Joey before relying
   on it.

Until this is set, registrations still save correctly (PII is safe in
Supabase, PDF is generated and stored) — only the email copy to the
director won't send. `email_status` on the row will read `failed`.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the Supabase anon key + service role key
npm run dev
```

## Deploy

Already deployed — see the handoff doc for the live URL. To redeploy:
push to `main` on GitHub (`afasoftballutah` account) and Vercel
auto-deploys. Manual deploy: `vercel --prod` with the Vercel CLI logged
into the league's account.

## What's built (stage one) vs. deferred (stage two)

**Built:** Home, Tournaments (season list + detail + results), Rules
(placeholder content), Register (digitized waiver, signed PDF, email to
director), all public pages served from the Vercel CDN with ISR
(`revalidate = 30` seconds).

**Deferred to stage two** (see `afa-spec.md`):
- Scorekeeper door (PIN-gated score entry, photo upload at final score)
- Bracket builder (generator + manual drag-to-edit + lock-on-first-score)
- Payments (form is structured so this can drop in without a redo)
- Real 2026 tournament dates and the official rules doc (both pending from
  Joey — the site currently shows clearly-labeled 2023 data as a reference)
