import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlayableGame, isStillToPlay, stillToPlayIn, isFinished,
         isTournamentFinished } from "@/lib/tournament-state";
import { mootIfRounds } from "@/lib/bracket/if-game";
import { json } from "./load.mjs";

const gold = await json("games-gold.json");
const silver = await json("games-silver.json");
const bronze = await json("games-bronze.json");

test("Heat Stroker is finished, despite one unplayed game", () => {
  // THE case the whole shared predicate exists for. Gold has 17 games and
  // one of them — the if-game Backwards K made unnecessary by winning the
  // final undefeated — will never be played. A naive
  // `every(g => g.status === "final")` calls this unfinished and the
  // archive renders nowhere.
  const unplayed = gold.filter((g) => g.status !== "final");
  assert.equal(unplayed.length, 1, "exactly one game left on paper");
  assert.equal(unplayed[0].round, 17);
  assert.equal(isFinished({ gold, silver, bronze }), true);
});

test("a genuinely unplayed game keeps a tournament open", () => {
  const withPending = gold.map((g) =>
    g.round === 8 ? { ...g, status: "pending", team1_score: null, team2_score: null } : g
  );
  assert.equal(isFinished({ gold: withPending, silver, bronze }), false);
});

test("a tournament with no games has not started, so it is not finished", () => {
  assert.equal(isFinished({}), false);
  assert.equal(isFinished({ a: [] }), false);
  assert.equal(isFinished([]), false);
});

test("byes and cancelled games do not hold a tournament open", () => {
  const withNoise = [
    ...gold,
    { id: "b", division_id: gold[0].division_id, round: 90, status: "pending", is_bye: true },
    { id: "c", division_id: gold[0].division_id, round: 91, status: "cancelled", is_bye: false },
  ];
  assert.equal(isFinished({ gold: withNoise, silver, bronze }), true);
});

test("the shape of the input does not change the answer", () => {
  // Map, object, flat array with division_id, and list-of-lists all agree —
  // callers hand it whichever they happen to have.
  const flat = [...gold, ...silver, ...bronze];
  const asMap = new Map([["g", gold], ["s", silver], ["b", bronze]]);
  assert.equal(isFinished(flat), true);
  assert.equal(isFinished(asMap), true);
  assert.equal(isFinished([gold, silver, bronze]), true);
  assert.equal(isFinished({ gold, silver, bronze }), true);
});

test("isTournamentFinished walks divisions, mixing bracket and pool rows", () => {
  const finished = {
    divisions: [
      { id: "gold", games: gold },
      { id: "coed", pool_games: [{ id: "p", status: "final" }] },
    ],
  };
  assert.equal(isTournamentFinished(finished), true);

  const open = {
    divisions: [
      { id: "gold", games: gold },
      { id: "coed", pool_games: [{ id: "p", status: "scheduled" }] },
    ],
  };
  assert.equal(isTournamentFinished(open), false);
  assert.equal(isTournamentFinished({ divisions: [] }), false);
  assert.equal(isTournamentFinished(null), false);
});

test("the predicate agrees with itself across its three callers", () => {
  // getUpcomingGames, computeTeamStatus and isFinished must exclude the
  // same things. If they ever disagree, the Next tab, the elimination
  // logic and the archive drift apart.
  const moot = mootIfRounds(gold);
  const mootGame = gold.find((g) => g.round === 17);
  assert.equal(isPlayableGame(mootGame, moot), false);
  assert.equal(isStillToPlay(mootGame, moot), false);
  assert.deepEqual(stillToPlayIn(gold), []);
});
