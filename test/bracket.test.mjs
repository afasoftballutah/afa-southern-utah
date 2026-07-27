import { test } from "node:test";
import assert from "node:assert/strict";
import { json } from "./load.mjs";
import { mootIfRounds, championOf, findIfGames } from "@/lib/bracket/if-game";


// Real Heat Stroker data. Gold is the interesting one: Backwards K won the
// final undefeated, so its if-game is never played — the case that made the
// whole tournament read as unfinished until the rule existed.
const gold = await json("games-gold.json");
const silver = await json("games-silver.json");
const bronze = await json("games-bronze.json");

test("an if-game is recognised from the data, not the drawing", async () => {
  // Both slots fed by the SAME game, one taking the winner and one the loser.
  assert.equal(findIfGames(gold).length, 1);
  assert.equal(findIfGames(gold)[0].round, 17);
});

test("Gold's if-game is moot — the undefeated team won the final", () => {
  assert.deepEqual([...mootIfRounds(gold)], [17]);
});

test("Silver and Bronze needed their if-games, so neither is moot", () => {
  assert.deepEqual([...mootIfRounds(silver)], []);
  assert.deepEqual([...mootIfRounds(bronze)], []);
});

test("champions", () => {
  assert.equal(championOf(gold), "Backwards K");
  assert.equal(championOf(silver), "GWZ");
  assert.equal(championOf(bronze), "Ball Busters");
});

test("a bracket with a game still to play has no champion", () => {
  const unfinished = gold.map((g) =>
    g.round === 16 ? { ...g, status: "pending", team1_score: null, team2_score: null } : g
  );
  assert.equal(championOf(unfinished), null);
});

test("mootness depends on the FINISHED feeding game, not the if-game itself", () => {
  // Regression: getUpcomingGames once computed this from unplayed rows only,
  // which hid the very game the test needs and put the moot game under "Next".
  const unplayedOnly = gold.filter((g) => g.status !== "final");
  assert.deepEqual([...mootIfRounds(unplayedOnly)], [], "cannot decide without the final");
  assert.deepEqual([...mootIfRounds(gold)], [17], "decides with it");
});
