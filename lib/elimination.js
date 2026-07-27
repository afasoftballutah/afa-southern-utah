import { normalizeTeam, isPlaceholderName } from "@/lib/quickscores";
import { mootIfRounds } from "@/lib/bracket/if-game";
import { isPlayableGame } from "@/lib/tournament-state";

// Does a team still have a game coming? (JD, 2026-07-26: "if there is no
// next game for a team, can you mark them as [eliminated]? want to be
// informative but gentle.")
//
// Pure — takes every game in the tournament and returns what to store.
// Kept out of the sync route so the rule can be reasoned about and tested
// on its own, because getting it WRONG is worse than not having it: a
// team told they are out while they are waiting on a losers-bracket game
// will believe it and go home.
//
// The rule, stated plainly. A team is out when all three hold:
//
//   1. Nothing of theirs is unplayed. Any game naming them that is not
//      final means they are still playing, full stop.
//   2. The last game they played was a BRACKET game and they lost it.
//      A pool loss never eliminates anyone — every pool team enters a
//      bracket — and this is what stops the whole field being marked out
//      in the hour between the last pool game and the bracket being
//      seeded.
//   3. No unfilled slot downstream could still be theirs. If a pending
//      game anywhere still reads "Loser of Game 7" and game 7 is the one
//      they just lost, they are not out, they are about to be placed.
//      This is the guard against a lagging propagation.
//
// Anything else stores nothing at all. Absence means "still playing",
// which is both the common case and the safe way to be wrong.
//
// Champion falls out of the same walk: a team whose last game was a
// bracket game they WON, with nothing pending anywhere in that bracket.
// It is here mostly so the winner is never the one team left unlabelled.

const isRealName = (n) => !!n && !isPlaceholderName(n);

/**
 * @param {Array} games      bracket games: {id, division_id, round, team1_name, team2_name, team1_score, team2_score, status, scheduled_time, is_bye}
 * @param {Array} poolGames  {id, division_id, team1_name, team2_name, status, scheduled_time}
 * @param {Map}   divisionNames division_id -> "Gold"
 * @returns {Array} [{ team_name, state, last_game_label, last_game_at }]
 */
export function computeTeamStatus(games, poolGames, divisionNames) {
  // An if-game the undefeated team made unnecessary is not pending — it
  // is not going to happen. Counting it as pending kept both finalists
  // looking like they had a game left, so the bracket never produced a
  // champion and the runner-up was never marked out (JD, 2026-07-26).
  const mootByDivision = new Map();
  for (const g of games) {
    if (!mootByDivision.has(g.division_id)) {
      mootByDivision.set(
        g.division_id,
        mootIfRounds(games.filter((x) => x.division_id === g.division_id))
      );
    }
  }
  // Same exclusions as getUpcomingGames / isFinished (lib/tournament-state.js).
  const played = games.filter((g) => isPlayableGame(g, mootByDivision.get(g.division_id)));

  // Every slot still waiting on an earlier game's result, by the game
  // number it is waiting on. "Loser of Game 7" in a pending game means
  // game 7's loser has somewhere to go.
  const awaitedRounds = new Set();
  for (const g of played) {
    if (g.status === "final") continue;
    for (const name of [g.team1_name, g.team2_name]) {
      const n = Number(String(name ?? "").match(/^(?:Winner|Loser) of Game (\d+)$/)?.[1]);
      if (n) awaitedRounds.add(`${g.division_id}#${n}`);
    }
  }

  // One entry per team, holding every game they appear in.
  const byTeam = new Map();
  const add = (name, entry) => {
    if (!isRealName(name)) return;
    const key = normalizeTeam(name);
    if (!byTeam.has(key)) byTeam.set(key, { name, games: [] });
    byTeam.get(key).games.push(entry);
  };

  for (const g of poolGames) {
    const entry = {
      stage: "pool",
      divisionId: g.division_id,
      at: g.scheduled_time,
      final: g.status === "final",
      label: null,
    };
    add(g.team1_name, { ...entry, mine: 1, s1: g.team1_score, s2: g.team2_score, team: g.team1_name });
    add(g.team2_name, { ...entry, mine: 2, s1: g.team1_score, s2: g.team2_score, team: g.team2_name });
  }

  for (const g of played) {
    const entry = {
      stage: "bracket",
      divisionId: g.division_id,
      round: g.round,
      at: g.scheduled_time,
      final: g.status === "final",
      label: `${divisionNames.get(g.division_id) ?? "Bracket"} Game ${g.round}`,
    };
    add(g.team1_name, { ...entry, mine: 1, s1: g.team1_score, s2: g.team2_score });
    add(g.team2_name, { ...entry, mine: 2, s1: g.team1_score, s2: g.team2_score });
  }

  // A bracket with anything left to play has no champion yet.
  const divisionsStillGoing = new Set(
    played.filter((g) => g.status !== "final").map((g) => g.division_id)
  );

  const out = [];
  for (const { name, games: mine } of byTeam.values()) {
    if (mine.some((g) => !g.final)) continue; // (1) still has a game coming

    const last = mine
      .filter((g) => g.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    if (!last || last.stage !== "bracket") continue; // (2) pool losses never eliminate

    const myScore = last.mine === 1 ? last.s1 : last.s2;
    const theirScore = last.mine === 1 ? last.s2 : last.s1;
    if (myScore === null || theirScore === null || myScore === theirScore) continue;

    if (myScore > theirScore) {
      if (!divisionsStillGoing.has(last.divisionId)) {
        out.push({
          team_name: name,
          state: "champion",
          last_game_label: last.label,
          last_game_at: last.at,
        });
      }
      continue;
    }

    // (3) a slot downstream may still be waiting on this very game
    if (awaitedRounds.has(`${last.divisionId}#${last.round}`)) continue;

    out.push({
      team_name: name,
      state: "eliminated",
      last_game_label: last.label,
      last_game_at: last.at,
    });
  }
  return out;
}
