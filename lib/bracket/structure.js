// Pure bracket structure generator. No DB, no I/O.
//
// Formats:
//   double_elim — standard DE (condense *winner* faces WR drop-in).
//   three_gg_hybrid — JD's three-game-guarantee sheet (lib/bracket/three-game-guarantee.js).
//   double_elim_consolation — DE skeleton; generate.js adds consol tree.

import { generate3GG } from "./three-game-guarantee";

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export const OPEN_ENTRY = Symbol("open-entry");

/** @deprecated kept for old DB rows; new sheets use always-on nets. */
export const IF_ZERO_TWO = "if_0_2";

export const SURVIVOR_FIELD = "Survivor pool";
export const GUARANTEE_NET_FIELD = "Guarantee net";

function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length;
    const next = [];
    for (const s of order) {
      next.push(s, 2 * n + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * @param {(string|Symbol)[]} teamNames - seed order (rank 1 first)
 * @param {'double_elim'|'double_elim_consolation'|'three_gg_hybrid'} format
 * @param {{ reentry?: "reference"|"strict" }} [opts] 3GG only
 */
export function buildBracketStructure(teamNames, format = "double_elim", opts = {}) {
  if (format === "three_gg_hybrid") {
    return buildThreeGgStructure(teamNames, opts);
  }

  const n = teamNames.length;
  const bracketSize = nextPowerOfTwo(Math.max(n, 2));
  const k = Math.log2(bracketSize);
  const order = seedOrder(bracketSize);
  const seedToTeam = new Map();
  order.forEach((seedRank, i) => {
    seedToTeam.set(i, teamNames[seedRank - 1] ?? null);
  });

  const matches = [];
  const winnersMatchCount = (round) => bracketSize / Math.pow(2, round);

  for (let round = 1; round <= k; round++) {
    const count = winnersMatchCount(round);
    for (let slot = 0; slot < count; slot++) {
      let team1, team2;
      if (round === 1) {
        const t1 = seedToTeam.get(slot * 2);
        const t2 = seedToTeam.get(slot * 2 + 1);
        team1 = t1 === OPEN_ENTRY ? { type: "open" } : t1 ? { type: "team", name: t1 } : { type: "bye" };
        team2 = t2 === OPEN_ENTRY ? { type: "open" } : t2 ? { type: "team", name: t2 } : { type: "bye" };
      } else {
        team1 = { type: "ref", side: "winners", round: round - 1, slot: slot * 2, result: "winner" };
        team2 = { type: "ref", side: "winners", round: round - 1, slot: slot * 2 + 1, result: "winner" };
      }
      matches.push({ side: "winners", round, slot, team1, team2 });
    }
  }

  let losersFinalRound = 0;
  if (k >= 2) {
    losersFinalRound = buildStandardLosers(matches, k, winnersMatchCount);
  }

  matches.push({
    side: "final",
    round: 1,
    slot: 0,
    team1: { type: "ref", side: "winners", round: k, slot: 0, result: "winner" },
    team2:
      k === 1
        ? { type: "ref", side: "winners", round: 1, slot: 0, result: "loser" }
        : { type: "ref", side: "losers", round: losersFinalRound, slot: 0, result: "winner" },
  });
  matches.push({
    side: "final",
    round: 2,
    slot: 0,
    team1: { type: "ref", side: "final", round: 1, slot: 0, result: "winner" },
    team2: { type: "ref", side: "final", round: 1, slot: 0, result: "loser" },
  });

  return { bracketSize, matches };
}

/**
 * Convert generate3GG() paper games into structure matches.
 * Each game uses paper G# as `round` and slot 0; refs point at paper G# of feeders.
 * generate.js links sources by (side, round, slot) after insert.
 */
function buildThreeGgStructure(teamNames, opts = {}) {
  const n = teamNames.length;
  if (n < 4) {
    // Generator requires ≥4; fall back to DE for tiny fields
    return buildBracketStructure(teamNames, "double_elim");
  }

  const { games, meta } = generate3GG(n, { reentry: opts.reentry ?? "reference" });
  const byPaper = new Map(games.map((g) => [g.id, g]));

  function mapSide(bracket) {
    if (bracket === "final") return "final";
    if (bracket === "winners") return "winners";
    return "losers"; // losers + net
  }

  function fieldFor(g) {
    if (g.bracket !== "net") return null;
    // Survivor: both sides are losers of first-round pure losers games
    if (g.a.L != null && g.b.L != null) {
      const ga = byPaper.get(g.a.L);
      const gb = byPaper.get(g.b.L);
      if (ga?.bracket === "losers" && gb?.bracket === "losers" && ga.round === 1 && gb.round === 1) {
        return SURVIVOR_FIELD;
      }
    }
    return GUARANTEE_NET_FIELD;
  }

  function toTeam(ref) {
    if (ref == null) return { type: "bye" };
    if (ref.seed !== undefined) {
      const name = teamNames[ref.seed - 1];
      return name ? { type: "team", name } : { type: "bye" };
    }
    if (ref.W !== undefined) {
      const src = byPaper.get(ref.W);
      return {
        type: "ref",
        side: mapSide(src?.bracket ?? "losers"),
        round: ref.W, // paper G#
        slot: 0,
        result: "winner",
      };
    }
    if (ref.L !== undefined) {
      const src = byPaper.get(ref.L);
      return {
        type: "ref",
        side: mapSide(src?.bracket ?? "losers"),
        round: ref.L,
        slot: 0,
        result: "loser",
      };
    }
    return { type: "bye" };
  }

  const matches = games.map((g) => {
    const row = {
      side: mapSide(g.bracket),
      round: g.id, // paper game number (DrawnBracket contract)
      slot: 0,
      team1: toTeam(g.a),
      team2: toTeam(g.b),
      paper: g.id,
      structureRound: g.round,
      algoBracket: g.bracket,
    };
    const field = fieldFor(g);
    if (field) row.field = field;
    return row;
  });

  return {
    bracketSize: meta.bracketSize,
    matches,
    meta,
    /** Paper G# is already `round` on each match. */
    paperNumbered: true,
  };
}

function buildStandardLosers(matches, k, winnersMatchCount) {
  const totalLosersRounds = 2 * (k - 1);
  for (let i = 1; i <= k - 1; i++) {
    const condenseRound = 2 * i - 1;
    const dropInRound = 2 * i;

    if (i === 1) {
      const wr1Count = winnersMatchCount(1);
      const l1Count = wr1Count / 2;
      for (let slot = 0; slot < l1Count; slot++) {
        matches.push({
          side: "losers",
          round: condenseRound,
          slot,
          team1: { type: "ref", side: "winners", round: 1, slot: slot * 2, result: "loser" },
          team2: { type: "ref", side: "winners", round: 1, slot: slot * 2 + 1, result: "loser" },
        });
      }
    } else {
      const prevDropIn = 2 * (i - 1);
      const count = winnersMatchCount(i) / 2;
      for (let slot = 0; slot < count; slot++) {
        matches.push({
          side: "losers",
          round: condenseRound,
          slot,
          team1: { type: "ref", side: "losers", round: prevDropIn, slot: slot * 2, result: "winner" },
          team2: { type: "ref", side: "losers", round: prevDropIn, slot: slot * 2 + 1, result: "winner" },
        });
      }
    }

    const wrDropCount = winnersMatchCount(i + 1);
    for (let slot = 0; slot < wrDropCount; slot++) {
      matches.push({
        side: "losers",
        round: dropInRound,
        slot,
        team1: { type: "ref", side: "losers", round: condenseRound, slot, result: "winner" },
        team2: {
          type: "ref",
          side: "winners",
          round: i + 1,
          slot: wrDropCount - 1 - slot,
          result: "loser",
        },
      });
    }
  }
  return totalLosersRounds;
}

export function buildConsolationEntryStructure(entrantCount) {
  return buildBracketStructure(Array(Math.max(entrantCount, 0)).fill(OPEN_ENTRY), "double_elim");
}

/** Re-export algorithm for tests / tooling. */
export { generate3GG, seedOrder as threeGgSeedOrder } from "./three-game-guarantee";
