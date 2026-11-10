// A followed team's games and their NEXT one — shared by the drawn bracket
// (components/bracket/DrawnBracket.js) and the schedule timeline
// (components/ScheduleTimeline.js), so "next game" means the same thing on
// both pages.
//
// Each game is { id, team1, team2, final, cancelled?, when } where `when`
// is an ISO time, a millisecond number, or null (not yet timed).
// Names match trimmed and case-insensitively, the way the bracket always has.

const norm = (n) => String(n ?? "").trim().toLowerCase();

/** Is `team` in this game? */
export function playsIn(game, team) {
  const t = norm(team);
  if (!t) return false;
  return norm(game?.team1) === t || norm(game?.team2) === t;
}

/** The ids of every game `team` is in. */
export function teamGameIds(games, team) {
  return new Set((games ?? []).filter((g) => playsIn(g, team)).map((g) => g.id));
}

/**
 * The team's next game: the earliest one that is not final (or cancelled).
 * A game in progress counts — it is the one they are playing. Untimed games
 * come after every timed one. No team, or nothing left → null.
 */
export function teamNextGame(games, team) {
  let best = null;
  for (const g of games ?? []) {
    if (!playsIn(g, team) || g.final || g.cancelled) continue;
    const when = g.when == null ? Infinity : typeof g.when === "number" ? g.when : new Date(g.when).getTime();
    const at = Number.isNaN(when) ? Infinity : when;
    if (!best || at < best.at) best = { id: g.id, at };
  }
  return best ? best.id : null;
}

/** Schedule rows (lib/data.js getTournamentSchedule) in the shape above. */
export function fromScheduleRows(rows) {
  return (rows ?? []).map((r) => ({
    id: r.id,
    team1: r.team1,
    team2: r.team2,
    final: Boolean(r.isFinal || r.status === "final"),
    cancelled: r.status === "cancelled",
    when: r.scheduledTime ?? null,
  }));
}
