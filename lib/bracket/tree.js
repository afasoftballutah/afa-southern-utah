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

// The league's local time zone. Southern Utah / St. George is Mountain Time
// WITH daylight saving, so America/Denver (never Phoenix/Arizona, which has no
// DST). One named constant so the display zone changes in exactly one place.
export const LEAGUE_TZ = "America/Denver";

/**
 * Field + time label for a game slot, rendered in the league's local zone.
 * scheduled_time is a timestamptz (an absolute instant), so pinning the
 * formatters to LEAGUE_TZ only sets the DISPLAY zone — it does not reinterpret
 * the stored value. Without the fixed zone the server (Vercel = UTC) and the
 * client render different wall-clock times (a 6-hour shift in summer); with it,
 * both render the same correct Mountain time. Shared so every caller (the
 * bracket tree, and the public List view if it ever surfaces times) stays
 * consistent. Returns null when there's nothing to show.
 * @returns {string|null}
 */
export function formatFieldTime(game) {
  const parts = [];
  if (game?.scheduled_time) {
    const d = new Date(game.scheduled_time);
    parts.push(
      d.toLocaleDateString("en-US", { weekday: "short", timeZone: LEAGUE_TZ }) +
        " " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: LEAGUE_TZ })
    );
  }
  if (game?.field) parts.push(game.field);
  return parts.length ? parts.join(" · ") : null;
}

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
 * pixels.
 *
 * Prefer real feeder links (source_game_id) when both ends sit in this side —
 * that is what 3GG losers needs (game counts do not alternate 1:1 / half).
 * Fall back to classic DE geometry when links are missing:
 *   - same match count as previous → inherit by slot (drop-in)
 *   - half as many → midpoint of slots 2i / 2i+1 (condense / winners)
 *   - anything else (bye-filtered WR, irregular 3GG) → stack remaining leaves
 *
 * @returns {Map<string, number>} key `${round}-${slot}` -> center unit
 */
