// Final placing for a team on the game that knocked it out (JD,
// 2026-11-09: "and when a team loses and is out, it shows their place").
//
// Derived from the bracket's own links and real results only. Where the
// answer depends on something that has not happened yet, or on a runtime
// rule the links don't show, the answer is "no placing" (null), never a
// best guess. A wrong "5th" sends a team home; a missing one costs nothing.
//
// The rule (standard double/single elimination):
//   * The championship game is the final whose winner feeds nothing
//     (lib/bracket/if-game.js championshipGameOf, which applies the
//     if-necessary rule). Its loser is 2nd, once the bracket is decided.
//   * Any other game whose LOSER feeds no game is an eliminating game.
//     Its "tier" is how many winner-links it is from the first final
//     (losers final = 1, the round before it = 2, ...).
//   * Every team out in tier d finishes behind the champion, the runner-up
//     and everyone out in a closer tier:
//         place(d) = 3 + (eliminating games in tiers 1..d-1)
//     and teams out in the same tier tie ("T-5th") when the tier has more
//     than one game.
//
// That count is only true if every eliminating game in tiers 1..d really
// knocks exactly one team out. A game can fail to:
//   * a walkover (one side can never be filled, or an open re-entry seat
//     that may stay empty) eliminates nobody;
//   * three_gg_hybrid: a team that is 0–2 after a game with no loser seat
//     goes to the survivor pool instead of going home
//     (lib/bracket/lives.js, lib/bracket/propagate.js).
// A decided game is checked against what happened; an undecided one must
// be certain by structure, or the placing is withheld. Survivor-pool and
// re-entry games are created at runtime outside the links, so their
// losers get no placing, and a division with a runtime re-entry game gets
// none at all. double_elim_consolation sends main-bracket losers on to a
// consolation bracket, so it gets none either.

import { championshipGameOf, findIfGames } from "./if-game";
import { isContestedGame } from "./tree";
import { SURVIVOR_POOL_FIELD, countMainRecord } from "./lives";

const RUNTIME_FIELDS = new Set([SURVIVOR_POOL_FIELD, "Re-entry"]);
const SUPPORTED = new Set(["double_elim", "three_gg_hybrid"]);

const decided = (g) =>
  g &&
  g.status === "final" &&
  g.team1_score != null &&
  g.team2_score != null &&
  g.team1_score !== g.team2_score;
// countMainRecord reads winner_slot; derive it from the score when absent.
const withWinner = (g) =>
  g.winner_slot || !decided(g)
    ? g
    : { ...g, winner_slot: g.team1_score > g.team2_score ? "team1" : "team2" };
const loserSlot = (g) => (g.team1_score > g.team2_score ? "team2" : "team1");

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/** "5th", or "T-5th" for a shared place. */
export function placeLabel(place, tied = false) {
  return `${tied ? "T-" : ""}${ordinal(place)}`;
}

/**
 * @param {Array} games one division's bracket games (DB rows)
 * @param {string|null} format brackets.format for its main group (null = double_elim, as propagation assumes)
 * @returns {Map<string, {slot: "team1"|"team2", team: string, place: number, tied: boolean, label: string}>}
 *   game id → the team that game knocked out, and where it finished
 */
