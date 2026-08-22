// Map engine games (bracket_side / structure round) → DrawnBracket rows.
// DrawnBracket’s contract: `round` is the paper game number (G1, G2…), and
// empty slots use "Winner of Game N" / "Loser of Game N" (or a real name).

import { assignGameNumbers, slotDisplay } from "./tree";
import { generate3GG } from "./three-game-guarantee";
import { SURVIVOR_FIELD, GUARANTEE_NET_FIELD } from "./structure";

/**
 * @param {Array} games full main or consolation group (include bye shells for walk-through)
 * @returns {Array} contested games with paper `round` + DrawnBracket slot text
 */
/** True when each game's `round` is a unique paper G# (hand-built / remapped). */
export function usesPaperGameNumbers(games) {
  const list = (games ?? []).filter(
    (g) => g && g.status !== "cancelled" && !g.is_bye
  );
  if (list.length < 2) return list.length === 1;
  return new Set(list.map((g) => g.round)).size === list.length;
}

/**
 * Schedule / calendar game number. Always a G# — never "Winners R4".
 * Unique `round` values are already paper numbers (hand-built / remapped
 * 3GG). Shared structure rounds get assignGameNumbers.
 */
export function scheduleSlotLabel(games, game) {
  if (!game) return null;
  if (usesPaperGameNumbers(games) && game.round != null) return `G${game.round}`;
  const n = game.id != null ? assignGameNumbers(games).get(game.id) : null;
  if (n != null) return `G${n}`;
  if (game.round != null) return `G${game.round}`;
  return null;
}

export function forDrawnBracket(games) {
  const all = (games ?? []).filter((g) => g && g.status !== "cancelled");
  const byId = new Map(all.map((g) => [g.id, g]));
  const nums = assignGameNumbers(all);

  return all
    .filter((g) => !g.is_bye && nums.has(g.id))
    .map((g) => {
      const out = { ...g, round: nums.get(g.id) };
      for (const side of ["team1", "team2"]) {
        if (out[`${side}_name`]) continue;
        const { text, resolved } = slotDisplay(g, side, nums, byId);
        if (!text || text === "—" || text === "awaiting team") continue;
        if (resolved) {
          out[`${side}_name`] = text;
        } else {
          const m = /^([WL])(\d+)$/.exec(text);
          out[`${side}_name`] = m
            ? `${m[1] === "L" ? "Loser" : "Winner"} of Game ${m[2]}`
            : text;
        }
      }
      return out;
    })
    .sort((a, b) => a.round - b.round);
}

/**
 * Build in-memory engine rows from structure.js matches (no DB).
 * @param {object} structure { matches }
 */
export function gamesFromStructure(structure) {
  const matches = structure.matches ?? structure;
  const all = matches.map((m, i) => ({
    id: `struct-${i}`,
    bracket_side: m.side,
    round: m.round,
    slot: m.slot,
    status: "pending",
    is_bye: false,
    field: m.field ?? null,
    team1_name: m.team1?.type === "team" ? m.team1.name : null,
    team2_name: m.team2?.type === "team" ? m.team2.name : null,
    team1_source_game_id: null,
    team2_source_game_id: null,
    team1_source_result: null,
    team2_source_result: null,
    team1_is_open_entry: m.team1?.type === "open",
    team2_is_open_entry: m.team2?.type === "open",
    team1_score: null,
    team2_score: null,
    _m: m,
  }));
  const byKey = new Map(all.map((g) => [`${g.bracket_side}:${g.round}:${g.slot}`, g]));
  for (const g of all) {
    for (const side of ["team1", "team2"]) {
      const t = g._m[side];
      if (t?.type === "ref") {
        const f = byKey.get(`${t.side}:${t.round}:${t.slot}`);
        if (f) {
          g[`${side}_source_game_id`] = f.id;
          g[`${side}_source_result`] = t.result;
        }
      }
    }
    delete g._m;
  }
  return all;
}

/**
 * DrawnBracket games straight from generate3GG (Claude/JD sheet).
 * Paper G# = game id; slots are team names or "Winner/Loser of Game N".
 *
 * @param {string[]} teamNames seed order (#1 first)
 * @param {{ reentry?: "reference"|"strict" }} [opts]
 */
export function drawnGamesFrom3GG(teamNames, opts = {}) {
  const n = teamNames.length;
  const { games } = generate3GG(n, opts);
  const byId = new Map(games.map((g) => [g.id, g]));

  function fieldFor(g) {
    if (g.bracket !== "net") return null;
    if (g.a.L != null && g.b.L != null) {
      const ga = byId.get(g.a.L);
      const gb = byId.get(g.b.L);
      if (ga?.bracket === "losers" && gb?.bracket === "losers" && ga.round === 1 && gb.round === 1) {
        return SURVIVOR_FIELD;
      }
    }
    return GUARANTEE_NET_FIELD;
  }

  function mapSide(bracket) {
    if (bracket === "final") return "final";
    if (bracket === "winners") return "winners";
    return "losers";
  }

  function slotLabel(ref) {
    if (ref.seed !== undefined) {
      return teamNames[ref.seed - 1] ?? `Seed ${ref.seed}`;
    }
    if (ref.W !== undefined) return `Winner of Game ${ref.W}`;
    if (ref.L !== undefined) return `Loser of Game ${ref.L}`;
    return null;
  }

  // Stable ids so source_game_id links work for DrawnBracket connectors
  const idForPaper = (paper) => `g${paper}`;

  return games.map((g) => {
    const row = {
      id: idForPaper(g.id),
      round: g.id, // paper game number
      slot: 0,
      bracket_side: mapSide(g.bracket),
      status: "pending",
      is_bye: false,
      field: fieldFor(g),
      team1_name: slotLabel(g.a),
      team2_name: slotLabel(g.b),
      team1_source_game_id: null,
      team2_source_game_id: null,
      team1_source_result: null,
      team2_source_result: null,
      team1_score: null,
      team2_score: null,
      team1_seed_ref: g.a.seed !== undefined ? `Seed #${g.a.seed}` : null,
      team2_seed_ref: g.b.seed !== undefined ? `Seed #${g.b.seed}` : null,
    };
    if (g.a.W !== undefined) {
      row.team1_source_game_id = idForPaper(g.a.W);
      row.team1_source_result = "winner";
    } else if (g.a.L !== undefined) {
      row.team1_source_game_id = idForPaper(g.a.L);
      row.team1_source_result = "loser";
    }
    if (g.b.W !== undefined) {
      row.team2_source_game_id = idForPaper(g.b.W);
      row.team2_source_result = "winner";
    } else if (g.b.L !== undefined) {
      row.team2_source_game_id = idForPaper(g.b.L);
      row.team2_source_result = "loser";
    }
    return row;
  });
}
