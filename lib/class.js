// Suggesting a class for a team from the players on it.
//
// JD, 2026-07-27: "The team registers for the tournament with the players and
// then gets put into a suggested class based on the tournament."
//
// Two things decide it, and they are separate:
//   1. THE ROSTER says how good the team is. A class is a rating a person
//      carries, so the team's level comes out of who showed up.
//   2. THE TOURNAMENT says which levels exist. A D team at an event running
//      only Rec and E has to play E, because there is no D to put them in.
//
// The result is a SUGGESTION. It is never written anywhere on its own — the
// director enters the team, and a suggestion that overrode them would be
// worse than none, because they know things a roster does not say.

// ---------------------------------------------------------------------------
// THE RULE, in one place, because it is league policy and not a fact.
//
// JD, 2026-07-27: "the team should play at the level of its 4th best player."
//
// Line the roster up strongest first and read off the Nth. It survives both
// ways a roster gets gamed: one ringer on a weak team does not move it, and
// four strong players cannot hide behind eight weak ones.
//
// Changing RANK is the whole change. RANK = 1 would be "best player wins".
// ---------------------------------------------------------------------------
const RANK = 4;

/**
 * @param {{class_id: string|null}[]} players     the active roster
 * @param {{id: string, name: string, sort_order: number}[]} classes  all classes
 * @param {string[]|null} offeredClassIds   classes this tournament runs, or
 *                                          null when it does not say
 * @returns {{
 *   classId: string|null, className: string|null,
 *   counts: {name: string, count: number}[],
 *   rated: number, unrated: number,
 *   cappedFrom: string|null,
 *   provisional: boolean,
 *   reason: string
 * }}
 */
export function suggestClass(players, classes, offeredClassIds = null) {
  const byId = new Map((classes ?? []).map((c) => [c.id, c]));
  const ranked = [...(classes ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const rated = (players ?? []).filter((p) => p.class_id && byId.has(p.class_id));
  const unrated = (players ?? []).length - rated.length;

  const counts = ranked
    .map((c) => ({ name: c.name, count: rated.filter((p) => p.class_id === c.id).length }))
    .filter((c) => c.count > 0);

  if (rated.length === 0) {
    return {
      classId: null,
      className: null,
      counts,
      rated: 0,
      unrated,
      cappedFrom: null,
      reason:
        unrated > 0
          ? `No player on this roster has a class yet. Rate them and a suggestion appears.`
          : `No players on the roster yet.`,
    };
  }

  // Strongest first, then read off the RANK-th. With fewer than RANK rated
  // players there is no Nth, so fall back to the weakest one KNOWN and say the
  // answer is provisional — treating a three-player sample as the rule would
  // quietly enter teams at the wrong level.
  const strongestFirst = [...rated].sort(
    (a, b) => byId.get(b.class_id).sort_order - byId.get(a.class_id).sort_order
  );
  const provisional = strongestFirst.length < RANK;
  let chosen = byId.get(
    strongestFirst[Math.min(RANK, strongestFirst.length) - 1].class_id
  );

  // Now clamp to what this tournament actually runs.
  let cappedFrom = null;
  if (Array.isArray(offeredClassIds) && offeredClassIds.length > 0) {
    const offered = ranked.filter((c) => offeredClassIds.includes(c.id));
    if (offered.length > 0 && !offered.some((c) => c.id === chosen.id)) {
      const highestOffered = offered[offered.length - 1];
      const lowestOffered = offered[0];
      cappedFrom = chosen.name;
      chosen =
        chosen.sort_order > highestOffered.sort_order ? highestOffered : lowestOffered;
    }
  }

  const ordinal = { 1: "best", 2: "2nd best", 3: "3rd best" }[RANK] ?? `${RANK}th best`;
  let reason = provisional
    ? `Only ${rated.length} ${rated.length === 1 ? "player is" : "players are"} rated, so there is no ${ordinal} player yet. This is the weakest rated one.`
    : `${ordinal[0].toUpperCase()}${ordinal.slice(1)} player on the roster is ${chosen.name}.`;
  if (cappedFrom) {
    reason += ` This tournament does not run ${cappedFrom}, so ${chosen.name} is the closest it offers.`;
  }
  if (unrated > 0) {
    reason += ` ${unrated} ${unrated === 1 ? "player has" : "players have"} no class yet, so this could change.`;
  }

  return {
    classId: chosen.id,
    className: chosen.name,
    counts,
    rated: rated.length,
    unrated,
    cappedFrom,
    provisional,
    reason,
  };
}

/** "3 D · 5 E · 2 Rec" — the breakdown a director reads to check the suggestion. */
export function formatCounts(counts) {
  if (!counts?.length) return "nobody rated";
  return [...counts].reverse().map((c) => `${c.count} ${c.name}`).join(" · ");
}
