"use client";

import ScoreTable from "./ScoreTable";

// Score entry for the three TRANSCRIBED brackets (Gold, Silver, Bronze —
// dispatch-brief-24). These divisions were transcribed straight off the
// league's printed bracket and deliberately have no `brackets` row, so
// BracketManager's "no bracket yet — Generate" screen would render for them
// (wrong, and its Generate button would try to build a NEW structure over live
// seeded games). This never creates, resizes or reassigns a bracket; it only
// scores the games that already exist, and a save propagates forward through
// the unchanged app/api/scorekeeper/games/[id]/score route.
//
// The layout is ScoreTable, the same one pool play uses. It was a card per
// game under a heading per start time — 3176 pixels for seventeen games (JD,
// 2026-07-28: "make this something a lot easier to use, same principles").

export default function BracketScores({ games }) {
  return <ScoreTable games={games} kind="bracket" title="Bracket" />;
}
