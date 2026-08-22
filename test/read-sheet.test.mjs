import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalFeedName,
  matchKnownTeam,
  missingSheetTeams,
  parseSheetClock,
  parseSheetModelText,
  seatFromSheetName,
} from "@/lib/bracket/read-sheet";

test("Winner/Loser of Game N is canonical", () => {
  assert.equal(canonicalFeedName("winner of game 7"), "Winner of Game 7");
  assert.equal(canonicalFeedName("Loser of Game 10"), "Loser of Game 10");
  assert.equal(canonicalFeedName("Fallen"), "Fallen");
});

test("known team names win over OCR noise", () => {
  const known = ["Dirtbags", "GloveWorks", "Has Beens"];
  assert.equal(matchKnownTeam("dirtbags", known), "Dirtbags");
  assert.equal(matchKnownTeam("Loser of Game 3", known), "Loser of Game 3");
  assert.equal(matchKnownTeam("New Team", known), "New Team");
});

test("sheet clocks become HH:MM", () => {
  assert.equal(parseSheetClock("9:00 AM"), "09:00");
  assert.equal(parseSheetClock("9a"), "09:00");
  assert.equal(parseSheetClock("2:00 PM"), "14:00");
  assert.equal(parseSheetClock("21:00"), "21:00");
  assert.equal(parseSheetClock(""), null);
});

test("model JSON becomes a sorted draft", () => {
  const { games } = parseSheetModelText(
    '```json\n{"games":[{"n":10,"a":"Winner of Game 6","b":"loser of game 7","time":"2:00 PM"},{"n":1,"a":"Dirtbags","b":"gloveworks"}]}\n```',
    { knownTeams: ["Dirtbags", "GloveWorks"], playDay: "2026-08-22" }
  );
  assert.equal(games[0].n, 1);
  assert.equal(games[0].a, "Dirtbags");
  assert.equal(games[0].b, "GloveWorks");
  assert.equal(games[1].a, "Winner of Game 6");
  assert.equal(games[1].b, "Loser of Game 7");
  assert.equal(games[1].time, "14:00");
  assert.ok(games[1].scheduledTime);
});

test("names not already in the division are new teams", () => {
  const games = [
    { n: 1, a: "Dirtbags", b: "New Era" },
    { n: 6, a: "Loser of Game 1", b: "New Era" },
  ];
  assert.deepEqual(missingSheetTeams(games, ["Dirtbags"]), ["New Era"]);
  assert.deepEqual(missingSheetTeams(games, ["Dirtbags", "New Era"]), []);
});

test("a feed seat keeps the paper words and links when the game exists", () => {
  const byRound = new Map([[7, "abc"]]);
  const s = seatFromSheetName("Loser of Game 7", byRound);
  assert.equal(s.name, "Loser of Game 7");
  assert.equal(s.sourceId, "abc");
  assert.equal(s.sourceResult, "loser");
  const missing = seatFromSheetName("Winner of Game 9", byRound);
  assert.equal(missing.sourceId, null);
  assert.equal(missing.name, "Winner of Game 9");
});
