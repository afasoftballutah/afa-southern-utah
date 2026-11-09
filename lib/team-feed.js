// Team calendar feed (games.ics?team=…&division=…) — who is in it.
//
// JD, 2026-11-09: "the calendar subscription is subscribing to all teams
// with the matched name, not just the relevant one". The feed matched on
// the team NAME across the whole tournament, and names repeat: Worlds has a
// Fallen in Men's D and another in Men's E, the T-Shirt tournament a
// Fallen in four divisions. The subscribe link now also carries the
// division it was made on, and the feed keeps to that division's family —
// the division, its parent, and the parent's other stages (a pool parent
// with Gold/Silver bracket children is one team's whole tournament).
//
// Names, not registrations: Worlds Women's Rec has no registrations, and a
// bracket slot only gets a name when the W#/L# it waits on is decided. Both
// are covered by matching the name on the game rows, so a game shows up in
// the feed the moment the bracket names the team.

/**
 * Ids in the same division family as `divisionId`, or null when the id is
 * not one of this tournament's divisions (the caller then falls back to
 * name-only, the old behavior, rather than an empty calendar).
 * @param {{id: string, parent_division_id?: string|null}[]} divisions
 */
export function divisionFamily(divisions, divisionId) {
  if (!divisionId) return null;
  const list = divisions ?? [];
  const self = list.find((d) => d.id === divisionId);
  if (!self) return null;
  const root = self.parent_division_id ?? self.id;
  return new Set(
    list.filter((d) => d.id === root || d.parent_division_id === root).map((d) => d.id)
  );
}

/** The schedule rows (lib/data getTournamentSchedule) that go in a team's feed. */
export function teamFeedGames(rows, { team, family = null }) {
  return (rows ?? []).filter(
    (g) =>
      (g.team1 === team || g.team2 === team) &&
      (!family || family.has(g.divisionId))
  );
}

/** The subscribe link: webcal:// once the host is known, plain path before. */
export function teamFeedHref({ host = null, slug, team, divisionId = null }) {
  const qs = new URLSearchParams({ team });
  if (divisionId) qs.set("division", divisionId);
  return `${host ? `webcal://${host}` : ""}/tournaments/${slug}/games.ics?${qs.toString()}`;
}

// SEQUENCE for every VEVENT. Calendar clients that honor it (Outlook,
// some CalDAV bridges) only accept an edited event whose SEQUENCE went up.
// The games table has no reliable "changed" stamp (bracket advancement
// fills names without touching updated_at), so the feed version is the
// minute it was built: it only ever goes up, so a moved field, a new time
// or an opponent arriving from W#/L# always replaces the event in place.
const SEQ_EPOCH = Date.UTC(2026, 0, 1);
export function feedSequence(now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - SEQ_EPOCH) / 60_000));
}

/**
 * For a division's games: (sourceGameId, "winner"|"loser") → "Winner of
 * Game 5", the words a hand-built bracket stores, for a slot a sheet-loaded
 * bracket leaves empty until that game is decided. Null when there is no
 * source in this division.
 */
export function sourceSlotLabeler(divisionGames) {
  const roundById = new Map((divisionGames ?? []).map((g) => [g.id, g.round]));
  return (sourceId, result) =>
    sourceId && roundById.has(sourceId)
      ? `${result === "loser" ? "Loser" : "Winner"} of Game ${roundById.get(sourceId)}`
      : null;
}
