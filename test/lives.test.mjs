import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countMainRecord,
  isZeroTwoAfterLoss,
  isTerminalTitleExit,
  isThirdLifeExhausted,
} from "@/lib/bracket/lives";

/** Minimal final game row for lives accounting. */
function final(winner, loser, extras = {}) {
  return {
    status: "final",
    is_bye: false,
    winner_slot: "team1",
    team1_name: winner,
    team2_name: loser,
    ...extras,
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
  const zeroTwo = [final("A", "Cold"), final("B", "Cold")];
  assert.equal(isZeroTwoAfterLoss(zeroTwo, "Cold"), true);
  assert.deepEqual(countMainRecord(zeroTwo, "Cold"), { wins: 0, losses: 2 });

  const oneTwo = [
    final("Cold", "X"), // 1-0
    final("Y", "Cold"), // 1-1
    final("Z", "Cold"), // 1-2
  ];
  assert.equal(isZeroTwoAfterLoss(oneTwo, "Cold"), false);
  assert.deepEqual(countMainRecord(oneTwo, "Cold"), { wins: 1, losses: 2 });
});

test("three_gg_hybrid: 0–2 is not a terminal title exit; 1–2 is", () => {
  const zeroTwo = [final("A", "Cold"), final("B", "Cold")];
  assert.equal(isTerminalTitleExit("three_gg_hybrid", zeroTwo, "Cold"), false);
  assert.equal(isTerminalTitleExit("double_elim", zeroTwo, "Cold"), true);

  const oneTwo = [
    final("Cold", "X"),
    final("Y", "Cold"),
    final("Z", "Cold"),
  ];
  assert.equal(isTerminalTitleExit("three_gg_hybrid", oneTwo, "Cold"), true);
});

test("third life is exhausted at 0–3", () => {
  const zeroThree = [
    final("A", "Cold"),
    final("B", "Cold"),
    final("C", "Cold"),
  ];
  assert.equal(isThirdLifeExhausted(zeroThree, "Cold"), true);
  assert.equal(isThirdLifeExhausted([final("A", "Cold"), final("B", "Cold")], "Cold"), false);
});
