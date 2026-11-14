import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pillHonors } from "@/lib/matchup-honors";

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("pillHonors: championship is trophy/silver with no place text", () => {
  assert.deepEqual(pillHonors({ championship: true, decided: true, won: true, place: "2nd" }), {
    medal: "gold",
    place: null,
  });
  assert.deepEqual(pillHonors({ championship: true, decided: true, won: false, place: "2nd" }), {
    medal: "silver",
    place: null,
  });
  assert.deepEqual(pillHonors({ championship: true, decided: false, won: false, place: null }), {
    medal: null,
    place: null,
  });
});

test("pillHonors: 3rd gets bronze plus the place; other places are text only", () => {
  assert.deepEqual(pillHonors({ championship: false, decided: true, won: false, place: "3rd" }), {
    medal: "bronze",
    place: "3rd",
  });
  assert.deepEqual(pillHonors({ championship: false, decided: true, won: false, place: "5th" }), {
    medal: null,
    place: "5th",
  });
  assert.deepEqual(pillHonors({ championship: false, decided: true, won: false, place: "13th" }), {
    medal: null,
    place: "13th",
  });
  assert.deepEqual(pillHonors({ championship: false, decided: true, won: true, place: null }), {
    medal: null,
    place: null,
  });
});

test("MatchupCard still shows scores and winner-on-top from isFinal", () => {
  const card = src("components/ui/MatchupCard.js");
  assert.match(card, /score=\{isFinal \? top\.score : null\}/);
  assert.match(card, /if \(isFinal && won2\)/);
  assert.match(card, /pillHonors/);
  assert.match(card, /bronze/);
});

test("team page passes championship and places; pool rows do not", () => {
  assert.match(src("app/teams/[slug]/page.js"), /championship=\{g\.championship\}/);
  assert.match(src("app/teams/[slug]/page.js"), /team1Place=\{g\.team1Place\}/);
  assert.match(src("app/teams/[slug]/page.js"), /team2Place=\{g\.team2Place\}/);
  assert.match(src("components/HomeRecentResults.js"), /isFinal\s+championship/);
  assert.doesNotMatch(
    src("app/tournaments/[slug]/division/[divisionId]/page.js"),
    /championship=/
  );
});
