import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBracketResults, parsePoolResults, parsePlacements, normalizeTeam,
         stripSeedPrefix, isPlaceholderName } from "@/lib/quickscores";
import { fixture } from "./load.mjs";

// Saved from the live pages the hourly sync reads. If QuickScores changes
// their markup these fail here rather than by quietly finding zero games —
// which is exactly how five results went missing while the run reported
// "Already up to date".
const goldHtml = await fixture("quickscores-gold-bracket.html");
const poolHtml = await fixture("quickscores-pool-schedule.html");

test("pool play parses every game with both scores", () => {
  const games = parsePoolResults(poolHtml);
  assert.equal(games.length, 27);
  assert.ok(games.every((g) => g.teams.length === 2));
  const one = games.find((g) => g.teams.some((t) => t.name === "New Era"));
  assert.ok(one, "New Era should appear");
  assert.ok(one.teams.every((t) => typeof t.score === "number"));
});

test("brackets parse by anchor id, so an empty game box cannot swallow the next", () => {
  // The bug: an unplayed game's box has no </div> where the old regex
  // expected one, so its match ran on and ate the following game whole.
  // Silver game 12 vanished that way. Here we assert the Gold page yields
  // its scored games rather than a truncated list.
  const games = parseBracketResults(goldHtml);
  const scored = games.filter((g) => g.teams.length === 2 && g.teams.every((t) => t.score !== null));
  assert.equal(scored.length, 6, "Gold had six scored games when captured");
  const g1 = scored.find((g) => g.gameNumber === 1);
  assert.deepEqual(
    g1.teams.map((t) => `${t.name} ${t.score}`),
    ["Speed Demons 14", "Empire 7"]
  );
});

test("placements are read off the drawing", () => {
  const places = parsePlacements(goldHtml);
  assert.ok(places.length > 0, "Gold published at least one finish");
  assert.ok(places.every((p) => p.place && p.team));
});

test("seed prefixes come off, and a bare seed is not a team", () => {
  assert.equal(stripSeedPrefix("[A #1] New Era"), "New Era");
  assert.equal(stripSeedPrefix("[A] Say We Won't"), "Say We Won't");
  assert.equal(stripSeedPrefix("[A #1]"), "");
});

test("names match across the two systems' spelling", () => {
  assert.equal(normalizeTeam("  THE  Pliggas "), normalizeTeam("The Pliggas"));
  assert.equal(normalizeTeam("Say We Won’t"), normalizeTeam("Say We Won't"));
});

test("a provenance placeholder is not a team", () => {
  assert.ok(isPlaceholderName("Winner of Game 5"));
  assert.ok(isPlaceholderName("Loser of Game 12"));
  assert.ok(!isPlaceholderName("Backwards K"));
});
