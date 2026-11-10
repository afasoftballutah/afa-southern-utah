// Timeline pill corners (lib/bracket/flow.js): where a game's teams come
// from (top) and where its loser / winner go next (bottom), read from the
// bracket links. Checked on real Worlds structures (fixture of the live
// links, all pending) plus small synthetic sheets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gameFlow } from "@/lib/bracket/flow";
import { flowWords, nextShort } from "@/lib/schedule-timeline";

const FIXTURE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "worlds-2026-main-brackets.json"), "utf8")
);
const division = (name) => FIXTURE.find((d) => d.division === name).games;

function corners(games, n, format = "three_gg_hybrid") {
  const g = games.find((x) => x.round === n);
  const f = gameFlow(games, format).get(g.id);
  return [f.from[0]?.short ?? "", f.from[1]?.short ?? "", f.loser?.short ?? "", f.winner?.short ?? ""];
}

test("Men's D: first round has no feeders; later games show W#/L# and next games", () => {
  const g = division("Men's D");
  assert.deepEqual(corners(g, 1), ["", "", "9", "13"]);
  assert.deepEqual(corners(g, 9), ["L1", "L2", "19", "20"]);
  assert.deepEqual(corners(g, 25), ["W13", "W14", "29", "31"]);
  assert.deepEqual(corners(g, 33), ["L31", "W32", "3rd", "34"]);
});

test("Men's D final and if-necessary game follow the if-game rule", () => {
  const g = division("Men's D");
  assert.deepEqual(corners(g, 34), ["W31", "W33", "2nd", "🏆"]);
  assert.deepEqual(corners(g, 35), ["W34", "L34", "2nd", "🏆"]);
});

test("Women's Rec (three_gg_hybrid): feeders, places and the final", () => {
  const g = division("Women's Rec");
  assert.deepEqual(corners(g, 1), ["", "", "6", "4"]);
  assert.deepEqual(corners(g, 4), ["W1", "", "7", "11"]); // team2 entered by name, no feeder
  assert.deepEqual(corners(g, 8), ["L5", "L6", "7th", "9"]);
  assert.deepEqual(corners(g, 12), ["W10", "W9", "4th", "13"]);
  assert.deepEqual(corners(g, 14), ["W11", "W13", "2nd", "🏆"]);
});

test("Men's E, Women's D, Women's E: a couple of games each", () => {
  assert.deepEqual(corners(division("Men's E"), 22), ["L20", "W15", "17th", "35"]);
  assert.deepEqual(corners(division("Men's E"), 49), ["W46", "W48", "2nd", "🏆"]);
  assert.deepEqual(corners(division("Women's D"), 11), ["W9", "L8", "5th", "14"]);
  assert.deepEqual(corners(division("Women's E"), 3), ["W1", "", "5", "9"]);
});

test("every Worlds game has both destinations; only first-entry slots lack a feeder", () => {
  for (const { division: name, games } of FIXTURE) {
    const flow = gameFlow(games, "three_gg_hybrid");
    for (const g of games.filter((x) => !x.is_bye)) {
      const f = flow.get(g.id);
      assert.ok(f.loser && f.winner, `${name} G${g.round} missing a destination`);
      f.from.forEach((x, i) => {
        const s = i === 0 ? "team1" : "team2";
        assert.equal(x == null, !g[`${s}_source_game_id`], `${name} G${g.round} ${s}`);
      });
    }
  }
});

const mk = (n, side, s1, r1, s2, r2, extra = {}) => ({
  id: `g${n}`, round: n, bracket_side: side, bracket_group: "main", status: "pending", is_bye: false,
  team1_name: s1 ? null : `A${n}`, team2_name: s2 ? null : `B${n}`,
  team1_source_game_id: s1 ? `g${s1}` : null, team1_source_result: r1 ?? null,
  team2_source_game_id: s2 ? `g${s2}` : null, team2_source_result: r2 ?? null,
  team1_is_open_entry: false, team2_is_open_entry: false, team1_score: null, team2_score: null,
  field: "F1", ...extra,
});

test("a one-game final: winner champion, loser 2nd; a seed shows when there's no feeder", () => {
  const games = [
    mk(1, "winners", null, null, null, null, { team1_seed_ref: "#1", team2_seed_ref: "#4" }),
    mk(2, "winners", null, null, null, null),
    mk(3, "final", 1, "winner", 2, "winner"),
  ];
  const f = gameFlow(games, "double_elim");
  assert.deepEqual(f.get("g1").from.map((x) => x?.short ?? null), ["#1", "#4"]);
  assert.deepEqual(f.get("g2").from, [null, null]);
  assert.equal(f.get("g3").winner.short, "🏆");
  assert.equal(f.get("g3").loser.short, "2nd");
});

test("an unsupported format shows links but never invents a place or 'out'", () => {
  const games = [mk(1, "winners"), mk(2, "winners"), mk(3, "winners", 1, "winner", 2, "winner"), mk(4, "final", 3, "winner", 3, "winner")];
  const f = gameFlow(games, "double_elim_consolation");
  assert.equal(f.get("g1").loser, null);
  assert.equal(f.get("g1").winner.short, "3");
});

test("corner and sheet wording", () => {
  assert.equal(nextShort({ short: "22" }), "→22");
  assert.equal(nextShort({ short: "5th" }), "5th");
  assert.equal(nextShort(null), null);
  assert.equal(
    flowWords({ winner: { words: "Winner → Game 22" }, loser: { words: "Loser → Game 19" } }),
    "Winner → Game 22 · Loser → Game 19"
  );
  assert.equal(flowWords(null), null);
});

test("places carry no T- and are marked as places; the first final's corners are 2nd / 🏆 and its details carry the if-game rule", () => {
  const g = division("Men's D");
  const flow = gameFlow(g, "three_gg_hybrid");
  const byN = (n) => flow.get(g.find((x) => x.round === n).id);
  assert.deepEqual([byN(29).loser.place, byN(29).loser.next], ["5th", undefined]);
  assert.match(byN(29).loser.words, /tied for 5th/);
  assert.deepEqual([byN(34).loser.place, byN(34).loser.next], ["2nd", undefined]);
  assert.deepEqual([byN(34).winner.place, byN(34).winner.next], ["🏆", undefined]);
  assert.equal(
    flowWords(byN(34)),
    "If the winners-bracket team wins, they're champions. If they lose, both teams play again in Game 35."
  );
  assert.equal(byN(34).ifGame, "35");
  assert.equal(byN(35).rule, null);
  assert.equal(byN(35).ifGame, null);
  assert.deepEqual([byN(9).loser.place, byN(9).loser.next], [undefined, "19"]);
  for (const f of flow.values()) for (const x of [f.loser, f.winner]) assert.ok(!/T-/.test(x?.short ?? ""));
});

test("the if-game rule names each division's real if-game", () => {
  for (const [name, first, ifN] of [["Men's D", 34, 35], ["Men's E", 49, 50], ["Women's D", 16, 17], ["Women's E", 12, 13], ["Women's Rec", 14, 15]]) {
    const g = division(name);
    const f = gameFlow(g, "three_gg_hybrid").get(g.find((x) => x.round === first).id);
    assert.match(f.rule, new RegExp(`play again in Game ${ifN}\\.$`), name);
    assert.equal(f.ifGame, String(ifN), name);
  }
});
