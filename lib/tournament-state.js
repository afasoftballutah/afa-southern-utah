import { mootIfRounds } from "./bracket/if-game.js";

// Shared "still to play" exclusions — byes, cancelled games, and an if-game
// the undefeated team already made unnecessary. Used by getUpcomingGames,
// computeTeamStatus, and isFinished. A third copy of this list is how the
// archive would quietly never render on Heat Stroker (one moot Gold if-game).

/**
 * A game that can occupy a real field slot — not a bye, not cancelled, and
 * not an if-game the undefeated champion made unnecessary.
 *
 * @param {object} g
 * @param {Set<number>|null|undefined} mootRounds  from mootIfRounds(divisionGames)
 */
export function isPlayableGame(g, mootRounds) {
  if (!g) return false;
  if (g.is_bye) return false;
  if (g.status === "cancelled") return false;
  if (mootRounds?.has?.(g.round)) return false;
  return true;
}

/**
 * A playable game that has not been finalized yet.
 * Does NOT require scheduled_time — an unscheduled pending game still means
 * the division is not finished. getUpcomingGames adds its own time filter
 * for the "Next" list.
 */
export function isStillToPlay(g, mootRounds) {
  return isPlayableGame(g, mootRounds) && g.status !== "final";
}

/** @param {Array} games  one division's games (bracket and/or pool) */
export function stillToPlayIn(games) {
  const moot = mootIfRounds(games ?? []);
  return (games ?? []).filter((g) => isStillToPlay(g, moot));
}

/**
 * Finished when every division that has games has nothing left to play.
 * A tournament with no games at all is NOT finished — it has not started.
 *
 * @param {Map|Object|Array} divisionGames
 *   Map/object of divisionId -> games[], or a flat array of games with
 *   division_id. Each list may mix bracket + pool rows.
 */
export function isFinished(divisionGames) {
  const groups = normalizeDivisionGroups(divisionGames);
  let sawAny = false;
  for (const games of groups) {
    if (!games?.length) continue;
    sawAny = true;
    if (stillToPlayIn(games).length > 0) return false;
  }
  return sawAny;
}

/**
 * Convenience: tournament row with divisions(*, games(*), pool_games(*)).
 * Parent groups and bracket children are all walked.
 */
export function isTournamentFinished(tournament) {
  const byDivision = {};
  for (const d of tournament?.divisions ?? []) {
    const list = [...(d.games ?? []), ...(d.pool_games ?? [])];
    if (list.length) byDivision[d.id] = list;
  }
  return isFinished(byDivision);
}

function normalizeDivisionGroups(divisionGames) {
  if (!divisionGames) return [];
  if (divisionGames instanceof Map) return [...divisionGames.values()];
  if (Array.isArray(divisionGames)) {
    // Flat list with division_id, or already a list-of-lists.
    if (divisionGames.length === 0) return [];
    if (Array.isArray(divisionGames[0])) return divisionGames;
    const by = new Map();
    for (const g of divisionGames) {
      const id = g.division_id ?? "_";
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(g);
    }
    return [...by.values()];
  }
  return Object.values(divisionGames);
}
