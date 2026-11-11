// MCP Apps view for get_game (JD 2026-11-10: "give it a shot but break it
// into pieces so I can be sure we are building the right thing" — piece 1).
//
// An MCP Apps host (Claude, ChatGPT, VS Code, …) draws this card inside the
// chat when get_game runs; every other client still reads the unchanged
// JSON text. The card is the site's opened game pill (components/
// ScheduleTimeline.js Details): division / W·L·★ Final / Game N tags in the
// division's color, the matchup board, where the loser (red) and winner
// (green) go next with day, time and field, the game's time and field, and
// "View on site" (the division page opened on that game).
//
// Spec: io.modelcontextprotocol/ui 2026-01-26. The view is one
// self-contained HTML document (lib/mcp/views.js: inline CSS and a small
// postMessage bridge, nothing loaded from anywhere), so the default
// block-all CSP is enough and nothing is declared in _meta.ui.csp. It draws
// only from the tool's structuredContent: the same public fields as the
// text (never contacts).

import { DIVISION_TONES } from "@/lib/division-tones";
import { divisionTone, bracketPill, nextStep, fieldDisplayName, gameTitle } from "@/lib/schedule-timeline";
import { gameView, whenLabel } from "./game-view";
import { viewHtml } from "./views";

export const GAME_CARD_URI = "ui://afa/game";

/** "Sun 4 PM PST" → "Sun 4 PM": the card's Time row already names the zone. */
const noZone = (s) => (s ? s.replace(/\s+(?!AM$|PM$)[A-Z]{2,5}$/, "") : s);

/** "Thu 4 PM · Hunter F3" for game N in the same division, or null. */
export function whereOf(rows, row, n, tz) {
  if (!n) return null;
  const to = rows.find((r) => r.divisionId === row.divisionId && r.label === `G${n}`);
  if (!to?.scheduledTime || !to?.field) return null;
  return `${noZone(whenLabel(to.scheduledTime, tz))} \u00b7 ${fieldDisplayName(to.field)}`;
}

/** One side of "where the teams go": what the site's NextValue shows. */
function step(x, role, rows, row, tz) {
  const s = nextStep(x, role);
  if (!s) return null;
  if (s.champion) return { champion: true };
  if (s.out) return { out: true, place: s.place ?? null };
  if (s.place) return { place: s.place };
  if (s.next) return { next: s.next, where: whereOf(rows, row, x.next, tz) };
  return { text: s.text };
}

/**
 * What the card draws, from a getTournamentSchedule row and its schedule
 * (for where the next games are). Public fields only.
 */
export function gameCard(row, rows, tz, { siteUrl, slug }) {
  const g = gameView(row, tz);
  const tone = DIVISION_TONES[divisionTone(row.divisionName)] ?? DIVISION_TONES.other;
  const side = bracketPill(row);
  const final = Boolean(row.isFinal || row.status === "final");
  const n = /^G(\d+)$/.exec(row.label ?? "")?.[1] ?? null;
  const board = [1, 2].map((i) => {
    const score = row[`score${i}`];
    const other = row[`score${i === 1 ? 2 : 1}`];
    const label = g[`team${i}`];
    const feed = /^(Winner|Loser) (G\d+)$/.exec(label ?? "");
    return {
      ...(feed ? { from: feed[1], game: feed[2] } : { team: label ?? "TBD" }),
      score: final && typeof score === "number" ? score : null,
      won: final && typeof score === "number" && typeof other === "number" && score > other,
      place: row[`team${i}Place`] ?? null,
    };
  });
  const ifN = /(\d+)\s*$/.exec(String(row.flow?.ifGame ?? ""))?.[1] ?? null;
  const base = slug && row.divisionId ? `${siteUrl}/tournaments/${slug}/division/${row.divisionId}` : `${siteUrl}/tournaments/${slug ?? ""}`;
  return {
    division: row.divisionName ?? null,
    tone: { bg: tone.bg, ink: tone.ink, solid: tone.solid },
    side: side ? { text: side.text, label: side.label, gold: Boolean(side.gold) } : null,
    title: gameTitle(row.label),
    status: g.status,
    board,
    loser: step(row.flow?.loser, "loser", rows, row, tz),
    winner: step(row.flow?.winner, "winner", rows, row, tz),
    ifGame: ifN ? { title: `Game ${ifN}`, where: whereOf(rows, row, ifN, tz) } : null,
    rule: row.flow?.rule ?? null,
    time: g.when,
    field: g.field,
    url: n && row.bracketSide !== "pool" ? `${base}?game=${n}` : base,
  };
}

export const GAME_CARD_HTML = viewHtml({
  title: "AFA game",
  appName: "AFA game card",
  js: String.raw`
  function render(sc) {
    if (!sc.card) return false;
    root.appendChild(cardEl(sc.card));
  }
`,
});