export function computeCenters(rounds) {
  const centers = new Map();
  const byId = new Map();
  for (const r of rounds) {
    for (const g of r.games) byId.set(g.id, g);
  }
  const keyOf = (g) => `${g.round}-${g.slot}`;
  let nextLeaf = 0;

  function place(g) {
    const key = keyOf(g);
    if (centers.has(key)) return centers.get(key);

    const sameSideFeeders = [g.team1_source_game_id, g.team2_source_game_id]
      .map((id) => (id ? byId.get(id) : null))
      .filter(Boolean);

    if (sameSideFeeders.length > 0) {
      const ys = sameSideFeeders.map(place);
      const y = (Math.min(...ys) + Math.max(...ys)) / 2;
      centers.set(key, y);
      return y;
    }

    // No same-side feeder (seeded WR1, or drop-in from the other band).
    const y = nextLeaf++;
    centers.set(key, y);
    return y;
  }

  // Classic DE pass as a fill for any game still unplaced after feeder walk —
  // also used when rounds are empty.
  if (!rounds.length) return centers;

  // Place in round order so parents can read children after leaves are set.
  // Roots (no same-side feeder) claim sequential leaf rows; parents average.
  for (const r of rounds) {
    for (const g of [...r.games].sort((a, b) => a.slot - b.slot)) place(g);
  }

  // If feeder graph left large gaps (rare), fall back per-round DE geometry
  // only for rounds that look like standard halving/passthrough and have no
  // source links at all on any game.
  rounds.forEach((r, idx) => {
    if (idx === 0) return;
    const prev = rounds[idx - 1];
    const allUnlinked = r.games.every(
      (g) => !g.team1_source_game_id && !g.team2_source_game_id
    );
    if (!allUnlinked) return;
    const ratio = r.games.length / Math.max(prev.games.length, 1);
    r.games.forEach((g) => {
      const key = keyOf(g);
      if (ratio === 1) {
        const p = prev.games.find((x) => x.slot === g.slot);
        centers.set(key, p ? centers.get(keyOf(p)) : g.slot);
        return;
      }
      if (Math.abs(ratio - 0.5) < 1e-9) {
        const p1 = prev.games.find((x) => x.slot === g.slot * 2);
        const p2 = prev.games.find((x) => x.slot === g.slot * 2 + 1);
        const y1 = p1 ? centers.get(keyOf(p1)) : g.slot * 2;
        const y2 = p2 ? centers.get(keyOf(p2)) : g.slot * 2 + 1;
        centers.set(key, (y1 + y2) / 2);
      }
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
 * open-entry slot with nobody eliminated into it yet. Never "null"/"TBD".
 * Used by the read-only public ListView, which stays exactly as it was —
 * the paper-convention W2/L3 labeling below is a TREE-only rendering
 * addition (see slotDisplay). */
export function slotText(name, isOpenEntry) {
  if (name) return name;
  return isOpenEntry ? "awaiting team" : EM_DASH;
}

/**
 * Paper game numbers: winners → losers → final order.
 * Only games that can produce **both** a winner and a loser get a G-number.
 * Bye padding and half-empty losers shells (— vs L1) are unnumbered so we
 * never paint "L9" when game 9 can't have a loser.
 *
 * @returns {Map<string, number>} game.id -> 1-indexed game number
 */
export function assignGameNumbers(groupGames) {
  const list = groupGames ?? [];
  const gamesById = new Map(list.map((g) => [g.id, g]));
  const contestedMemo = new Map();

  const sideRank = { winners: 0, losers: 1, final: 2 };
  const ordered = list
    .filter((g) => g && isContestedGame(g, gamesById, contestedMemo))
    .sort((a, b) => {
      if (sideRank[a.bracket_side] !== sideRank[b.bracket_side]) {
        return sideRank[a.bracket_side] - sideRank[b.bracket_side];
      }
      if (a.round !== b.round) return a.round - b.round;
      return a.slot - b.slot;
    });
  const numberByGameId = new Map();
  ordered.forEach((g, i) => numberByGameId.set(g.id, i + 1));
  return numberByGameId;
}

/** True if this game is a real two-sided contest on paper. */
export function isContestedGame(g, gamesById, memo = new Map()) {
  if (!g || g.status === "cancelled" || g.is_bye) return false;
  if (memo.has(g.id)) return memo.get(g.id);
  // Seed recursion: assume contested while resolving children to break cycles
  memo.set(g.id, true);
  const ok =
    slotCanProduceTeam(g, "team1", gamesById, memo, new Set()) &&
    slotCanProduceTeam(g, "team2", gamesById, memo, new Set());
  memo.set(g.id, ok);
  return ok;
}

/**
 * Can this slot eventually hold a real team?
 * Loser-of-X only if X is a contested game (two productive sides).
 */
function slotCanProduceTeam(game, slotKey, gamesById, contestedMemo, path) {
  if (game[`${slotKey}_name`]) return true;
  if (game[`${slotKey}_is_open_entry`]) return true;
  const srcId = game[`${slotKey}_source_game_id`];
  const result = game[`${slotKey}_source_result`];
  if (!srcId) return false;
  if (path.has(srcId)) return false;
  path.add(srcId);
  const feeder = gamesById.get(srcId);
  if (!feeder) return true; // missing row — don't collapse the tree
  if (feeder.is_bye || isLoneTeamBye(feeder)) {
    return result === "winner"; // bye has a winner, never a loser
  }
  if (result === "winner") {
    // Contested or not, a completed path has a winner if either side can produce
    return (
      slotCanProduceTeam(feeder, "team1", gamesById, contestedMemo, path) ||
      slotCanProduceTeam(feeder, "team2", gamesById, contestedMemo, path)
    );
  }
  if (result === "loser") {
    // A loser exists only when both sides of the feeder can produce a team
    return (
      slotCanProduceTeam(feeder, "team1", gamesById, contestedMemo, new Set(path)) &&
      slotCanProduceTeam(feeder, "team2", gamesById, contestedMemo, new Set(path))
    );
  }
  return false;
}

/** WR1 team-vs-empty (no feeders): permanent bye pad. */
function isLoneTeamBye(g) {
  if (!g || g.is_bye) return true;
  const t1 = g.team1_name;
  const t2 = g.team2_name;
  const s1 = g.team1_source_game_id;
  const s2 = g.team2_source_game_id;
  const o1 = g.team1_is_open_entry;
  const o2 = g.team2_is_open_entry;
  if ((t1 || t2) && !(t1 && t2) && !s1 && !s2 && !o1 && !o2) return true;
  return false;
}

/**
 * Provenance: "W2" / "L3" for numbered contested feeders.
 * Winner-of unnumbered shells (bye paths) walk through to the real L#/W#
 * or team name — otherwise G11 reads "— vs —" when it is actually L3 vs L2.
 *
 * @param {Map<string, object>|null} gamesById
 */
export function slotDisplay(game, slotKey, numberByGameId, gamesById = null) {
  return slotDisplayInner(game, slotKey, numberByGameId, gamesById, new Set());
}

function slotDisplayInner(game, slotKey, numberByGameId, gamesById, seen) {
  if (!game) return { text: EM_DASH, resolved: false };
  const name = game[`${slotKey}_name`];
  if (name) return { text: name, resolved: true };
  if (game[`${slotKey}_is_open_entry`]) return { text: "awaiting team", resolved: false };
  const sourceGameId = game[`${slotKey}_source_game_id`];
  const sourceResult = game[`${slotKey}_source_result`];
  if (!sourceGameId) return { text: EM_DASH, resolved: false };
  if (seen.has(sourceGameId)) return { text: EM_DASH, resolved: false };
  seen.add(sourceGameId);

  const feeder = gamesById?.get(sourceGameId) ?? null;
  const paperNum = numberByGameId?.get(sourceGameId);

  // Numbered contested feeder → L# / W#
  if (paperNum != null) {
    const prefix = sourceResult === "loser" ? "L" : "W";
    return { text: `${prefix}${paperNum}`, resolved: false };
  }

  // Unnumbered: loser of a bye/shell never exists
  if (sourceResult === "loser") return { text: EM_DASH, resolved: false };

  // Winner of unnumbered feeder — walk through (bye / one-sided path)
  if (!feeder) return { text: EM_DASH, resolved: false };

  // Known winner name after cascade
  if (feeder.winner_slot) {
    const wname = feeder[`${feeder.winner_slot}_name`];
    if (wname) return { text: wname, resolved: true };
  }
  // Lone named team on the feeder (pre-cascade bye pad)
  if (feeder.team1_name && !feeder.team2_name && !feeder.team2_source_game_id) {
    return { text: feeder.team1_name, resolved: true };
  }
  if (feeder.team2_name && !feeder.team1_name && !feeder.team1_source_game_id) {
    return { text: feeder.team2_name, resolved: true };
  }

  // Exactly one side can produce a team → that team is the automatic winner
  const contestedMemo = new Map();
  const t1ok = slotCanProduceTeam(feeder, "team1", gamesById, contestedMemo, new Set());
  const t2ok = slotCanProduceTeam(feeder, "team2", gamesById, contestedMemo, new Set());
  if (t1ok && !t2ok) {
    return slotDisplayInner(feeder, "team1", numberByGameId, gamesById, seen);
  }
  if (t2ok && !t1ok) {
    return slotDisplayInner(feeder, "team2", numberByGameId, gamesById, seen);
  }
  // Both sides produce but feeder is unnumbered (shouldn't be contested) — dash
  return { text: EM_DASH, resolved: false };
}
