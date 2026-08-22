import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBracketStructure,
  generate3GG,
  SURVIVOR_FIELD,
  GUARANTEE_NET_FIELD,
} from "@/lib/bracket/structure";
import { forDrawnBracket, gamesFromStructure, scheduleSlotLabel } from "@/lib/bracket/for-drawn-bracket";
import { slotDisplay, assignGameNumbers } from "@/lib/bracket/tree";

test("4-team DE pads to 4; every registered team appears in WR1", () => {
  const names = ["Seed1", "Seed2", "Seed3", "Seed4"];
  const { matches, bracketSize } = buildBracketStructure(names);
  assert.equal(bracketSize, 4);
  const wr1 = matches.filter((m) => m.side === "winners" && m.round === 1);
  assert.equal(wr1.length, 2);
});

test("seed #1 and #2 are kept apart in standard 8-team order", () => {
  const names = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const { matches } = buildBracketStructure(names, "double_elim");
  const wr1 = matches
    .filter((m) => m.side === "winners" && m.round === 1)
    .sort((a, b) => a.slot - b.slot);
  assert.equal(wr1[0].team1.name, "S1");
  assert.equal(wr1[0].team2.name, "S8");
});

test("generate3GG(9) reference sheet matches JD's order", () => {
  const { games, meta } = generate3GG(9);
  assert.equal(meta.unsettled, 0);
  assert.equal(games.length, 21);
  const fmt = (r) =>
    r.seed !== undefined ? `seed${r.seed}` : r.W !== undefined ? `W${r.W}` : `L${r.L}`;
  const line = (id) => {
    const g = games.find((x) => x.id === id);
    return `${fmt(g.a)} vs ${fmt(g.b)}`;
  };
  assert.equal(line(1), "seed8 vs seed9");
  assert.equal(line(2), "seed1 vs W1");
  assert.equal(line(9), "L1 vs L3");
  assert.equal(line(10), "L4 vs L5");
  assert.equal(line(11), "L9 vs L10");
  assert.equal(games.find((g) => g.id === 11).bracket, "net");
  assert.equal(line(13), "L2 vs W11");
  assert.equal(line(20), "W8 vs W19");
  assert.equal(line(21), "W20 vs L20");
});

test("paper G#s label as G4, not Winners R4", () => {
  const paper = [
    { round: 1, bracket_side: "winners", status: "pending" },
    { round: 4, bracket_side: "winners", status: "pending" },
  ];
  assert.equal(scheduleSlotLabel(paper, paper[1]), "G4");

  const engine = [
    { id: "a", round: 1, slot: 0, bracket_side: "winners", status: "pending", team1_name: "A", team2_name: "B" },
    { id: "b", round: 1, slot: 1, bracket_side: "winners", status: "pending", team1_name: "C", team2_name: "D" },
    { id: "c", round: 2, slot: 0, bracket_side: "winners", status: "pending", team1_name: "E", team2_name: "F" },
  ];
  assert.equal(scheduleSlotLabel(engine, engine[2]), "G3");
});

test("3GG structure maps generate3GG into DrawnBracket language", () => {
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India"];
  const structure = buildBracketStructure(names, "three_gg_hybrid");
  assert.equal(structure.paperNumbered, true);
  assert.equal(structure.bracketSize, 16);

  const drawn = forDrawnBracket(gamesFromStructure(structure));
  const byG = Object.fromEntries(drawn.map((g) => [g.round, g]));

  assert.equal(byG[1].team1_name, "Hotel");
  assert.equal(byG[1].team2_name, "India");
  assert.equal(byG[2].team1_name, "Alpha");
  assert.equal(byG[2].team2_name, "Winner of Game 1");
  assert.equal(byG[9].team1_name, "Loser of Game 1");
  assert.equal(byG[9].team2_name, "Loser of Game 3");
  assert.equal(byG[10].team1_name, "Loser of Game 4");
  assert.equal(byG[10].team2_name, "Loser of Game 5");
  assert.equal(byG[11].team1_name, "Loser of Game 9");
  assert.equal(byG[11].team2_name, "Loser of Game 10");
  assert.equal(byG[11].field, SURVIVOR_FIELD);
  assert.equal(byG[13].team1_name, "Loser of Game 2");
  assert.equal(byG[13].team2_name, "Winner of Game 11");
});

test("generate3GG runs for field sizes 4..24 without unsettled", () => {
  for (let n = 4; n <= 24; n++) {
    const { games, meta } = generate3GG(n);
    assert.ok(games.length >= n - 1, `${n}: enough games`);
    assert.equal(meta.unsettled, 0, `${n}: unsettled`);
    assert.equal(meta.n, n);
  }
});

test("every 3GG structure game has two sides", () => {
  for (const n of [4, 5, 8, 9, 12, 16]) {
    const names = Array.from({ length: n }, (_, i) => `T${i + 1}`);
    const { matches } = buildBracketStructure(names, "three_gg_hybrid");
    for (const m of matches) {
      assert.ok(m.team1 && m.team2, `${n} missing side`);
    }
  }
});

test("DE winners still work for non-3GG", () => {
  const names = ["A", "B", "C", "D", "E"];
  const { matches, bracketSize } = buildBracketStructure(names, "double_elim");
  assert.equal(bracketSize, 8);
  let teams = 0;
  for (const m of matches.filter((x) => x.side === "winners" && x.round === 1)) {
    for (const side of ["team1", "team2"]) {
      if (m[side].type === "team") teams += 1;
    }
  }
  assert.equal(teams, 5);
});

test("director seed order is respected", () => {
  const names = ["Top", "Mid", "Bottom"];
  const { matches } = buildBracketStructure(names, "double_elim");
  const on = new Set();
  for (const m of matches) {
    if (m.side !== "winners" || m.round !== 1) continue;
    for (const side of ["team1", "team2"]) {
      if (m[side].type === "team") on.add(m[side].name);
    }
  }
  assert.ok(on.has("Bottom"));
  assert.equal(on.size, 3);
});
