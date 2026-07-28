import { mootIfRounds } from "./bracket/if-game.js";
import { LEAGUE_TZ } from "./bracket/tree.js";

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

/** Games that are actually on the schedule — no byes, no moot if-game. */
export function playableIn(games) {
  const moot = mootIfRounds(games ?? []);
  return (games ?? []).filter((g) => isPlayableGame(g, moot));
}

/**
 * The game columns these functions read. An if-game is recognised from its two
 * source ids and results; select fewer columns than this and mootIfRounds sees
 * no if-games at all, so a game nobody will ever play reads as one still to
 * play. That is exactly how Heat Stroker Gold showed "Scores 16/17" beside a
 * finished bracket (JD, 2026-07-28: "thats an if game that never was needed
 * ... so that game didnt happen").
 */
export const GAME_STATE_FIELDS =
  "id, status, is_bye, round, team1_name, team2_name, team1_score, team2_score, " +
  "team1_source_game_id, team2_source_game_id, team1_source_result, team2_source_result";

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

// ---------------------------------------------------------------------------
// Registration window.
//
// `tournaments.status` is NOT a source of truth — nothing in the codebase
// writes it. It is set by hand in seed SQL and goes stale the moment an event
// finishes. On 2026-07-27 it still said "upcoming" for the Heat Stroker, which
// had ended three days earlier, so /register was offering a finished
// tournament. Derive from dates instead. See spec-signup-flow.md.
// ---------------------------------------------------------------------------

/** Today as YYYY-MM-DD in league time, not in the server's timezone. */
export function leagueToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Can a team still sign up for this tournament?
 *
 * Closed when it is a placeholder, when `registration_closes` has passed, or
 * when the event's last day is behind us. A tournament with no dates at all is
 * closed — we cannot say it is still ahead.
 *
 * `registration_closes` is inclusive: a deadline of the 20th is open all day
 * on the 20th. Only date parts are compared, so an event running today stays
 * open today.
 */
export function isRegistrationOpen(tournament, now) {
  if (!tournament) return false;
  // Guard the arity trap: `list.filter(isRegistrationOpen)` would pass the
  // index here and reset the clock to 1970, opening every past tournament.
  if (!(now instanceof Date)) now = new Date();
  if (tournament.is_placeholder) return false;

  const today = leagueToday(now);
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

  const closes = dateOnly(tournament.registration_closes);
  if (closes && closes < today) return false;

  const lastDay = dateOnly(tournament.end_date) ?? dateOnly(tournament.start_date);
  if (!lastDay) return false;
  return lastDay >= today;
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
