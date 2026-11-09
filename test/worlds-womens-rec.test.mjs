// AFA World Series 2026 Women's Rec — 7 teams, 15 games, loaded straight
// from the director's sheet with NO registrations (team names are plain
// text on the games). Runs the real scoring propagation
// (lib/bracket/propagate.js) against an in-memory DB for every possible
// outcome, so a score entered on any game moves the winner and loser into
// the games the sheet links them to. (3GG: a 0–2 team plays on once, so a
// champion can have two losses.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/fake-supabase-hook.mjs", import.meta.url);
const { db } = await import("./support/fake-supabase.mjs");
const { propagateAfterFinalize } = await import("@/lib/bracket/propagate");
const { mootIfRounds, findIfGames, championOf } = await import("@/lib/bracket/if-game");

const DIV = "womens-rec";
const TEAMS = ["Guerreras", "Unstable Legends", "Hit & Run", "Band of Randoms", "Minkas", "FSU", "Dirt Divas"];
// Exactly the rows /workspace/afa/load-2026-worlds-womens-rec.sql writes.
// [n, side, team1, team2, src1, res1, src2, res2]
const SHEET = [
  [1, "winners", "Guerreras", "Unstable Legends"],
  [2, "winners", "Hit & Run", "Band of Randoms"],
  [3, "winners", "Minkas", "FSU"],
  [4, "winners", null, "Dirt Divas", 1, "winner", null, null],
  [5, "winners", null, null, 2, "winner", 3, "winner"],
  [6, "losers", null, null, 1, "loser", 2, "loser"],
  [7, "losers", null, null, 3, "loser", 4, "loser"],
  [8, "losers", null, null, 5, "loser", 6, "loser"],
  [9, "losers", null, null, 7, "winner", 8, "winner"],
  [10, "losers", null, null, 6, "winner", 7, "loser"],
  [11, "winners", null, null, 4, "winner", 5, "winner"],
  [12, "losers", null, null, 10, "winner", 9, "winner"],
  [13, "losers", null, null, 12, "winner", 11, "loser"],
  [14, "final", null, null, 11, "winner", 13, "winner"],
  [15, "final", null, null, 14, "winner", 14, "loser"],
];

function reset() {
  db.games = SHEET.map(([n, side, t1, t2, s1, r1, s2, r2]) => ({
    id: `g${n}`, division_id: DIV, bracket_group: "main", bracket_side: side, round: n, slot: 0,
    team1_name: t1 ?? null, team2_name: t2 ?? null,
    team1_source_game_id: s1 ? `g${s1}` : null, team1_source_result: r1 ?? null,
    team2_source_game_id: s2 ? `g${s2}` : null, team2_source_result: r2 ?? null,
    team1_is_open_entry: false, team2_is_open_entry: false, team1_seed_ref: null, team2_seed_ref: null,
    team1_score: null, team2_score: null, winner_slot: null, status: "pending", is_bye: false,
    field: "Pioneer F2",
  }));
  db.brackets = [{ division_id: DIV, bracket_group: "main", format: "three_gg_hybrid", team_count: 7, bracket_size: 8 }];
  db.divisions = [{ id: DIV, third_life_teams: [] }];
}
const game = (n) => db.games.find((g) => g.id === `g${n}`);

// Same write the score route makes (app/api/scorekeeper/games/[id]/score),
// then the same propagation call.
async function score(n, team1Wins) {
  const g = game(n);
  assert.ok(g.team1_name && g.team2_name, `G${n}: both teams must be known to score`);
  Object.assign(g, {
    team1_score: team1Wins ? 10 : 4, team2_score: team1Wins ? 4 : 10,
    winner_slot: team1Wins ? "team1" : "team2", status: "final",
  });
  await propagateAfterFinalize(g.id);
}
const winner = (n) => (game(n).winner_slot === "team1" ? game(n).team1_name : game(n).team2_name);
const loser = (n) => (game(n).winner_slot === "team1" ? game(n).team2_name : game(n).team1_name);

test("named links: W1 → G4, L6 → G8, W6 → G10, L7 → G10", async () => {
  reset();
  await score(1, true); // Guerreras beat Unstable Legends
  assert.equal(game(4).team1_name, "Guerreras");
  assert.equal(game(4).team2_name, "Dirt Divas");
  assert.equal(game(6).team1_name, "Unstable Legends");
  await score(2, false); // Band of Randoms beat Hit & Run
  assert.equal(game(6).team2_name, "Hit & Run");
  await score(3, true);
  await score(4, false); // Dirt Divas beat Guerreras
  assert.equal(game(7).team2_name, "Guerreras");
  assert.equal(game(11).team1_name, "Dirt Divas");
  await score(5, true);
  await score(6, true); // Unstable Legends beat Hit & Run
  assert.equal(game(8).team2_name, "Hit & Run", "L6 into G8 for a third game");
  assert.equal(game(10).team1_name, "Unstable Legends");
  await score(7, true); // FSU beat Guerreras
  assert.equal(game(10).team2_name, "Guerreras", "L7 into G10");
  assert.equal(game(9).team1_name, "FSU");
  assert.equal(db.games.length, 15, "no survivor-pool or re-entry games added");
});

test("if-game: G15 is moot when the unbeaten team wins G14, played otherwise", async () => {
  assert.deepEqual(findIfGames(db.games).map((x) => x.round), [15]);
  for (const g14Team1Wins of [true, false]) {
    reset();
    for (let n = 1; n <= 13; n++) await score(n, true);
    await score(14, g14Team1Wins);
    const moot = mootIfRounds(db.games).has(15);
    assert.equal(moot, g14Team1Wins, "W11 is unbeaten; their G14 win ends it");
    if (!moot) {
      assert.deepEqual(new Set([game(15).team1_name, game(15).team2_name]), new Set([winner(14), loser(14)]));
      await score(15, true);
    }
    assert.ok(TEAMS.includes(championOf(db.games)));
  }
});

test("every outcome of all 15 games: links fill, everyone gets 3 games, one champion", async () => {
  for (let bits = 0; bits < 1 << 15; bits++) {
    reset();
    for (let n = 1; n <= 15; n++) {
      if (n === 15 && mootIfRounds(db.games).has(15)) break;
      const g = game(n);
      assert.ok(TEAMS.includes(g.team1_name) && TEAMS.includes(g.team2_name), `G${n} unfilled (outcome ${bits})`);
      await score(n, Boolean(bits & (1 << (n - 1))));
    }
    assert.equal(db.games.length, 15, `extra games added (outcome ${bits})`);
    assert.deepEqual(db.divisions[0].third_life_teams, [], `survivor pool used (outcome ${bits})`);
    const played = db.games.filter((g) => g.status === "final");
    const champ = championOf(db.games);
    assert.ok(TEAMS.includes(champ), `no champion (outcome ${bits})`);
    for (const t of TEAMS) {
      const mine = played.filter((g) => g.team1_name === t || g.team2_name === t);
      const losses = mine.filter((g) => loserOf(g) === t).length;
      assert.ok(mine.length >= 3, `${t} only played ${mine.length} (outcome ${bits})`);
      if (t !== champ) assert.ok(losses >= 2, `${t} out with ${losses} loss (outcome ${bits})`);
      else assert.ok(losses <= 2, `champion ${t} has ${losses} losses (outcome ${bits})`);
    }
  }
});
function loserOf(g) { return g.winner_slot === "team1" ? g.team2_name : g.team1_name; }