export function eliminationPlacings(games, format = null) {
  const out = new Map();
  const fmt = format ?? "double_elim";
  if (!SUPPORTED.has(fmt)) return out;
  const hybrid = fmt === "three_gg_hybrid";

  const main = (games ?? []).filter(
    (g) => (g.bracket_group ?? "main") === "main" && !g.is_bye && g.status !== "cancelled"
  );
  if (main.some((g) => g.field === "Re-entry")) return out;
  const linked = main.filter((g) => !RUNTIME_FIELDS.has(g.field));
  const byId = new Map(linked.map((g) => [g.id, g]));

  const winnerTo = new Map();
  const loserFed = new Set();
  for (const g of linked) {
    for (const s of ["team1", "team2"]) {
      const src = g[`${s}_source_game_id`];
      if (!src) continue;
      const res = String(g[`${s}_source_result`] ?? "winner").toLowerCase();
      if (res === "winner") winnerTo.set(src, g.id);
      else loserFed.add(src);
    }
  }

  // Runner-up: loser of the deciding final, once there is a champion.
  const champGame = championshipGameOf(main);
  if (champGame && byId.has(champGame.id)) {
    const slot = loserSlot(champGame);
    const team = champGame[`${slot}_name`];
    if (team) out.set(champGame.id, { slot, team, place: 2, tied: false, label: placeLabel(2) });
  }

  // Roots: the first final (the source of an if-game), else any game whose
  // winner feeds nothing.
  const roots = new Set(findIfGames(linked).map((f) => f.fromId).filter(Boolean));
  for (const g of linked) if (!winnerTo.has(g.id)) roots.add(g.id);
  const tierOf = (id) => {
    let d = 0;
    let cur = id;
    const seen = new Set();
    while (!roots.has(cur)) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      cur = winnerTo.get(cur);
      if (!cur) return null;
      d += 1;
    }
    return d;
  };

  const eliminating = linked.filter((g) => !loserFed.has(g.id) && !roots.has(g.id));
  const tiers = new Map();
  for (const g of eliminating) {
    const d = tierOf(g.id);
    if (d == null || d < 1) continue;
    if (!tiers.has(d)) tiers.set(d, []);
    tiers.get(d).push(g);
  }

  // Can a team arrive in this slot winless with exactly one loss? Only
  // matters for three_gg_hybrid's survivor pool. States: "won" (has a
  // real win) or a number = losses while still winless.
  const contestMemo = new Map();
  const contested = (g) => isContestedGame(g, byId, contestMemo);
  const memo = new Map();
  function arrivals(g, s, seen = new Set()) {
    const key = `${g.id}:${s}`;
    if (memo.has(key)) return memo.get(key);
    let states;
    const src = g[`${s}_source_game_id`];
    if (g[`${s}_is_open_entry`]) states = new Set(["won"]);
    else if (!src) states = new Set([0]);
    else {
      const feeder = byId.get(src);
      if (!feeder || seen.has(src)) states = new Set(["won", 0, 1, 2]);
      else {
        const next = new Set(seen).add(src);
        const res = String(g[`${s}_source_result`] ?? "winner").toLowerCase();
        const a = arrivals(feeder, "team1", next);
        const b = arrivals(feeder, "team2", next);
        if (res === "winner") {
          states = contested(feeder) ? new Set(["won"]) : new Set([...a, ...b]);
        } else {
          states = new Set([...a, ...b].map((x) => (x === "won" ? "won" : x + 1)));
        }
      }
    }
    memo.set(key, states);
    return states;
  }
  const mayGoToSurvivorPool = (g) =>
    hybrid && (arrivals(g, "team1").has(1) || arrivals(g, "team2").has(1));

  // Did (or will) this game knock exactly one team out?
  const knocksOne = (g) => {
    if (decided(g)) return wentHome(g);
    if (g.team1_is_open_entry || g.team2_is_open_entry) return false;
    if (!contested(g)) return false;
    return !mayGoToSurvivorPool(g);
  };

  // A decided game sent its loser home unless the loser plays again: in
  // any game that did not lead them into this one (a survivor-pool game,
  // a re-entry seat, anything downstream). In three_gg_hybrid a loser who
  // is 0–2 after it waits in the survivor pool, so is not home either.
  // Records count only the games that led here (the links upstream).
  const upstreamMemo = new Map();
  function upstream(g) {
    if (upstreamMemo.has(g.id)) return upstreamMemo.get(g.id);
    const seen = new Set();
    const stack = [g];
    while (stack.length) {
      const x = stack.pop();
      for (const s of ["team1", "team2"]) {
        const src = x[`${s}_source_game_id`];
        if (src && !seen.has(src) && byId.has(src)) {
          seen.add(src);
          stack.push(byId.get(src));
        }
      }
    }
    upstreamMemo.set(g.id, seen);
    return seen;
  }
  function wentHome(g) {
    const team = g[`${loserSlot(g)}_name`];
    if (!team) return false;
    const before = upstream(g);
    const mine = main.filter((x) => x.team1_name === team || x.team2_name === team);
    if (mine.some((x) => x.id !== g.id && !before.has(x.id))) return false;
    if (!hybrid) return true;
    const rec = countMainRecord(mine.map(withWinner), team);
    return !(rec.wins === 0 && rec.losses === 2);
  }

  const certainThrough = new Map();
  let ok = true;
  let better = 0;
  const maxTier = Math.max(0, ...tiers.keys());
  for (let d = 1; d <= maxTier; d++) {
    const tier = tiers.get(d) ?? [];
    ok = ok && tier.every(knocksOne);
    certainThrough.set(d, ok ? { place: 3 + better, size: tier.length } : null);
    better += tier.length;
  }

  for (const [d, tier] of tiers) {
    const tierPlace = certainThrough.get(d);
    if (!tierPlace) continue;
    for (const g of tier) {
      if (!decided(g) || !wentHome(g)) continue;
      const slot = loserSlot(g);
      const team = g[`${slot}_name`];
      if (!team) continue;
      const tied = tierPlace.size > 1;
      out.set(g.id, { slot, team, place: tierPlace.place, tied, label: placeLabel(tierPlace.place, tied) });
    }
  }
  return out;
}
