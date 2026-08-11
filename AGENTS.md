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
