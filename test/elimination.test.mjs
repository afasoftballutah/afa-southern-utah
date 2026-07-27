import { test } from "node:test";
import assert from "node:assert/strict";
import { json } from "./load.mjs";
import { computeTeamStatus } from "@/lib/elimination";


const names = new Map();
const games = [];
for (const [file, name] of [
  ["games-gold.json", "Gold"],
  ["games-silver.json", "Silver"],
  ["games-bronze.json", "Bronze"],
]) {
  for (const g of await json(file)) {
    names.set(g.division_id, name);
    games.push(g);
  }
}
const DIV = { Gold: [...names].find(([, n]) => n === "Gold")[0] };
const statusFor = (rows, team) => rows.find((r) => r.team_name === team);

test("a team that won its bracket is champion", () => {
  const rows = computeTeamStatus(games, [], names);
  assert.equal(statusFor(rows, "Backwards K")?.state, "champion");
  assert.equal(statusFor(rows, "GWZ")?.state, "champion");
  assert.equal(statusFor(rows, "Ball Busters")?.state, "champion");
});

test("the runner-up is eliminated, not left in limbo", () => {
  // Regression: a moot if-game counted as pending, so BOTH finalists looked
  // like they had a game left. Gold produced no champion and Del Fuegos was
  // never marked out.
  const rows = computeTeamStatus(games, [], names);
  assert.equal(statusFor(rows, "Del Fuegos")?.state, "eliminated");
});

test("a team with a game still to play is neither", () => {
  const pending = games.map((g) =>
    g.division_id === DIV.Gold && g.round === 16
      ? { ...g, status: "pending", team1_score: null, team2_score: null }
      : g
  );
  const rows = computeTeamStatus(pending, [], names);
  assert.equal(statusFor(rows, "Backwards K"), undefined);
  assert.equal(statusFor(rows, "Del Fuegos"), undefined);
});

test("a pool loss never eliminates anyone", () => {
  // Every pool team enters a bracket. This is what stops the whole field
  // being marked out between the last pool game and the bracket seeding.
  const poolOnly = [
    { id: "p1", division_id: "coed", pool: "A", team1_name: "Alpha", team2_name: "Beta",
      team1_score: 3, team2_score: 10, status: "final", scheduled_time: "2026-07-24T21:00:00Z" },
  ];
  const rows = computeTeamStatus([], poolOnly, new Map([["coed", "Coed"]]));
  assert.equal(rows.length, 0);
});

test("a team is not marked out while a slot downstream still awaits their game", () => {
  const withPendingDrop = [
    ...games,
    { id: "x", division_id: DIV.Gold, round: 99, status: "pending",
      team1_name: "Loser of Game 16", team2_name: "TBD",
      team1_score: null, team2_score: null, scheduled_time: "2026-07-27T00:00:00Z", is_bye: false },
  ];
  const rows = computeTeamStatus(withPendingDrop, [], names);
  assert.equal(statusFor(rows, "Del Fuegos"), undefined, "still to be placed");
});
