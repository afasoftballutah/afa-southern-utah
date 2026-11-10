import { test } from "node:test";
import assert from "node:assert/strict";
import { teamOptions, resolveTeamPick, groupTeamOptions } from "@/lib/team-pick";
import { teamGameIds, teamNextGame, fromScheduleRows, playsIn } from "@/lib/team-games";

// Two real teams named Fallen (Men's D and Men's E at the 2026 Worlds).
const TEAMS = [
  { name: "Fallen", divisionId: "mens-d", divisionName: "Men's D" },
  { name: "Fallen", divisionId: "mens-e", divisionName: "Men's E" },
  { name: "Dark Horse", divisionId: "mens-e", divisionName: "Men's E" },
  { name: "Dirt Divas", divisionId: "womens-d", divisionName: "Women's D" },
];
const T = (h) => `2026-11-12T${String(h).padStart(2, "0")}:00:00Z`;
const ROWS = [
  { id: "d5", divisionId: "mens-d", team1: "Fallen", team2: "Legacy", status: "pending", scheduledTime: T(22) },
  { id: "e6", divisionId: "mens-e", team1: "Rush", team2: "Fallen", status: "pending", scheduledTime: T(21) },
  { id: "e4", divisionId: "mens-e", team1: "Dark Horse", team2: "Dirtbags", status: "pending", scheduledTime: T(21) },
];

test("same-name teams are separate picker entries, grouped under their divisions", () => {
  const opts = teamOptions(TEAMS);
  assert.equal(opts.filter((o) => o.name === "Fallen").length, 2);
  assert.notEqual(opts[0].key, opts[1].key);
  const groups = groupTeamOptions(opts);
  assert.deepEqual(groups.map((g) => g.label), ["Men's D", "Men's E", "Women's D"]);
  assert.deepEqual(groups[1].options.map((o) => o.name), ["Dark Horse", "Fallen"]);
});

test("same-name teams: picking one Fallen lights only its games and its next game", () => {
  const games = fromScheduleRows(ROWS);
  const e = { name: "Fallen", divisionId: "mens-e" };
  const d = { name: "Fallen", divisionId: "mens-d" };
  assert.deepEqual([...teamGameIds(games, e)], ["e6"]);
  assert.deepEqual([...teamGameIds(games, d)], ["d5"]);
  assert.equal(teamNextGame(games, e), "e6");
  assert.equal(teamNextGame(games, d), "d5");
  // A bare name still matches by name (one division's own page).
  assert.deepEqual([...teamGameIds(games, "Fallen")], ["d5", "e6"]);
  assert.equal(playsIn({ team1: "Fallen", team2: "X" }, e), true, "a game without a division matches by name");
});

test("a remembered pick resolves to one team; an old name-only pick never picks a stranger", () => {
  const opts = teamOptions(TEAMS);
  assert.equal(resolveTeamPick({ name: "Fallen", divisionId: "mens-e" }, opts).divisionId, "mens-e");
  assert.equal(resolveTeamPick({ name: "Fallen", divisionId: "coed-d" }, opts), null);
  // Old storage held only the name. Unique names still resolve…
  assert.equal(resolveTeamPick({ name: "Dark Horse" }, opts).divisionId, "mens-e");
  // …a shared name resolves through the division this device registered in…
  assert.equal(resolveTeamPick({ name: "Fallen" }, opts, ["mens-d"]).divisionId, "mens-d");
  // …and otherwise picks nothing rather than one of the two at random.
  assert.equal(resolveTeamPick({ name: "Fallen" }, opts), null);
  assert.equal(resolveTeamPick({ name: "Fallen" }, opts, ["mens-d", "mens-e"]), null);
  assert.equal(resolveTeamPick({ name: "" }, opts), null);
});

test("one division's page: names become that division's teams", () => {
  const opts = teamOptions(["Fallen", "Legacy"], "mens-d");
  assert.equal(groupTeamOptions(opts).length, 1);
  assert.equal(resolveTeamPick({ name: "Fallen" }, opts).divisionId, "mens-d");
  assert.equal(resolveTeamPick({ name: "Fallen", divisionId: "mens-e" }, opts), null, "Men's E's Fallen is not on Men's D's page");
});
