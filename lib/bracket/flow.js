// Where a game's teams come from and where they go next, for the corners
// of a schedule-timeline pill (JD, 2026-11-09: "a small Wx, Wy in the top
// left and right corners … the games the loser goes to in lower left and
// winner goes to in lower right").
//
// Read only from the bracket's own links (team1/2_source_game_id +
// source_result) — the same links the placing logic walks — never from
// game numbers or a drawing. Nothing is invented: a slot with no feeder
// game shows its seed if the data has one, else nothing; a loser with no
// next game shows the place it locks in only when the placing logic is
// certain (lib/bracket/placing.js, structural mode), "pool" when a
// three_gg_hybrid loser is always 0–2 and goes to the survivor pool
// (lib/bracket/lives.js), "out" when nothing can bring the loser back,
// and nothing when that isn't certain.
//
// The championship follows the if-necessary rule (lib/bracket/if-game.js,
// lib/bracket/resolve.js): in the first final the winners-bracket team
// (the slot fed by the winners-side game's winner) is champion if it wins;
// if it loses, both teams play the if-game. The if-game's winner is
// champion and its loser 2nd. A one-game final: winner champion, loser 2nd.

import { findIfGames, isIfGameShape } from "./if-game";
import { eliminationPlacings } from "./placing";
import { loserAlwaysZeroTwo, SURVIVOR_POOL_FIELD } from "./lives";
import { scheduleSlotLabel } from "./for-drawn-bracket";

const SUPPORTED = new Set(["double_elim", "three_gg_hybrid"]);
const res = (g, s) => String(g[`${s}_source_result`] ?? "winner").toLowerCase();

/**
 * Map game id → {
 *   from: [slot1, slot2]  each { short: "W12" | "L7" | "#3", words } or null,
 *   loser: { short, words } | null,   // bottom-left
 *   winner: { short, words } | null,  // bottom-right
 * }
 */
export function gameFlow(games, format = null) {
  const out = new Map();
  const fmt = format ?? "double_elim";
  const all = (games ?? []).filter((g) => g && !g.is_bye && g.status !== "cancelled");
  const byId = new Map(all.map((g) => [g.id, g]));
  const num = (g) => (scheduleSlotLabel(games, g) ?? "").replace(/^G/, "") || null;

  const winnerTo = new Map();
  const loserTo = new Map();
  for (const g of all) {
    for (const s of ["team1", "team2"]) {
      const src = g[`${s}_source_game_id`];
      if (!src) continue;
      const map = res(g, s) === "loser" ? loserTo : winnerTo;
      if (!map.has(src)) map.set(src, []);
      map.get(src).push(g);
    }
  }

  const ifFrom = new Map(); // first final id → if-game
  for (const f of findIfGames(all)) {
    const ifGame = all.find((g) => isIfGameShape(g) && g.team1_source_game_id === f.fromId);
    if (f.fromId && ifGame) ifFrom.set(f.fromId, ifGame);
  }

  const places = SUPPORTED.has(fmt) ? eliminationPlacings(games, fmt, { structural: true }) : new Map();
  const hybrid = fmt === "three_gg_hybrid";

  for (const g of all) {
    const from = ["team1", "team2"].map((s) => {
      const src = byId.get(g[`${s}_source_game_id`]);
      if (src) {
        const n = num(src);
        if (!n) return null;
        const lost = res(g, s) === "loser";
        return { short: `${lost ? "L" : "W"}${n}`, words: `${lost ? "Loser" : "Winner"} of Game ${n}` };
      }
      const seed = g[`${s}_seed_ref`];
      if (seed) return { short: String(seed), words: `Seed ${seed}` };
      return null;
    });

    let winner = null;
    let loser = null;
    const ifGame = ifFrom.get(g.id);
    const nextW = winnerTo.get(g.id) ?? [];
    const nextL = loserTo.get(g.id) ?? [];

    if (ifGame) {
      const n = num(ifGame);
      winner = { short: `🏆/${n}`, words: `Winner → champion if the winners-bracket team wins, otherwise Game ${n}` };
      loser = { short: `2nd/${n}`, words: `Loser → 2nd if it's the losers-bracket team, otherwise Game ${n}` };
    } else if (isIfGameShape(g) || (g.bracket_side === "final" && nextW.length === 0)) {
      winner = { short: "🏆", words: "Winner → champion" };
      loser = { short: "2nd", words: "Loser → 2nd place" };
    } else {
      if (nextW.length === 1) {
        const n = num(nextW[0]);
        if (n) winner = { short: n, words: `Winner → Game ${n}` };
      }
      if (nextL.length === 1) {
        const n = num(nextL[0]);
        if (n) loser = { short: n, words: `Loser → Game ${n}` };
      } else if (nextL.length === 0 && g.field !== SURVIVOR_POOL_FIELD && g.field !== "Re-entry") {
        const place = places.get(g.id);
        if (place) loser = { short: place.label, words: `Loser → out, ${place.label}` };
        else if (hybrid && loserAlwaysZeroTwo(g, byId)) loser = { short: "pool", words: "Loser → survivor pool (0–2)" };
        else if (!hybrid && SUPPORTED.has(fmt)) loser = { short: "out", words: "Loser → out" };
      }
    }
    out.set(g.id, { from, winner, loser });
  }
  return out;
}
