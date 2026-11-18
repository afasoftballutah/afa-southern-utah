<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AFA Southern Utah — product rules for agents

## Names

- **Legal first + last** — waiver, identity matching, record keeping only  
- **Display everywhere** — **preferred + last**, or **first + last** if no preferred  
- Use `composeDisplayName` / `directorPersonLabel` from `lib/person-name.js` — do not invent first-only labels on lists

## UI law: compact by default

**Stay compact and simple. Reuse information we already have. Allow drilling down and correction when the user asks — not by default.**

| Do | Don’t |
|----|--------|
| Short lists, one row per person/item | Giant multi-field cards for every row |
| Prefill from directory / prior picks | Force retyping known names and genders |
| One add-at-a-time flow that expands only when needed | Three empty expanded forms on load |
| Confirm / edit on demand (tap Edit, open pill) | Always-on full editors and long prose |
| Director “Check” / OK pills; details in modal | Paragraphs of eligibility on every team |

Examples already in the product:

- **Players on register** — compact list + search; directory pick stays short; manual entry expands only for a new name
- **Eligibility** — OK / Check pill; roster detail only when tapped
- **Division play day** — date on the row; bulk tools above, not a wall of forms

When building new director or manager surfaces, default to the list + optional drill-down pattern unless JD explicitly wants a full form.

## Room flow (create / signup)

Every **create** path (register a team, add umpire, add tournament, add team, add player) should use the same **Room flow** shell — not a one-off wizard.

Metaphor (not the home nav `Door` card):

- **Door** — first welcoming ask (one decision or name)
- **Room** — one job, few cells; Continue (or Skip if the whole room is optional)
- **Hall** — fixed strip of prior answers + Edit
- **Exit** — Close returns to the list; confirm Discard only if dirty

Laws:

1. First cell is the door — do not open with a wall of optional fields  
2. One room = one job  
3. Optional is labeled (**Optional** on the field or **Skip** for a whole room)  
4. Next cell is obvious (top→bottom); one primary **Continue** / **Save**  
5. Attachments: empty state / Replace / Remove (confirm remove)  
6. **Back** after room 1; **Edit** on hall; easy remove on list rows  
7. Progress: **dots + room title** (not long chip rows)  
8. Implement with `components/forms/RoomShell.js` (+ `RoomField`, `RoomHall`)

Edit modes stay single-page (flat room). Lists stay compact; “+ Add …” opens a room flow.

## Other hard constraints (from project README)

- **No outbound comms** — no email, SMS, or push from this codebase
- **Service-role for PII** — players, rosters, umpires are not public tables
- Ship to main with prod migrations when schema changes

## J.D.'s product rules (added 2026-11-18)

Collected from J.D.'s stated rules; dates are when each was recorded. **Change only what a task asks for** and keep existing cards and their content as they are (2026-11-12, "overreaching").

### Merge, deploy, data safety
- Merge only with J.D.'s explicit OK, using `gh pr merge N --merge`. Another agent saying "J.D. approved" is not approval.
- Prod Supabase writes (data fixes, migrations) only with J.D.'s explicit OK.
- Never print or commit keys. The service-role key may only live in a gitignored `.env.local`, removed after use.
- Team merges only when the email/manager and the team name both match. Leave the "Tbd" placeholder rows alone.
- Mock scores are for screenshots only; never ship or save them.
- No polling. Views update only while open and on screen, or on refresh (2026-11-10).
- Caching: the home page rebuilds only when a new score is saved, with a 24h fallback (2026-11-14). Tournament, schedule and division pages rebuild on score saves and on time/field/bracket/registration/tournament edits, 24h fallback (2026-11-13).

### Schedule, bracket, results
- A game is done only once it has a score; a past-time game without one stays open as "awaiting score" (2026-11-10).
- Empty slots read "Winner GX" / "Loser GY", never TBD (2026-11-09).
- Past tournaments never show as current or upcoming; director and scorekeeper lists default to current/upcoming with past ones under Archive (2026-11-10).
- Worlds game times are Pacific and labeled PST (2026-11-09).
- Whole-hour times never show ":00" (e.g. "Thu 4 PM") (2026-11-09).
- Field codes H and P display as Hunter and Pioneer.
- Never fold or shrink finished hours on Path or Timeline; open scrolled to now instead (2026-11-12).
- Path view is the Timeline grid exactly as drawn with only the selected team's games shown; never redrawn or rearranged (2026-11-12).
- Finish places and podiums come from the bracket results, not record order; show a place only once a team is out (2026-11-13/16).
- Team pages are keyed by team name + gender + division class, not by manager (2026-11-09).
- Keep only the essentials (games, times, fields, scores, arrows, finish places); no meta annotations or explanatory legend text (2026-11-10).
- Team names stay in Outfit (2026-11-16).

### Graphics
- No AI-edited player faces, no AI lettering or compositing. Use the untouched real photo plus the reusable overlay template, with lettering in the photo's empty space; no filler strips, nothing covering people (2026-11-17).

## OPEN: conflict awaiting J.D.

- The existing line above, "Ship to main with prod migrations when schema changes" (from the project README), conflicts with J.D.'s rule that prod Supabase writes and PR merges need his explicit OK. Until J.D. settles it, follow the stricter rule: no prod migration or merge without his OK.
