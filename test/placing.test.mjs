// Final placing on the game that knocked a team out (JD, 2026-11-09:
// "and when a team loses and is out, it shows their place").
// Simulated results only — nothing here touches a database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eliminationPlacings, ordinal, placeLabel } from "@/lib/bracket/placing";
import { championOf, mootIfRounds } from "@/lib/bracket/if-game";
import { SURVIVOR_POOL_FIELD } from "@/lib/bracket/lives";

const FIXTURE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "worlds-2026-main-brackets.json"), "utf8")
);

// [n, side, team1, team2, src1, res1, src2, res2] → game rows
function build(sheet) {
  return sheet.map(([n, side, t1, t2, s1, r1, s2, r2]) => ({
    id: `g${n}`, round: n, bracket_side: side, bracket_group: "main", slot: 0,
    team1_name: t1 ?? null, team2_name: t2 ?? null,
    team1_source_game_id: s1 ? `g${s1}` : null, team1_source_result: r1 ?? null,
    team2_source_game_id: s2 ? `g${s2}` : null, team2_source_result: r2 ?? null,
    team1_is_open_entry: false, team2_is_open_entry: false,
    team1_score: null, team2_score: null, winner_slot: null, status: "pending", is_bye: false,
    field: "Pioneer F1",
  }));
}
const clone = (games) => games.map((g) => ({ ...g }));

// Score a game and move its winner and loser along the links — the
// static part of lib/bracket/propagate.js (no survivor pool).
function play(games, id, team1Wins) {
  const g = games.find((x) => x.id === id);
  Object.assign(g, {
    team1_score: team1Wins ? 9 : 3, team2_score: team1Wins ? 3 : 9,
    winner_slot: team1Wins ? "team1" : "team2", status: "final",
  });
  const w = team1Wins ? g.team1_name : g.team2_name;
  const l = team1Wins ? g.team2_name : g.team1_name;
  for (const x of games) {
    for (const s of ["team1", "team2"]) {
      if (x[`${s}_source_game_id`] !== id) continue;
      x[`${s}_name`] = String(x[`${s}_source_result`] ?? "winner").toLowerCase() === "loser" ? l : w;
    }
  }
}
const ready = (g) => g.status !== "final" && g.team1_name && g.team2_name;
const labels = (m) => [...m.values()].map((p) => p.label).sort();

// Play the whole bracket with a coin per game; check after every game
// that nothing shown ever changes.
function run(games, format, coin) {
  const seen = new Map();
  for (;;) {
    const moot = mootIfRounds(games);
    const next = games.find((g) => ready(g) && !moot.has(g.round));
    if (!next) break;
    play(games, next.id, coin());
    const now = eliminationPlacings(games, format);
    for (const [id, p] of seen) assert.deepEqual(now.get(id), p, `placing on ${id} changed`);
    for (const [id, p] of now) seen.set(id, p);
  }
  return eliminationPlacings(games, format);
}

// Places must read as one standings table: for "5th" exactly 4 teams
// finished ahead; for "T-5th" of size k, 4 ahead and k sharing it.
function assertConsistent(placings, champion, teamCount) {
  const places = [1, ...[...placings.values()].map((p) => p.place)].sort((a, b) => a - b);
  assert.equal(places.length, teamCount, "everyone placed once");
  const teams = [champion, ...[...placings.values()].map((p) => p.team)];
  assert.equal(new Set(teams).size, teamCount, "no team placed twice");
  for (const p of placings.values()) {
    const ahead = places.filter((x) => x < p.place).length;
    const same = places.filter((x) => x === p.place).length;
    assert.equal(ahead, p.place - 1, `${p.label}: ${ahead} ahead`);
    assert.equal(p.tied, same > 1, `${p.label}: tie flag`);
  }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) & 0x10000) !== 0;
}

test("labels: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd, T- for a shared place", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal),
    ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  assert.equal(placeLabel(5, true), "T-5th");
  assert.equal(placeLabel(3), "3rd");
});

