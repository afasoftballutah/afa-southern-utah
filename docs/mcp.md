# AFA tournaments in your own AI assistant (MCP)

The site has a **read-only** MCP server. Plug it into Grok, Claude, ChatGPT or
Cursor and ask things like "what's on Pioneer F2 Sunday?", "when does Oddballs
play next and where do they go if they lose?", or "who won Coed Rec?".

- **Server URL:** `https://afa-southern-utah.vercel.app/api/mcp` (Streamable HTTP)
- **Auth:** none. It serves only what the public site already shows: team
  names, times, fields, scores and places. Never emails, phones, managers or
  contacts, and nothing can be changed through it.
- **Limit:** 60 requests a minute per address.

## Tools

| Tool | What it answers |
|---|---|
| `list_tournaments` | Public tournaments with slug, dates, venue, region, divisions, and phase (Upcoming / Happening now / Finished, from the dates in the event's own zone; a past event is never upcoming). |
| `get_schedule` | A tournament's games in time order; filter by day (`2026-11-15` or `Sun`), field (`Pioneer F2` or `P2`), division, team. |
| `get_game` | One game by division + number (`Coed E`, `13`) or id: teams, time, field, status, score, feeders, where the winner and loser go next, the if-necessary rule on a final. |
| `get_team_path` | A team's results, record, place or champion, next game (opponent or "Winner G9"), and where a win or loss sends it. A team is its name within a division (pool play and the bracket it moves to count as one). |
| `get_division` | Bracket standings (W-L, finishing place, champion), pool standings (wins, then fewest runs allowed), games played/left, next game, bracket link. |
| `get_now_next` | At a time (default now): games underway, next to start, each field's next game, just finished, games left today, scores not in yet. |
| `get_recent_results` | Latest final scores, newest first; optional division. |

Same display rules as the site: an undecided slot reads `Winner G9` / `Loser G3`
(TBD only when nothing feeds it), times are in the tournament's zone with the
zone named away from Mountain league time (`Sun 4 PM PST` at Worlds), whole
hours never show `:00`, and `H`/`P` fields read Hunter/Pioneer.

## Connect

- **Grok / Grok Bot:** add a custom (remote) MCP connector with the URL above,
  transport Streamable HTTP, no header.
- **Claude Code:** `claude mcp add --transport http afa https://afa-southern-utah.vercel.app/api/mcp`
- **Claude Desktop:** Settings → Connectors → Add custom connector → the URL above.
- **ChatGPT:** Settings → Connectors → Advanced → Developer mode → Create; the URL above, no authentication.
- **Cursor:** `~/.cursor/mcp.json`:
  ```json
  { "mcpServers": { "afa": { "url": "https://afa-southern-utah.vercel.app/api/mcp" } } }
  ```

## Code

`app/api/mcp/route.js` (transport, rate limit), `lib/mcp/tools.js` (tools and
server instructions), `lib/mcp/game-view.js` (one game, using the site's own
helpers), `lib/mcp/data.js` (the same anon reads as the pages). Tests:
`test/mcp.test.mjs` (fixture, in-memory client) and `test/mcp-live.test.mjs`
(over HTTP; `AFA_MCP_URL=http://localhost:3000/api/mcp npm test`).
