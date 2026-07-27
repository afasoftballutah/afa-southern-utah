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

// -------------------------------------------------------------------------
// THE RULE, in one place, because it is league policy and not a fact.
//
// Today: the team plays at the level of its BEST player. That is the
// conservative reading — it is the one that cannot be gamed by adding weaker
// players around a ringer, which is the failure every sanctioning body writes
// its rules against.
//
// It is probably not JD's actual rule. Most bodies use a threshold ("three or
// more D players and the team plays D"), which lets one strong player guest
// on a lower team without dragging it up. THRESHOLD below is where that goes:
// set it to 3 and the rule becomes "three at a level or above puts you there".
// Nothing else needs to change.
// -------------------------------------------------------------------------
const THRESHOLD = 1;

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

  // Walk from the top down and take the first level with enough players at or
  // above it. With THRESHOLD = 1 this is simply "the best player's class".
  let chosen = null;
  for (let i = ranked.length - 1; i >= 0; i -= 1) {
    const atOrAbove = rated.filter(
      (p) => byId.get(p.class_id).sort_order >= ranked[i].sort_order
    ).length;
    if (atOrAbove >= THRESHOLD) {
      chosen = ranked[i];
      break;
    }
  }
  if (!chosen) chosen = ranked[0];

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

  const best = counts[counts.length - 1];
  let reason =
    THRESHOLD === 1
      ? `Highest-rated player on the roster is ${best.name}.`
      : `${THRESHOLD} or more players at ${chosen.name} or above.`;
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
    reason,
  };
}

/** "3 D · 5 E · 2 Rec" — the breakdown a director reads to check the suggestion. */
export function formatCounts(counts) {
  if (!counts?.length) return "nobody rated";
  return [...counts].reverse().map((c) => `${c.count} ${c.name}`).join(" · ");
}
