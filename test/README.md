# Tests

```
npm test                  # logic + design system; route tests skip without a server
npm run build && npx next start -p 3210 &
BASE=http://localhost:3210 npm test   # all 35
```

No dependencies and no build step. Node's own test runner, a 15-line resolve
hook so tests can import `@/lib/...` the way the app does, and fixtures pulled
from the real Heat Stroker rather than invented.

## What is covered, and why each one exists

Every assertion here is a bug that actually shipped and had to be spotted by
eye. That is the selection rule — not coverage.

**`bracket.test.mjs`** — an if-game the undefeated team made unnecessary. Gold
17 is moot, Silver 19 and Bronze 17 are not. Includes the regression where
mootness was computed from unplayed rows only, which hid the very game the
test needs and put a game that will never happen under "Next".

**`elimination.test.mjs`** — who is out, who won, who is neither. A moot
if-game counting as pending kept BOTH finalists looking like they had a game
left, so Gold produced no champion and the runner-up was never marked out. A
pool loss must never eliminate anyone. A team with a slot downstream still
waiting on their game is not out, they are about to be placed.

**`design-system.test.mjs`** — read statically off `globals.css`:
- the display face never asks for a weight it does not have (Anton ships one;
  asking for 700 synthesises a bold and smears it — twice shipped)
- the shared face recipe carries no colour (colour in it turned the tournament
  name navy-on-navy inside the navy card)
- component classes sit in `@layer components` (unlayered, they beat Tailwind's
  utilities and `.t-label` ate a chip's metal tint)
- the retired chalk motif has not come back

**`quickscores.test.mjs`** — the parsers, against saved copies of the real
pages. If QuickScores changes their markup these fail here rather than by
quietly finding zero games, which is how five results sat missing while the
hourly run reported "Already up to date".

**`routes.test.mjs`** — every page renders, no server-component throw, the
calendar feed is `inline` and subscribable, no ICS line exceeds RFC 5545's 75
octets, and both sync endpoints refuse an unauthenticated caller.

## Fixtures

`fixtures/games-{gold,silver,bronze}.json` are the real Heat Stroker brackets.
Refresh them from the live database if the shape changes — and note they need
`scheduled_time` and `division_id`, which an earlier capture omitted and which
made every elimination test fail for a reason that had nothing to do with the
code.
