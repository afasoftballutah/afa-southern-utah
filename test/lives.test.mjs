import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countMainRecord,
  isZeroTwoAfterLoss,
  isTerminalTitleExit,
  isThirdLifeExhausted,
  shouldSoloReenter,
  takeSurvivorPair,
  appendSurvivorPool,
  removeFromSurvivorPool,
  isSurvivorPoolGame,
  SURVIVOR_POOL_FIELD,
} from "@/lib/bracket/lives";
import { SURVIVOR_FIELD } from "@/lib/bracket/structure";

function final(winner, loser) {
  return {
    status: "final",
    is_bye: false,
    winner_slot: "team1",
    team1_name: winner,
    team2_name: loser,
  };
}

test("countMainRecord ignores byes and non-finals", () => {
  const games = [
    final("A", "Cold"),
    { status: "pending", is_bye: false, winner_slot: null, team1_name: "Cold", team2_name: "B" },
    {
      status: "final",
      is_bye: true,
      winner_slot: "team1",
      team1_name: "Cold",
      team2_name: null,
    },
  ];
  assert.deepEqual(countMainRecord(games, "Cold"), { wins: 0, losses: 1 });
});

test("0–2 is third-life candidate; 1–2 is not", () => {
  assert.equal(isZeroTwoAfterLoss([final("A", "Cold"), final("B", "Cold")], "Cold"), true);
  assert.equal(
    isZeroTwoAfterLoss([final("Cold", "X"), final("Y", "Cold"), final("Z", "Cold")], "Cold"),
    false
  );
});

test("three_gg_hybrid title exit: 0–2 not terminal; 1–2 is", () => {
  const zeroTwo = [final("A", "Cold"), final("B", "Cold")];
  assert.equal(isTerminalTitleExit("three_gg_hybrid", zeroTwo, "Cold"), false);
  assert.equal(isTerminalTitleExit("double_elim", zeroTwo, "Cold"), true);
  const oneTwo = [final("Cold", "X"), final("Y", "Cold"), final("Z", "Cold")];
  assert.equal(isTerminalTitleExit("three_gg_hybrid", oneTwo, "Cold"), true);
});

test("third life exhausted at 0–3", () => {
  assert.equal(
    isThirdLifeExhausted([final("A", "Cold"), final("B", "Cold"), final("C", "Cold")], "Cold"),
    true
  );
});

test("solo re-enter and pool helpers", () => {
  const onlyCold = [final("A", "Cold"), final("B", "Cold"), final("A", "B")];
  assert.equal(shouldSoloReenter(["Cold"], onlyCold, ["A", "B", "Cold"]), true);
  assert.deepEqual(takeSurvivorPair(["A", "B", "C"]), { a: "A", b: "B", rest: ["C"] });
  assert.deepEqual(appendSurvivorPool(["A"], "B"), ["A", "B"]);
  assert.deepEqual(removeFromSurvivorPool(["A", "B", "C"], "B"), ["A", "C"]);
  assert.equal(isSurvivorPoolGame({ field: SURVIVOR_POOL_FIELD }), true);
  assert.equal(SURVIVOR_POOL_FIELD, SURVIVOR_FIELD);
});
