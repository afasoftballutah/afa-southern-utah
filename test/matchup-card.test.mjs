import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("MatchupCard shows trophy/silver only when championship is set", () => {
  const card = src("components/ui/MatchupCard.js");
  assert.match(card, /championship/);
  assert.match(card, /showMedals/);
  assert.match(card, /Boolean\(championship\)/);
  // Scores and winner-on-top still follow isFinal (game is scored).
  assert.match(card, /score=\{isFinal \? top\.score : null\}/);
  assert.match(card, /if \(isFinal && won2\)/);
});

test("team page and home finals pass championship; pool rows do not", () => {
  assert.match(src("app/teams/[slug]/page.js"), /championship=\{g\.championship\}/);
  assert.match(src("components/HomeRecentResults.js"), /isFinal\s+championship/);
  assert.doesNotMatch(
    src("app/tournaments/[slug]/division/[divisionId]/page.js"),
    /championship=/
  );
});
