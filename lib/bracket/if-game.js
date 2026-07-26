// The "if necessary" game, and when it stops being necessary.
//
// JD, 2026-07-26: "if the undefeated team wins the championship in the
// first game, there is no if game and they are champions and the if game
// is N/A."
//
// That is the whole shape of a double-elimination final. One team arrives
// having never lost; the other has already lost once. The undefeated team
// only has to win ONCE — so if they take the first final, it is over. The
// second game exists on the sheet because nobody knows in advance which
// way the first one goes, not because it is going to be played.
//
// An if-game is recognised from the data, not from the drawing: both of
// its slots are fed by the SAME earlier game, one taking the winner and
// one taking the loser. Nothing else in a bracket has that shape.

const decided = (g) =>
  g &&
  g.status === "final" &&
  g.team1_score !== null &&
  g.team2_score !== null &&
  g.team1_score !== g.team2_score;

const winnerOf = (g) => (g.team1_score > g.team2_score ? g.team1_name : g.team2_name);
const loserOf = (g) => (g.team1_score > g.team2_score ? g.team2_name : g.team1_name);

/** [{ round, fromRound }] for every if-game in this bracket. */
export function findIfGames(games) {
  const roundById = new Map((games ?? []).map((g) => [g.id, g.round]));
  const out = [];
  for (const g of games ?? []) {
    const a = g.team1_source_game_id;
    const b = g.team2_source_game_id;
    if (!a || !b || a !== b) continue;
    const results = [g.team1_source_result, g.team2_source_result].map((r) =>
      String(r ?? "").toLowerCase()
    );
    if (!results.includes("winner") || !results.includes("loser")) continue;
    out.push({ round: g.round, fromRound: roundById.get(a) ?? null, fromId: a });
  }
  return out;
}

/**
 * Rounds of if-games that will never be played, because the team that won
 * the game feeding them came into it undefeated.
 *
 * "Undefeated" is counted from this bracket's own finished games, leaving
 * out the final and the if-game itself. A pool loss is not a bracket loss
 * and never counted here.
 */
export function mootIfRounds(games) {
  const out = new Set();
  for (const { round, fromId } of findIfGames(games)) {
    const from = (games ?? []).find((g) => g.id === fromId);
    if (!decided(from)) continue; // nobody has won the final yet
    let priorLosses = 0;
    for (const g of games ?? []) {
      if (g.id === fromId || g.round === round) continue;
      if (!decided(g)) continue;
      if (loserOf(g) === winnerOf(from)) priorLosses += 1;
    }
    if (priorLosses === 0) out.add(round);
  }
  return out;
}

/** The team that has won this bracket, or null while it is still open. */
export function championOf(games) {
  const moot = mootIfRounds(games);
  const playable = (games ?? []).filter(
    (g) => !g.is_bye && g.status !== "cancelled" && !moot.has(g.round)
  );
  if (playable.some((g) => g.status !== "final")) return null;
  // The last game standing is the one whose winner feeds nothing.
  const feedsSomething = new Set();
  for (const g of playable) {
    if (g.team1_source_game_id && String(g.team1_source_result ?? "winner").toLowerCase() === "winner")
      feedsSomething.add(g.team1_source_game_id);
    if (g.team2_source_game_id && String(g.team2_source_result ?? "winner").toLowerCase() === "winner")
      feedsSomething.add(g.team2_source_game_id);
  }
  const last = playable.filter((g) => decided(g) && !feedsSomething.has(g.id));
  if (last.length !== 1) return null;
  return winnerOf(last[0]);
}
