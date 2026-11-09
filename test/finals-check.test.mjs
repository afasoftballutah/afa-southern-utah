// Director "division complete / champion" check (lib/bracket/status.js):
// the app-generated shape (finals numbered 1 and 2) keeps its old rule, and
// every 2026 Worlds sheet-loaded bracket (finals numbered by sheet game,
// e.g. G14/G15) is found by shape, including a skipped if-necessary game.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { completionFromGames } from "@/lib/bracket/status";
import { resolveMatchSlots } from "@/lib/bracket/resolve";
import { championOf, findIfGames, mootIfRounds } from "@/lib/bracket/if-game";

const WORLDS = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures/worlds-2026-main-brackets.json"), "utf8")
);

const fin = (g, t1Wins) =>
  Object.assign(g, {
    status: "final",
    team1_score: t1Wins ? 10 : 4,
    team2_score: t1Wins ? 4 : 10,
    winner_slot: t1Wins ? "team1" : "team2",
  });

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// ---- old (app-generated) shape -------------------------------------------
function legacy() {
  const g = (id, side, round, extra = {}) => ({
    id, bracket_side: side, bracket_group: "main", round, slot: 0, status: "pending",
    team1_name: null, team2_name: null, team1_score: null, team2_score: null, winner_slot: null,
    team1_source_game_id: null, team2_source_game_id: null, team1_source_result: null, team2_source_result: null,
    ...extra,
  });
  return [
    g("w1", "winners", 1, { team1_name: "A", team2_name: "B" }),
    g("l1", "losers", 1, { team1_name: "B", team2_name: "C" }),
    g("f1", "final", 1, { team1_name: "A", team2_name: "C" }),
    g("f2", "final", 2, {
      team1_source_game_id: "f1", team1_source_result: "winner",
      team2_source_game_id: "f1", team2_source_result: "loser",
    }),
  ];
}

test("old shape: nothing played → not complete", () => {
  assert.equal(completionFromGames(legacy()).complete, false);
});
test("old shape: GF1 won by team1 → champion, GF2 not needed", () => {
  const games = legacy();
  fin(games[2], true);
  games[3].status = "cancelled";
  assert.deepEqual(completionFromGames(games), { complete: true, championName: "A", runnerUpName: "C" });
});
test("old shape: GF1 won by team2 → still open until GF2", () => {
  const games = legacy();
  fin(games[2], false);
  assert.equal(completionFromGames(games).complete, false);
  Object.assign(games[3], { team1_name: "C", team2_name: "A" });
  fin(games[3], false);
  assert.deepEqual(completionFromGames(games), { complete: true, championName: "A", runnerUpName: "C" });
});

// ---- 2026 Worlds sheet shapes ----------------------------------------------
function play(rows, seed) {
  const rand = rng(seed);
  const games = rows.map((r) => ({ ...r, team1_score: null, team2_score: null, winner_slot: null }));
  const byId = new Map(games.map((g) => [g.id, g]));
  const open = [];
  for (const g of games) {
    if (mootIfRounds(games).has(g.round)) continue; // skipped if-game stays pending
    open.push(completionFromGames(games).complete);
    const { team1, team2 } = resolveMatchSlots(g, (id) => byId.get(id), games);
    assert.ok(team1.team && team2.team, `G${g.round} not ready`);
    g.team1_name = team1.team;
    g.team2_name = team2.team;
    fin(g, rand() < 0.5);
  }
  return { games, open };
}

for (const { division, games: rows } of WORLDS) {
  test(`${division}: champion found by shape with or without the if-game`, () => {
    assert.equal(rows.some((g) => g.bracket_side === "final" && g.round === 1), false);
    const [{ round: ifRound }] = findIfGames(rows);
    let moot = 0;
    let played = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { games, open } = play(rows, seed);
      assert.ok(open.every((c) => c === false), `${division} complete too early (seed ${seed})`);
      const done = completionFromGames(games);
      assert.equal(done.complete, true, `${division} not complete (seed ${seed})`);
      assert.equal(done.championName, championOf(games));
      const ifGame = games.find((g) => g.round === ifRound);
      if (ifGame.status === "final") played++;
      else moot++;
    }
    assert.ok(moot > 0 && played > 0, `${division}: both endings exercised`);
  });

  test(`${division}: if-game cancelled in the data counts as skipped`, () => {
    const { games } = play(rows, 7);
    const [{ round, fromId }] = findIfGames(games);
    const champ = games.find((g) => g.id === fromId);
    const ifGame = games.find((g) => g.round === round);
    Object.assign(ifGame, { status: "cancelled", team1_score: null, team2_score: null, winner_slot: null });
    const done = completionFromGames(games);
    assert.equal(done.complete, true);
    assert.equal(done.championName, champ.winner_slot === "team1" ? champ.team1_name : champ.team2_name);
  });
}
