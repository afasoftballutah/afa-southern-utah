// Shared resolution logic used both at generation time (cascading byes
// eagerly through the whole bracket before anyone's played anything) and
// live, every time a real score comes in (cascading that result forward).
// Kept dependency-free and pure except for the DB row shapes it expects,
// so the same function can't drift between the two call sites.

/**
 * Resolve what a single slot's value is, given the feeder game it points
 * to (or null if this slot is a direct seed, handled by the caller).
 * @returns {{team: string}|{empty: true}|{pending: true}}
 */
export function resolveFeederSlot(feederGame, sourceResult) {
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
  return name ? { team: name } : { empty: true };
}

/** Resolve both slots of a match given a lookup function for feeder games. */
export function resolveMatchSlots(matchRow, getFeederGame) {
  const resolveSlot = (nameField, sourceGameField, sourceResultField) => {
    const sourceGameId = matchRow[sourceGameField];
    if (!sourceGameId) {
      // Direct seed slot (winners round 1) — already fully determined at
      // generation time: either a real team name or a permanent bye (null).
      return matchRow[nameField] ? { team: matchRow[nameField] } : { empty: true };
    }
    const feeder = getFeederGame(sourceGameId);
    return resolveFeederSlot(feeder, matchRow[sourceResultField]);
  };
  return {
    team1: resolveSlot("team1_name", "team1_source_game_id", "team1_source_result"),
    team2: resolveSlot("team2_name", "team2_source_game_id", "team2_source_result"),
  };
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
