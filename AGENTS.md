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

## Other hard constraints (from project README)

- **No outbound comms** — no email, SMS, or push from this codebase
- **Service-role for PII** — players, rosters, umpires are not public tables
- Ship to main with prod migrations when schema changes
