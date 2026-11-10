// Winners / losers / final / if-necessary on the schedule timeline
// (lib/bracket/side.js). Read from bracket_side and the if-game's shape,
// never from game numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bracketSideOf, SIDE_LABELS } from "@/lib/bracket/side";

const FIXTURE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "worlds-2026-main-brackets.json"), "utf8")
);

const g = (o) => ({
  team1_source_game_id: null, team1_source_result: null,
  team2_source_game_id: null, team2_source_result: null, ...o,
});

test("bracket_side decides winners and losers; game number plays no part", () => {
  assert.equal(bracketSideOf(g({ round: 30, bracket_side: "winners" })), "winners");
  assert.equal(bracketSideOf(g({ round: 2, bracket_side: "losers" })), "losers");
});

test("the final side: the first final is the championship, the winner/loser rematch is the if-game", () => {
  const gf1 = g({ id: "a", round: 14, bracket_side: "final",
    team1_source_game_id: "w", team1_source_result: "winner",
    team2_source_game_id: "l", team2_source_result: "winner" });
  const gf2 = g({ id: "b", round: 15, bracket_side: "final",
    team1_source_game_id: "a", team1_source_result: "winner",
    team2_source_game_id: "a", team2_source_result: "loser" });
  assert.equal(bracketSideOf(gf1), "final");
  assert.equal(bracketSideOf(gf2), "if");
  // A single-game final (no if-game) is still the championship.
  assert.equal(bracketSideOf(g({ round: 7, bracket_side: "final" })), "final");
});

test("three_gg_hybrid runtime games (Survivor pool, Re-entry) are stored on the losers side", () => {
  assert.equal(bracketSideOf(g({ bracket_side: "losers", field: "Survivor pool" })), "losers");
  assert.equal(bracketSideOf(g({ bracket_side: "losers", field: "Re-entry" })), "losers");
});

test("no bracket_side → unclassified (null), never guessed", () => {
  assert.equal(bracketSideOf(g({ round: 1 })), null);
  assert.equal(bracketSideOf(g({ round: 1, bracket_side: "consolation" })), null);
  assert.equal(bracketSideOf(null), null);
});

test("every Worlds game classifies; each division has one championship and one if-game", () => {
  for (const { division, games } of FIXTURE) {
    const sides = games.filter((x) => !x.is_bye).map(bracketSideOf);
    assert.ok(!sides.includes(null), `${division}: unclassified game`);
    assert.equal(sides.filter((s) => s === "final").length, 1, division);
    assert.equal(sides.filter((s) => s === "if").length, 1, division);
    assert.ok(sides.includes("winners") && sides.includes("losers"), division);
  }
});

test("labels for the expanded sheet", () => {
  assert.equal(SIDE_LABELS.losers, "Losers bracket");
  assert.equal(SIDE_LABELS.winners, "Winners bracket");
  assert.equal(SIDE_LABELS.if, "If-necessary game");
});
