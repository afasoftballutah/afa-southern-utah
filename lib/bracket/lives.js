/**
 * 3GG hybrid lives + survivor pool (pure helpers).
 *
 * Same rules for **any team count** (pads to next power of two with byes):
 *   Structure = standard double-elim (no N-specific losers chart).
 *   At score time:
 *     - 2nd loss with any *real* win → out
 *     - 2nd loss winless (0–2) → survivor pool (third_life_teams)
 *     - pool of 2 → they play; loser 0–3 out; winner re-enters losers
 *     - alone with no other team that can still hit 0–2 → re-enter directly
 *   Structural labels (loserAlwaysZeroTwo): when *both* sides of a game can
 *   only arrive with 0 real wins, that game’s loser is *always* 0–2 (e.g.
 *   pure WR1-loser pairs on a full 8/16/32, or L1 vs L5 on a 9-team chart).
 *   Bye walkovers are not real wins.
 *
 * Pool-play losses never count — only finalized non-bye main games.
 */

import { isContestedGame } from "./tree";

export const SURVIVOR_POOL_FIELD = "Survivor pool";

/**
 * @param {Array} mainGames - rows from games (main group)
 * @param {string} teamName
 * @returns {{ wins: number, losses: number }}
 */
export function countMainRecord(mainGames, teamName) {
  let wins = 0;
  let losses = 0;
  const name = String(teamName ?? "").trim();
  if (!name) return { wins: 0, losses: 0 };

  for (const g of mainGames ?? []) {
    if (g.status !== "final" || g.is_bye || !g.winner_slot) continue;
    const t1 = g.team1_name;
    const t2 = g.team2_name;
    if (t1 !== name && t2 !== name) continue;
    const winner = g.winner_slot === "team1" ? t1 : t2;
    if (winner === name) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

/**
 * After this final game, is the loser a pure 0–2 (survivor-pool candidate)?
 * @param {Array} mainGames - all main games including this one finalized
 */
export function isZeroTwoAfterLoss(mainGames, loserName) {
  const { wins, losses } = countMainRecord(mainGames, loserName);
  return wins === 0 && losses === 2;
}

/**
 * Should this eliminating loss fully remove the team from title contention?
 * three_gg_hybrid: 0–2 is NOT terminal (survivor pool). 1–2 is terminal.
 * Other formats: any eliminating loss is terminal for main.
 */
export function isTerminalTitleExit(format, mainGames, loserName) {
  if (format !== "three_gg_hybrid") return true;
  return !isZeroTwoAfterLoss(mainGames, loserName);
}

/**
 * After this loss, has the team used their third life (0–3)?
 */
export function isThirdLifeExhausted(mainGames, teamName) {
  const { wins, losses } = countMainRecord(mainGames, teamName);
  return wins === 0 && losses >= 3;
}

/**
 * Teams that can still become pure 0–2 (0 wins, fewer than 2 losses).
 * @param {string[]} allNames
 * @param {string[]} [exclude]
 */
export function potentialZeroTwoTeams(mainGames, allNames, exclude = []) {
  const skip = new Set((exclude ?? []).map((n) => String(n).trim()).filter(Boolean));
  const out = [];
  for (const raw of allNames ?? []) {
    const name = String(raw ?? "").trim();
    if (!name || skip.has(name)) continue;
    const { wins, losses } = countMainRecord(mainGames, name);
    if (wins === 0 && losses < 2) out.push(name);
  }
  return out;
}

/**
 * Solo re-entry: one team in the pool and nobody else can still reach 0–2.
 */
export function shouldSoloReenter(pool, mainGames, allNames) {
  const p = (pool ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (p.length !== 1) return false;
  const others = potentialZeroTwoTeams(mainGames, allNames, p);
  return others.length === 0;
}

/** True if this row is a survivor-pool matchup (fixed chart or created live). */
export function isSurvivorPoolGame(game) {
  return String(game?.field ?? "") === SURVIVOR_POOL_FIELD;
}

/**
 * FIFO: take the first two pool names for a survivor game; return the rest.
 * @returns {{ a: string, b: string, rest: string[] } | null}
 */
export function takeSurvivorPair(pool) {
  const p = (pool ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (p.length < 2) return null;
  return { a: p[0], b: p[1], rest: p.slice(2) };
}

/** Append name to pool if not already present. */
export function appendSurvivorPool(pool, teamName) {
  const name = String(teamName ?? "").trim();
  if (!name) return [...(pool ?? [])];
  const p = (pool ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (p.includes(name)) return p;
  return [...p, name];
}

/** Remove name(s) from pool. */
export function removeFromSurvivorPool(pool, ...names) {
  const drop = new Set(names.map((n) => String(n ?? "").trim()).filter(Boolean));
  return (pool ?? []).map((n) => String(n).trim()).filter((n) => n && !drop.has(n));
}

/**
 * Structural: team filling this slot always has 0 *real* main wins on arrival.
 * - Seed / first name: winless
 * - Winner of a contested game: has a win
 * - Winner of a bye / one-sided shell: walk through (bye is not a win)
 * - Loser of a game: winless only if both sides of that game arrived winless
 */
export function slotIsWinlessArrival(game, slotKey, gamesById, seen = new Set()) {
  if (!game) return false;
  const srcId = game[`${slotKey}_source_game_id`];
  const res = String(game[`${slotKey}_source_result`] ?? "winner").toLowerCase();
  const name = game[`${slotKey}_name`];
  const open = game[`${slotKey}_is_open_entry`];

  if (!srcId) {
    if (name || open) return true;
    return false; // empty permanent seat
  }

  const mark = `${game.id}:${slotKey}`;
  if (seen.has(mark)) return false;
  seen.add(mark);

  const feeder = gamesById?.get(srcId);
  if (!feeder) return false;

  if (res === "winner") {
    // Real W: not winless
    if (isContestedGame(feeder, gamesById)) return false;
    // Non-contested (bye / half shell): advance the only live side
    for (const sk of ["team1", "team2"]) {
      if (
        feeder[`${sk}_name`] ||
        feeder[`${sk}_source_game_id`] ||
        feeder[`${sk}_is_open_entry`]
      ) {
        // Prefer first live side; for true byes only one is live
        const other = sk === "team1" ? "team2" : "team1";
        const otherLive =
          feeder[`${other}_name`] ||
          feeder[`${other}_source_game_id`] ||
          feeder[`${other}_is_open_entry`];
        if (!otherLive) {
          return slotIsWinlessArrival(feeder, sk, gamesById, seen);
        }
      }
    }
    // Both sides "live" but not contested (e.g. two dead loser-of-bye) — empty
    // Try each side that is winless-capable
    const a = slotIsWinlessArrival(feeder, "team1", gamesById, new Set(seen));
    const b = slotIsWinlessArrival(feeder, "team2", gamesById, new Set(seen));
    return a || b;
  }

  // Loser of feeder: still 0 wins iff both entered that feeder winless
  return (
    slotIsWinlessArrival(feeder, "team1", gamesById, seen) &&
    slotIsWinlessArrival(feeder, "team2", gamesById, seen)
  );
}

/**
 * Both sides arrive winless (0–0 or 0–1) → loser of this game is always 0–2
 * and always enters the 3GG survivor pool (any field size).
 */
export function loserAlwaysZeroTwo(game, gamesById) {
  if (!game || game.is_bye || game.status === "cancelled") return false;
  if (game.bracket_side === "winners" || game.bracket_side === "final") return false;
  if (isSurvivorPoolGame(game)) return false;
  if (String(game.field ?? "") === "Re-entry") return false;
  return (
    slotIsWinlessArrival(game, "team1", gamesById) &&
    slotIsWinlessArrival(game, "team2", gamesById)
  );
}

/**
 * Paper numbers L# whose game is always 0–2 → pool, sorted.
 * @param {Map<string, number>} numberByGameId
 * @param {Map<string, object>} gamesById
 * @returns {number[]}
 */
export function alwaysZeroTwoLoserNumbers(numberByGameId, gamesById) {
  const out = [];
  for (const [id, n] of numberByGameId ?? []) {
    const g = gamesById?.get(id);
    if (g && loserAlwaysZeroTwo(g, gamesById)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}
