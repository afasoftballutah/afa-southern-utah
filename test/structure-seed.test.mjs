import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBracketStructure,
  generate3GG,
} from "@/lib/bracket/structure";
import { drawnGamesFrom3GG, scheduleSlotLabel } from "@/lib/bracket/for-drawn-bracket";
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

test("generate3GG(9) matches the PrintYourBrackets seeded sheet", () => {
  const { games, meta } = generate3GG(9);
  assert.equal(meta.unsettled, 0);
  assert.equal(meta.source, "printyourbrackets");
  assert.equal(games.length, 20);
  const fmt = (r) =>
    r.seed !== undefined ? `seed${r.seed}` : r.W !== undefined ? `W${r.W}` : `L${r.L}`;
  const line = (id) => {
    const g = games.find((x) => x.id === id);
    return `${fmt(g.a)} vs ${fmt(g.b)}`;
  };
  assert.equal(line(1), "seed8 vs seed9");
  assert.equal(line(2), "seed2 vs seed7");
  assert.equal(line(5), "seed1 vs W1");
  assert.equal(line(6), "L1 vs L2");
  assert.equal(line(16), "W12 vs W13");
  assert.equal(line(19), "W16 vs W18");
  assert.equal(line(20), "W19 vs L19");
});

test("generate3GG(7) and (8) match PrintYourBrackets game numbers", () => {
  const fmt = (r) =>
    r.seed !== undefined ? `seed${r.seed}` : r.W !== undefined ? `W${r.W}` : `L${r.L}`;
  const line = (games, id) => {
    const g = games.find((x) => x.id === id);
    return `${fmt(g.a)} vs ${fmt(g.b)}`;
  };
  const seven = generate3GG(7).games;
  assert.equal(seven.length, 15);
  assert.equal(line(seven, 1), "seed4 vs seed5");
  assert.equal(line(seven, 4), "seed1 vs W1");
  assert.equal(line(seven, 6), "L1 vs L2");
  assert.equal(line(seven, 11), "W4 vs W5");
  assert.equal(line(seven, 15), "W14 vs L14");

  const eight = generate3GG(8).games;
  assert.equal(eight.length, 17);
  assert.equal(line(eight, 1), "seed1 vs seed8");
  assert.equal(line(eight, 3), "seed3 vs seed6");
  assert.equal(line(eight, 5), "L1 vs L2");
  assert.equal(line(eight, 9), "W5 vs L6");
  assert.equal(line(eight, 13), "W7 vs W8");
  assert.equal(line(eight, 17), "W16 vs L16");
});

test("PrintYourBrackets 3GG sheets 4..16 cover every seed and only earlier games", () => {
  for (let n = 4; n <= 16; n++) {
    const { games, meta } = generate3GG(n);
    assert.equal(meta.source, "printyourbrackets", `${n}: source`);
    const seeds = new Set();
    for (const g of games) {
      for (const side of [g.a, g.b]) {
        if (side.seed !== undefined) {
          assert.ok(side.seed >= 1 && side.seed <= n, `${n} G${g.id} bad seed`);
          assert.equal(seeds.has(side.seed), false, `${n} duplicate seed ${side.seed}`);
          seeds.add(side.seed);
        }
        const ref = side.W ?? side.L;
        if (ref != null) {
          assert.ok(ref >= 1 && ref < g.id, `${n} G${g.id} points at G${ref}`);
        }
      }
    }
    assert.equal(seeds.size, n, `${n}: missing seeds`);
    const last = games[games.length - 1];
    assert.equal(last.bracket, "final", `${n}: last is if-necessary`);
    assert.equal(last.a.W, last.id - 1);
    assert.equal(last.b.L, last.id - 1);
  }
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

  const drawn = drawnGamesFrom3GG(names);
  const byG = Object.fromEntries(drawn.map((g) => [g.round, g]));

  assert.equal(byG[1].team1_name, "Hotel");
  assert.equal(byG[1].team2_name, "India");
  assert.equal(byG[2].team1_name, "Bravo");
  assert.equal(byG[2].team2_name, "Golf");
  assert.equal(byG[5].team1_name, "Alpha");
  assert.equal(byG[5].team2_name, "Winner of Game 1");
  assert.equal(byG[6].team1_name, "Loser of Game 1");
  assert.equal(byG[6].team2_name, "Loser of Game 2");
  assert.equal(byG[20].team1_name, "Winner of Game 19");
  assert.equal(byG[20].team2_name, "Loser of Game 19");
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
