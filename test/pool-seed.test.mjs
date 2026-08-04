import { test } from "node:test";
import assert from "node:assert/strict";
import {
  poolFinishOrder,
  resolveSeeds,
  computeSeedWrites,
  parseSeedRef,
} from "@/lib/bracket/seed";

function played(pool, t1, s1, t2, s2) {
  return {
    pool,
    team1_name: t1,
    team2_name: t2,
    team1_score: s1,
    team2_score: s2,
    status: "final",
  };
}

test("parseSeedRef accepts A #1 and [A #1]", () => {
  assert.deepEqual(parseSeedRef("A #1"), { pool: "A", rank: 1 });
  assert.deepEqual(parseSeedRef("[B #3]"), { pool: "B", rank: 3 });
  assert.equal(parseSeedRef("Seed #1"), null);
});

test("poolFinishOrder ranks by W–L; a pending game means not complete", () => {
  const partial = [
    played("A", "Alpha", 10, "Bravo", 5),
    {
      pool: "A",
      team1_name: "Alpha",
      team2_name: "Charlie",
      team1_score: null,
      team2_score: null,
      status: "pending",
    },
  ];
  const fin = poolFinishOrder(partial);
  assert.equal(fin.complete, false);
  // Alpha has a win recorded; still ranks first among played teams
  assert.equal(fin.standings[0].team, "Alpha");
});

test("resolveSeeds maps A #1 from complete pool; incomplete contributes nothing", () => {
  // Round-robin complete: each plays each once
  const games = [
    played("A", "Alpha", 10, "Bravo", 5),
    played("A", "Alpha", 12, "Charlie", 4),
    played("A", "Bravo", 8, "Charlie", 7),
  ];
  const finish = poolFinishOrder(games);
  assert.equal(finish.complete, true);
  const seeds = resolveSeeds({ A: finish });
  assert.equal(seeds["A #1"], "Alpha");
  assert.ok(seeds["A #2"]);
  assert.ok(seeds["A #3"]);
});

test("computeSeedWrites fills team names from seed refs", () => {
  const bracketGames = [
    {
      id: "g1",
      team1_name: null,
      team2_name: null,
      team1_seed_ref: "A #1",
      team2_seed_ref: "A #2",
    },
  ];
  const seeds = { "A #1": "Alpha", "A #2": "Bravo" };
  const { writes, unresolved } = computeSeedWrites(bracketGames, seeds);
  assert.equal(unresolved.length, 0);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].patch, {
    team1_name: "Alpha",
    team2_name: "Bravo",
  });
});
