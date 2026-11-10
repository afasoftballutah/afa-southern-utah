// One team slot of a game, the way a person reads it (JD, 2026-11-09:
// "instead of TBD can we have Winner GX, Loser GY"):
//   - the team, once it is known;
//   - "Winner G9" / "Loser G3" while the slot waits on another game —
//     the game number of its source game, the bracket's (W9)/(L3) in words;
//   - "TBD" only when nothing feeds the slot at all.
// Short on purpose: it has to fit a phone row next to a score.
// Display only — the stored names ("Winner of Game 9", or null plus a
// source link) are untouched.

export const NO_SOURCE = "TBD";

// "Winner of Game 9" (hand-built brackets, lib/team-feed sourceSlotLabeler),
// "Winner of G9", "Winner G9", and the timeline's compact "W-G9".
const WORDS = /^\s*(winner|loser)\s+(?:of\s+)?(?:game\s*|g\s*)(\d+)\s*$/i;
const COMPACT = /^\s*([WL])-G(\d+)\s*$/;

/** { result: "winner" | "loser", game: 9 } for a feed placeholder, else null. */
export function parseFeed(text) {
  if (typeof text !== "string") return null;
  const m = WORDS.exec(text) ?? COMPACT.exec(text);
  if (!m) return null;
  const k = m[1].toLowerCase();
  return { result: k === "l" || k === "loser" ? "loser" : "winner", game: Number(m[2]) };
}

/** "Winner G9" / "Loser G3"; null without a game number. */
export function feedLabel(result, game) {
  if (game == null || game === "") return null;
  return `${result === "loser" ? "Loser" : "Winner"} G${game}`;
}

/**
 * What a slot shows. `name` is the stored team name (may itself be a feed
 * placeholder); `from` is the source-game words for an empty slot
 * ("Winner of Game 9"). Falls back to `fallback` ("TBD") only when neither
 * names a team or a source game.
 */
export function slotLabel(name, from, fallback = NO_SOURCE) {
  for (const t of [name, from]) {
    if (t == null || String(t).trim() === "") continue;
    const f = parseFeed(t);
    return f ? feedLabel(f.result, f.game) : String(t);
  }
  return fallback;
}

// The tree's paper shorthand ("W5" / "L12", lib/bracket/tree.js slotDisplay).
// Only ever read from slotDisplay's own output, never from a stored team
// name, so a team called "L7" is not mistaken for a feed.
const PAPER = /^([WL])(\d+)$/;

/** "W5" → "Winner G5", "L12" → "Loser G12"; anything else unchanged. */
export function paperFeedWords(text) {
  const m = PAPER.exec(text ?? "");
  return m ? feedLabel(m[1] === "L" ? "loser" : "winner", m[2]) : text;
}

/** True when the slot has no team yet (empty, or a feed placeholder). */
export function isWaitingSlot(name) {
  return !name || !!parseFeed(name);
}

/**
 * For a set of games: (sourceGameId, result) → "Winner G9", using the
 * source game's number (round). Null when the source isn't in the set.
 */
export function sourceLabeler(games) {
  const roundById = new Map((games ?? []).map((g) => [g.id, g.round]));
  return (sourceId, result) =>
    sourceId && roundById.has(sourceId) ? feedLabel(result, roundById.get(sourceId)) : null;
}

/** Both slots' source labels for one game row from the DB. */
export function sourceLabelsFor(game, label) {
  return {
    team1From: game?.team1_name ? null : label(game?.team1_source_game_id, game?.team1_source_result),
    team2From: game?.team2_name ? null : label(game?.team2_source_game_id, game?.team2_source_result),
  };
}
