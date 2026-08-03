/**
 * 3GG hybrid lives: most teams out at 2 bracket losses; a pure 0–2
 * (zero wins, two losses) team gets a third life and can still win.
 * Pool losses never count — only finalized non-bye main games.
 */

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
 * After this final game, is the loser a pure 0–2 (third-life candidate)?
 * @param {Array} mainGamesBeforeOrWith - all main games including this one finalized
 */
export function isZeroTwoAfterLoss(mainGames, loserName) {
  const { wins, losses } = countMainRecord(mainGames, loserName);
  return wins === 0 && losses === 2;
}

/**
 * Should this eliminating loss fully remove the team from title contention?
 * three_gg_hybrid: 0–2 is NOT terminal (third life). 1–2 is terminal.
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
