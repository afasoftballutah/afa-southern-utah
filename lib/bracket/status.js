import { getServiceClient } from "@/lib/supabase";
import { findIfGames, mootIfRounds } from "./if-game";

/**
 * Determines whether a division's bracket has produced a champion yet, and
 * who it is.
 *
 * App-generated brackets number their finals 1 and 2 on the "final" side:
 *   - GF1 finalizes with the winners-bracket team (team1) winning outright
 *     (GF2 gets auto-cancelled — see propagate.js).
 *   - GF2 (the "if necessary" decider) finalizes — whoever wins it is champion
 *     regardless of team1/team2, since it's a clean decisive game.
 *
 * Brackets loaded from a director's sheet (2026 Worlds) number every game by
 * its sheet number, so the finals are e.g. G14/G15. Those are found by
 * shape instead: the if-necessary game is the one whose two slots are the
 * winner and loser of the same game (findIfGames), and that feeding game is
 * the championship. If the championship's winner came in unbeaten, the
 * if-game is moot and the championship decides it (mootIfRounds).
 */
export function completionFromGames(mainGames) {
  const games = mainGames ?? [];
  const finals = games
    .filter((g) => g.bracket_side === "final")
    .sort((a, b) => a.round - b.round);
  const gf1 = finals.find((g) => g.round === 1);
  if (gf1) return legacyCompletion(gf1, finals.find((g) => g.round === 2));
  return sheetCompletion(games);
}

const NOT_DONE = { complete: false, championName: null, runnerUpName: null };

function decided(g) {
  return (
    g &&
    g.status === "final" &&
    g.team1_score != null &&
    g.team2_score != null &&
    g.team1_score !== g.team2_score
  );
}

function result(g) {
  const t1 = g.winner_slot ? g.winner_slot === "team1" : g.team1_score > g.team2_score;
  return t1
    ? { complete: true, championName: g.team1_name, runnerUpName: g.team2_name }
    : { complete: true, championName: g.team2_name, runnerUpName: g.team1_name };
}

// Unchanged rule for app-generated brackets (finals numbered 1 and 2).
function legacyCompletion(gf1, gf2) {
  if (gf2 && gf2.status === "final") {
    const championName = gf2.winner_slot === "team1" ? gf2.team1_name : gf2.team2_name;
    const runnerUpName = gf2.winner_slot === "team1" ? gf2.team2_name : gf2.team1_name;
    return { complete: true, championName, runnerUpName };
  }
  if (gf1 && gf1.status === "final" && gf1.winner_slot === "team1") {
    return { complete: true, championName: gf1.team1_name, runnerUpName: gf1.team2_name };
  }
  return NOT_DONE;
}

function sheetCompletion(games) {
  const ifGames = findIfGames(games);
  if (ifGames.length !== 1) return NOT_DONE;
  const { round, fromId } = ifGames[0];
  const ifGame = games.find(
    (g) => g.round === round && g.team1_source_game_id === fromId && g.team2_source_game_id === fromId
  );
  const championship = games.find((g) => g.id === fromId);
  if (decided(ifGame)) return result(ifGame);
  if (!decided(championship)) return NOT_DONE;
  // A cancelled if-game, or one the unbeaten team made unnecessary.
  if (ifGame?.status === "cancelled" || mootIfRounds(games).has(round)) return result(championship);
  return NOT_DONE;
}

export async function getDivisionCompletion(divisionId) {
  const supabase = getServiceClient();
  const { data: mainGames, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main") // the division's champion comes from the MAIN bracket only, never the consolation bracket's own grand final
    .order("round", { ascending: true });
  if (error) throw new Error(error.message);
  return completionFromGames(mainGames);
}