// AFA World Series 2026 Women's Rec, three_gg_hybrid, 7 teams — the sheet
// as loaded (test/worlds-womens-rec.test.mjs).
const WREC = [
  [1, "winners", "Guerreras", "Unstable Legends"], [2, "winners", "Hit & Run", "Band of Randoms"],
  [3, "winners", "Minkas", "FSU"], [4, "winners", null, "Dirt Divas", 1, "winner"],
  [5, "winners", null, null, 2, "winner", 3, "winner"], [6, "losers", null, null, 1, "loser", 2, "loser"],
  [7, "losers", null, null, 3, "loser", 4, "loser"], [8, "losers", null, null, 5, "loser", 6, "loser"],
  [9, "losers", null, null, 7, "winner", 8, "winner"], [10, "losers", null, null, 6, "winner", 7, "loser"],
  [11, "winners", null, null, 4, "winner", 5, "winner"], [12, "losers", null, null, 10, "winner", 9, "winner"],
  [13, "losers", null, null, 12, "winner", 11, "loser"], [14, "final", null, null, 11, "winner", 13, "winner"],
  [15, "final", null, null, 14, "winner", 14, "loser"],
];

test("three_gg_hybrid (Women's Rec): every outcome places 2nd, 3rd, 4th, T-5th, T-5th, 7th on the right games", () => {
  const base = build(WREC);
  for (let bits = 0; bits < 1 << 15; bits += bits % 7 === 0 ? 1 : 3) {
    const games = clone(base);
    let i = 0;
    const out = run(games, "three_gg_hybrid", () => Boolean(bits & (1 << i++)));
    assert.deepEqual(labels(out), ["2nd", "3rd", "4th", "7th", "T-5th", "T-5th"], `outcome ${bits}`);
    assert.equal(out.get("g13").label, "3rd");
    assert.equal(out.get("g12").label, "4th");
    assert.equal(out.get("g9").label, "T-5th");
    assert.equal(out.get("g10").label, "T-5th");
    assert.equal(out.get("g8").label, "7th");
    assertConsistent(out, championOf(games), 7);
  }
});

test("the champion and anyone still playing get nothing", () => {
  const games = build(WREC);
  play(games, "g1", true);
  play(games, "g2", true);
  play(games, "g3", true);
  assert.equal(eliminationPlacings(games, "three_gg_hybrid").size, 0, "first losses are not eliminations");
});

// 4-team double elimination with the if-necessary final.
const DE4 = [
  [1, "winners", "A", "B"], [2, "winners", "C", "D"], [3, "winners", null, null, 1, "winner", 2, "winner"],
  [4, "losers", null, null, 1, "loser", 2, "loser"], [5, "losers", null, null, 4, "winner", 3, "loser"],
  [6, "final", null, null, 3, "winner", 5, "winner"], [7, "final", null, null, 6, "winner", 6, "loser"],
];

test("double_elim, if-game not needed: the unbeaten team wins G6, its loser is 2nd", () => {
  const games = build(DE4);
  for (const n of [1, 2, 3, 4, 5]) play(games, `g${n}`, true);
  play(games, "g6", true); // unbeaten A wins
  const out = eliminationPlacings(games, "double_elim");
  assert.equal(out.get("g6").label, "2nd");
  assert.equal(out.get("g6").team, games[5].team2_name);
  assert.equal(out.get("g5").label, "3rd");
  assert.equal(out.get("g4").label, "4th");
  assert.equal(out.has("g7"), false);
});

test("double_elim, if-game played: no placing on G6, the G7 loser is 2nd", () => {
  const games = build(DE4);
  for (const n of [1, 2, 3, 4, 5]) play(games, `g${n}`, true);
  play(games, "g6", false); // the one-loss team forces G7
  let out = eliminationPlacings(games, "double_elim");
  assert.equal(out.has("g6"), false, "G6's loser plays again in G7");
  play(games, "g7", true);
  out = eliminationPlacings(games, "double_elim");
  assert.equal(out.get("g7").label, "2nd");
  assert.deepEqual(labels(out), ["2nd", "3rd", "4th"]);
  assertConsistent(out, championOf(games), 4);
});

