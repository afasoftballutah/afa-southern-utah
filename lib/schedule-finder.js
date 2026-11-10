import { gameWhenShort } from "./bracket/tree.js";

/**
 * The schedule page's "Find your team" games, from getTournamentSchedule
 * rows (with timeLabel). Same row shape as the division page's finder:
 * day / time / field columns and newest-first sort, and an opponent still
 * waiting on a game reads "Winner G9" / "Loser G3" (team1From / team2From →
 * lib/slot-label.js via TeamFinder), not TBD. `pool` carries the division
 * name — this page spans divisions.
 */
export function scheduleFinderGames(rows, timeZone) {
  return (rows ?? []).map((row) => ({
    id: row.id,
    divisionId: row.divisionId ?? null,
    pool: row.divisionName,
    caption: [row.timeLabel, row.field].filter(Boolean).join(" · "),
    when: row.scheduledTime ?? null,
    whenShort: gameWhenShort(row.scheduledTime, timeZone),
    field: row.field ?? null,
    team1: row.team1,
    team2: row.team2,
    team1From: row.team1From ?? null,
    team2From: row.team2From ?? null,
    score1: row.score1,
    score2: row.score2,
    isFinal: row.isFinal,
  }));
}
