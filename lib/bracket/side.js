// Which part of the bracket a game belongs to, for the schedule timeline
// (JD, 2026-11-09: "is there a way to make a distinction between winners
// bracket and losers bracket?").
//
// Read from the game's own bracket_side — the same column BracketTree
// splits WINNERS / LOSERS / FINAL on (lib/bracket/tree.js splitSides) —
// never from game numbers. Runtime three_gg_hybrid games (Survivor pool,
// Re-entry) are written with bracket_side "losers" (propagate.js), so
// they land on the losers side too. Inside the final side, the
// if-necessary game is told apart by its shape (lib/bracket/if-game.js):
// both slots fed by the same game, one its winner and one its loser.

import { isIfGameShape } from "@/lib/bracket/if-game";

export const SIDE_LABELS = {
  winners: "Winners bracket",
  losers: "Losers bracket",
  final: "Championship",
  if: "If-necessary game",
  pool: "Pool play",
};

/** "winners" | "losers" | "final" | "if" for a bracket game; null when the data doesn't say. */
export function bracketSideOf(game) {
  switch (game?.bracket_side) {
    case "winners":
      return "winners";
    case "losers":
      return "losers";
    case "final":
      return isIfGameShape(game) ? "if" : "final";
    default:
      return null;
  }
}
