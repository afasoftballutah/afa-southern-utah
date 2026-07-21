// Pure, read-only helpers for the public bracket TREE renderer. No DB, no
// I/O, no service_role — everything here operates on the same `games` rows
// the public anon client already returns (team1_name/team2_name/status/
// winner_slot/scores are resolved ahead of time by lib/bracket/propagate.js,
// so this module never needs to trace source_game_id chains itself; it only
// needs round/slot/bracket_side for LAYOUT, and the already-resolved fields
// for CONTENT).
//
// Kept separate from components/bracket/BracketTree.js so the geometry math
// is easy to reason about (and re-scale for the smaller consolation tree)
// without wading through JSX.

export const EM_DASH = "—";

/** Games for one bracket_group ('main' | 'consolation'), never touching
 * the scorekeeper's own grouped list or its interactive editing state. */
export function gamesForGroup(games, group) {
  return (games ?? []).filter((g) => g.bracket_group === group);
}

/** Split a group's games into winners / losers / final rows, each grouped
 * by round (ascending), each round's games sorted by slot (ascending).
 * Cancelled games (an unneeded "if necessary" decider) are dropped here —
 * per spec they disappear rather than sitting as a dead cell. The final
 * side is returned separately since it's laid out by hand (only ever 1-2
 * games), not through the generic round-halving math below. */
export function splitSides(groupGames) {
  const bySide = { winners: [], losers: [], final: [] };
  for (const g of groupGames) {
    if (g.status === "cancelled") continue;
    bySide[g.bracket_side]?.push(g);
  }
  const toRounds = (list) => {
    const byRound = new Map();
    for (const g of list) {
      if (!byRound.has(g.round)) byRound.set(g.round, []);
      byRound.get(g.round).push(g);
    }
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, roundGames]) => ({
        round,
        games: [...roundGames].sort((a, b) => a.slot - b.slot),
      }));
  };
  return {
    winners: toRounds(bySide.winners),
    losers: toRounds(bySide.losers),
    final: bySide.final.sort((a, b) => a.round - b.round), // [gf1, gf2?]
  };
}

/**
 * Vertical position math for one side (winners or losers), independent of
 * pixels. Round 1 slot i sits at unit i. Every later round is either:
 *   - a straight passthrough (same match count as the previous round —
 *     a losers-bracket "drop-in" round merging in newly-eliminated teams
 *     1:1 by slot) → inherits the previous round's center exactly, or
 *   - a halving round (half as many matches as the previous round — every
 *     winners round, and a losers "condense" round) → centers on the
 *     midpoint of its two feeder slots (2*slot, 2*slot+1).
 * This holds for any bracket size double_elim/structure.js can produce
 * (winners always halves; losers alternates condense/drop-in) without the
 * renderer needing to know k, bracketSize, or the seeding order at all.
 * @returns {Map<string, number>} key `${round}-${slot}` -> center unit
 */
export function computeCenters(rounds) {
  const centers = new Map();
  rounds.forEach((r, idx) => {
    if (idx === 0) {
      r.games.forEach((g, i) => centers.set(`${r.round}-${g.slot}`, i));
      return;
    }
    const prev = rounds[idx - 1];
    const ratio = r.games.length / prev.games.length;
    r.games.forEach((g) => {
      if (ratio === 1) {
        const p = prev.games.find((x) => x.slot === g.slot);
        centers.set(`${r.round}-${g.slot}`, p ? centers.get(`${prev.round}-${p.slot}`) : g.slot);
        return;
      }
      const p1 = prev.games.find((x) => x.slot === g.slot * 2);
      const p2 = prev.games.find((x) => x.slot === g.slot * 2 + 1);
      const y1 = p1 ? centers.get(`${prev.round}-${p1.slot}`) : g.slot * 2;
      const y2 = p2 ? centers.get(`${prev.round}-${p2.slot}`) : g.slot * 2 + 1;
      centers.set(`${r.round}-${g.slot}`, (y1 + y2) / 2);
    });
  });
  return centers;
}

/** Largest center unit across every round of a side — used to size the
 * container (the first round is always the widest spread). */
export function maxCenter(rounds, centers) {
  let max = 0;
  for (const r of rounds) {
    for (const g of r.games) {
      const c = centers.get(`${r.round}-${g.slot}`) ?? 0;
      if (c > max) max = c;
    }
  }
  return max;
}

/**
 * The division's champion, derived the same way lib/bracket/status.js
 * does (GF2 decides if it was played; otherwise GF1 decides if the
 * winners-side team won outright) but read straight off the already
 * public/anon-fetched games — no service_role needed for a page that's
 * only ever displaying what's already publicly readable.
 */
export function computeChampion(mainGames) {
  const gf1 = mainGames.find((g) => g.bracket_side === "final" && g.round === 1);
  const gf2 = mainGames.find((g) => g.bracket_side === "final" && g.round === 2);
  if (gf2 && gf2.status === "final") {
    return {
      championName: gf2.winner_slot === "team1" ? gf2.team1_name : gf2.team2_name,
      runnerUpName: gf2.winner_slot === "team1" ? gf2.team2_name : gf2.team1_name,
    };
  }
  if (gf1 && gf1.status === "final" && gf1.winner_slot === "team1") {
    return { championName: gf1.team1_name, runnerUpName: gf1.team2_name };
  }
  return { championName: null, runnerUpName: null };
}

/** Whether the "if necessary" GF2 should render dashed (need still
 * unknown — GF1 hasn't finished) vs solid (confirmed real — the
 * losers-bracket team won GF1). Cancelled GF2 rows are already filtered
 * out by splitSides, so this is only ever asked about a live GF2. */
export function isGf2Dashed(gf1) {
  return !gf1 || gf1.status !== "final";
}

/** Team-name cell text: real name, or the muted placeholder — em-dash for
 * a genuinely unresolved feeder slot, "awaiting team" for a consolation
 * open-entry slot with nobody eliminated into it yet. Never "null"/"TBD". */
export function slotText(name, isOpenEntry) {
  if (name) return name;
  return isOpenEntry ? "awaiting team" : EM_DASH;
}