test("single elimination (8 teams): QF losers T-5th, SF losers T-3rd, final loser 2nd", () => {
  const games = build([
    [1, "winners", "A", "B"], [2, "winners", "C", "D"], [3, "winners", "E", "F"], [4, "winners", "G", "H"],
    [5, "winners", null, null, 1, "winner", 2, "winner"], [6, "winners", null, null, 3, "winner", 4, "winner"],
    [7, "winners", null, null, 5, "winner", 6, "winner"],
  ]);
  const out = run(games, null, rng(7));
  assert.deepEqual(labels(out), ["2nd", "T-3rd", "T-3rd", "T-5th", "T-5th", "T-5th", "T-5th"]);
  assertConsistent(out, championOf(games), 8);
});

test("three_gg_hybrid: a 0–2 loser with no seat goes to the survivor pool, not home", () => {
  // 4 teams, hybrid, no seat for G4's loser. If the G4 loser is 0–2 they
  // are waiting for a survivor game, so no placing.
  const games = build([
    [1, "winners", "A", "B"], [2, "winners", "C", "D"], [3, "winners", null, null, 1, "winner", 2, "winner"],
    [4, "losers", null, null, 1, "loser", 2, "loser"], [5, "losers", null, null, 4, "winner", 3, "loser"],
    [6, "final", null, null, 3, "winner", 5, "winner"], [7, "final", null, null, 6, "winner", 6, "loser"],
  ]);
  for (const n of [1, 2, 3]) play(games, `g${n}`, true);
  play(games, "g4", true);
  assert.equal(eliminationPlacings(games, "three_gg_hybrid").has("g4"), false, "0–2 is not out in 3GG hybrid");
  assert.equal(eliminationPlacings(games, "double_elim").get("g4").label, "4th", "the same loss is out in double_elim");
  // The survivor game it then plays is made at runtime, outside the links:
  // its loser (0–3) is out, but where they finish is not in the links.
  games.push({ ...games[0], id: "s1", round: 8, bracket_side: "losers", field: SURVIVOR_POOL_FIELD,
    team1_name: "B", team2_name: "X", team1_source_game_id: null, team2_source_game_id: null,
    team1_score: 2, team2_score: 8, winner_slot: "team2", status: "final" });
  const out = eliminationPlacings(games, "three_gg_hybrid");
  assert.equal(out.has("s1"), false);
  assert.equal(out.has("g4"), false, "B played again after G4");
});

test("formats it can't place: consolation, unknown, and a runtime re-entry game", () => {
  const games = build(DE4);
  for (const n of [1, 2, 3, 4, 5, 6]) play(games, `g${n}`, true);
  assert.equal(eliminationPlacings(games, "double_elim_consolation").size, 0);
  assert.equal(eliminationPlacings(games, "round_robin").size, 0);
  const withReentry = [...clone(games), { ...games[3], id: "r1", field: "Re-entry", status: "pending" }];
  assert.equal(eliminationPlacings(withReentry, "three_gg_hybrid").size, 0);
});

test("a placing waits while a closer tier could still be a walkover", () => {
  const games = build(DE4);
  for (const n of [1, 2]) play(games, `g${n}`, true);
  play(games, "g4", true);
  // G5's far side is the G3 loser; mark it an open re-entry seat instead:
  games.find((g) => g.id === "g5").team2_is_open_entry = true;
  games.find((g) => g.id === "g5").team2_source_game_id = null;
  assert.equal(eliminationPlacings(games, "double_elim").has("g4"), false);
});

for (const div of FIXTURE) {
  test(`Worlds ${div.division} (three_gg_hybrid, real links): random runs stay consistent`, () => {
    for (let seed = 1; seed <= 60; seed++) {
      const games = clone(div.games.map((g) => ({ ...g, team1_score: null, team2_score: null })));
      const out = run(games, "three_gg_hybrid", rng(seed));
      const champ = championOf(games);
      for (const p of out.values()) {
        assert.ok(p.place >= 2, `${div.division}: ${p.label}`);
        assert.notEqual(p.team, champ);
      }
      const teams = [...out.values()].map((p) => p.team);
      assert.equal(new Set(teams).size, teams.length, `${div.division}: a team placed twice (seed ${seed})`);
      // Withheld only where a 0–2 team went to the survivor pool (not
      // simulated here); otherwise the table is complete and consistent.
      const allTeams = new Set(div.games.flatMap((g) => [g.team1_name, g.team2_name]).filter(Boolean));
      if (champ && out.size === allTeams.size - 1) assertConsistent(out, champ, allTeams.size);
    }
  });
}
