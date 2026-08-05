// Shared resolution logic used both at generation time (cascading byes
// eagerly through the whole bracket before anyone's played anything) and
// live, every time a real score comes in (cascading that result forward).
// Kept dependency-free and pure except for the DB row shapes it expects,
// so the same function can't drift between the two call sites.

import { isZeroTwoAfterLoss } from "./lives";
import { IF_ZERO_TWO } from "./structure";

/**
 * Resolve what a single slot's value is, given the feeder game it points
 * to (or null if this slot is a direct seed, handled by the caller).
 * @returns {{team: string}|{empty: true}|{pending: true}}
 */
export function resolveFeederSlot(feederGame, sourceResult, opts = {}) {
  if (!feederGame) return { pending: true };
  // A cancelled/dead match (both feeder slots were permanent dead ends —
  // e.g. two byes colliding, or an unneeded "if necessary" game) will NEVER
  // reach 'final'. It produces neither a winner nor a loser — resolve to
  // permanently empty immediately rather than waiting forever.
  if (feederGame.status === "cancelled") return { empty: true };
  if (feederGame.status !== "final") return { pending: true };
  if (sourceResult === "winner") {
    if (!feederGame.winner_slot) return { empty: true }; // degenerate dead match, no real winner
    const name = feederGame[`${feederGame.winner_slot}_name`];
    return name ? { team: name } : { empty: true };
  }
  // sourceResult === 'loser'
  if (feederGame.is_bye || !feederGame.winner_slot) return { empty: true }; // byes/dead matches have no loser
  const loserSlot = feederGame.winner_slot === "team1" ? "team2" : "team1";
  const name = feederGame[`${loserSlot}_name`];
  if (!name) return { empty: true };

  // 3GG G14: only take this loser if they are pure 0–2 (e.g. Alpha lost G2
  // and G12). Every other outcome → empty → L7 bye advances.
  if (opts.conditionalZeroTwo && opts.mainGames) {
    if (!isZeroTwoAfterLoss(opts.mainGames, name)) return { empty: true };
  }
  return { team: name };
}

/**
 * Resolve both slots of a match given a lookup function for feeder games.
 * @param {object} matchRow
 * @param {(id: string) => object|undefined} getFeederGame
 * @param {Array|null} [mainGames] all main rows (needed for if_0_2 slots)
 */
export function resolveMatchSlots(matchRow, getFeederGame, mainGames = null) {
  const resolveSlot = (nameField, sourceGameField, sourceResultField, openEntryField, seedRefField) => {
    const sourceGameId = matchRow[sourceGameField];
    if (!sourceGameId) {
      // Direct seed slot (winners round 1). A real name is always known. A
      // null name is either a permanent bye (padding — empty forever) or,
      // on a consolation bracket, an "open entry" slot still waiting on an
      // eliminated team to be assigned into it (pending, not empty). These
      // two null cases look identical except for the per-SLOT open-entry
      // flag — a single per-row flag isn't enough, since one match can
      // pair one open slot against one permanent bye (see generate.js).
      if (matchRow[nameField]) return { team: matchRow[nameField] };
      return matchRow[openEntryField] ? { pending: true } : { empty: true };
    }
    const feeder = getFeederGame(sourceGameId);
    const conditionalZeroTwo = matchRow[seedRefField] === IF_ZERO_TWO;
    return resolveFeederSlot(feeder, matchRow[sourceResultField], {
      conditionalZeroTwo,
      mainGames,
    });
  };
  return {
    team1: resolveSlot(
      "team1_name",
      "team1_source_game_id",
      "team1_source_result",
      "team1_is_open_entry",
      "team1_seed_ref"
    ),
    team2: resolveSlot(
      "team2_name",
      "team2_source_game_id",
      "team2_source_result",
      "team2_is_open_entry",
      "team2_seed_ref"
    ),
  };
}

/**
 * True if this game's loser is done for the main title path (consol entry,
 * etc.). A bye has no real loser.
 *
 * Losers side: eliminated only when no other game is fed by the *loser* of
 * this game. Standard DE never feeds losers onward, so every losers loss
 * eliminates. 3GG hybrid does (loser of L1/L2 plays L3), so that loss is
 * not eliminating.
 *
 * Final: GF1 eliminates the losers-side team only if winners-side wins
 * outright; GF2 eliminates whoever loses it.
 *
 * @param {object} game
 * @param {Array|null} allGames same bracket_group rows (needed for 3GG)
 */
export function isEliminatingLoss(game, allGames = null) {
  if (!game || game.is_bye || game.status !== "final" || !game.winner_slot) return false;
  if (game.bracket_side === "losers") {
    if (!allGames) return true; // legacy: treat as eliminating if no graph
    const feedsLoserPath = allGames.some(
      (g) =>
        g.id !== game.id &&
        ((g.team1_source_game_id === game.id && g.team1_source_result === "loser") ||
          (g.team2_source_game_id === game.id && g.team2_source_result === "loser"))
    );
    return !feedsLoserPath;
  }
  if (game.bracket_side === "final" && game.round === 1) return game.winner_slot === "team1";
  if (game.bracket_side === "final" && game.round === 2) return true;
  return false;
}

/**
 * Classify a match given its two resolved slots.
 * @returns {'partial'|'ready'|'bye'|'dead'}
 *   partial — at least one side still genuinely waiting on a real game
 *   ready   — both sides are real teams, awaiting a scorekeeper-entered score
 *   bye     — exactly one real team, the other is a permanent dead end — auto-win
 *   dead    — both sides are permanent dead ends (degenerate, no game ever happens)
 */
export function classifyMatch(team1, team2) {
  if (team1.pending || team2.pending) return "partial";
  const t1 = "team" in team1;
  const t2 = "team" in team2;
  if (t1 && t2) return "ready";
  if (t1 !== t2) return "bye";
  return "dead";
}
