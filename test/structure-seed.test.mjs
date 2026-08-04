import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBracketStructure } from "@/lib/bracket/structure";

/** Collect WR1 team names in seed-list order (#1 first). */
function wr1TeamsInSeedOrder(teamNames) {
  const { matches, bracketSize } = buildBracketStructure(teamNames, "double_elim");
  const wr1 = matches
    .filter((m) => m.side === "winners" && m.round === 1)
    .sort((a, b) => a.slot - b.slot);

  // Reconstruct placement: for each seed rank, which WR1 slot holds it
  const bySeed = new Map();
  for (const m of wr1) {
    for (const side of ["team1", "team2"]) {
      const cell = m[side];
      if (cell?.type === "team") {
        const rank = teamNames.indexOf(cell.name) + 1;
        bySeed.set(rank, { matchSlot: m.slot, side, name: cell.name });
      }
    }
  }
  return { wr1, bracketSize, bySeed };
}

test("4-team DE pads to 4; every registered team appears in WR1", () => {
  const names = ["Seed1", "Seed2", "Seed3", "Seed4"];
  const { matches, bracketSize } = buildBracketStructure(names);
  assert.equal(bracketSize, 4);
  const wr1 = matches.filter((m) => m.side === "winners" && m.round === 1);
  assert.equal(wr1.length, 2);
  const placed = new Set();
  for (const m of wr1) {
    for (const side of ["team1", "team2"]) {
      if (m[side].type === "team") placed.add(m[side].name);
    }
  }
  assert.deepEqual([...placed].sort(), [...names].sort());
});

test("seed #1 and #2 are kept apart in standard 8-team order", () => {
  // Standard seedOrder(8) = [1,8,4,5,2,7,3,6] → WR1 slots:
  // slot0: #1 vs #8, slot1: #4 vs #5, slot2: #2 vs #7, slot3: #3 vs #6
  const names = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const { wr1, bySeed } = wr1TeamsInSeedOrder(names);
  assert.equal(wr1.length, 4);

  assert.equal(bySeed.get(1).name, "S1");
  assert.equal(bySeed.get(2).name, "S2");
  // #1 and #2 must not share a WR1 match
  assert.notEqual(bySeed.get(1).matchSlot, bySeed.get(2).matchSlot);

  // Expected pairings from standard bracket seeding
  const pair = (slot) => {
    const m = wr1.find((x) => x.slot === slot);
    return [m.team1.name, m.team2.name];
  };
  assert.deepEqual(pair(0), ["S1", "S8"]);
  assert.deepEqual(pair(1), ["S4", "S5"]);
  assert.deepEqual(pair(2), ["S2", "S7"]);
  assert.deepEqual(pair(3), ["S3", "S6"]);
});

test("5-team DE pads to 8 with byes; all 5 teams still appear", () => {
  const names = ["A", "B", "C", "D", "E"];
  const { matches, bracketSize } = buildBracketStructure(names);
  assert.equal(bracketSize, 8);
  const wr1 = matches.filter((m) => m.side === "winners" && m.round === 1);
  const teams = [];
  let byes = 0;
  for (const m of wr1) {
    for (const side of ["team1", "team2"]) {
      if (m[side].type === "team") teams.push(m[side].name);
      if (m[side].type === "bye") byes += 1;
    }
  }
  assert.equal(teams.length, 5);
  assert.equal(byes, 3);
  assert.deepEqual([...teams].sort(), [...names].sort());
});

test("director seed order is respected — last in list is lowest seed, not dropped", () => {
  // Worst seed still on the bracket (0–2 pool / #N case)
  const names = ["Top", "Mid", "Bottom"];
  const { matches } = buildBracketStructure(names);
  const namesOnBracket = new Set();
  for (const m of matches) {
    if (m.side !== "winners" || m.round !== 1) continue;
    for (const side of ["team1", "team2"]) {
      if (m[side].type === "team") namesOnBracket.add(m[side].name);
    }
  }
  assert.ok(namesOnBracket.has("Bottom"), "lowest seed must still appear in WR1");
  assert.equal(namesOnBracket.size, 3);
});
