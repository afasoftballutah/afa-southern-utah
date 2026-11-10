import { test } from "node:test";
import assert from "node:assert/strict";
import { playsIn, teamGameIds, teamNextGame, fromScheduleRows } from "@/lib/team-games";
import { flowTargets } from "@/lib/schedule-timeline";

const T = (h) => `2026-11-13T${String(h).padStart(2, "0")}:00:00Z`;

test("next game: the earliest game for the team that is not final", () => {
  const games = [
    { id: "a", team1: "Legacy", team2: "Fallen", final: true, when: T(15) },
    { id: "b", team1: "Fallen", team2: "Legacy", final: false, when: T(19) },
    { id: "c", team1: "Legacy", team2: "Rush", final: false, when: T(17) },
    { id: "d", team1: "Rush", team2: "Hype", final: false, when: T(16) },
  ];
  assert.equal(teamNextGame(games, "Legacy"), "c");
  assert.equal(teamNextGame(games, " legacy "), "c", "names match trimmed, any case");
  assert.equal(teamNextGame(games, "Hype"), "d");
});

test("next game: none when everything is final, no team, or the team is not listed", () => {
  const games = [{ id: "a", team1: "Legacy", team2: "Fallen", final: true, when: T(15) }];
  assert.equal(teamNextGame(games, "Legacy"), null);
  assert.equal(teamNextGame(games, ""), null);
  assert.equal(teamNextGame(games, null), null);
  assert.equal(teamNextGame(games, "Nobody"), null);
  assert.equal(teamNextGame([], "Legacy"), null);
});

test("next game: a game in progress is the next one; cancelled is skipped; untimed goes last", () => {
  const rows = [
    { id: "live", team1: "Legacy", team2: "Fallen", status: "in_progress", scheduledTime: T(15) },
    { id: "later", team1: "Legacy", team2: "Rush", status: "pending", scheduledTime: T(18) },
  ];
  assert.equal(teamNextGame(fromScheduleRows(rows), "Legacy"), "live");
  const rows2 = [
    { id: "x", team1: "Legacy", team2: "Fallen", status: "cancelled", scheduledTime: T(14) },
    { id: "untimed", team1: "Legacy", team2: "Rush", status: "pending", scheduledTime: null },
    { id: "y", team1: "Legacy", team2: "Hype", status: "pending", scheduledTime: T(20) },
    { id: "z", team1: "Legacy", team2: "Hype", isFinal: true, scheduledTime: T(13) },
  ];
  assert.equal(teamNextGame(fromScheduleRows(rows2), "Legacy"), "y");
});

test("team games: every game the team is in", () => {
  const games = [
    { id: "a", team1: "Legacy", team2: "Fallen" },
    { id: "b", team1: "Rush", team2: "Legacy" },
    { id: "c", team1: "Rush", team2: "Hype" },
  ];
  assert.deepEqual([...teamGameIds(games, "legacy")], ["a", "b"]);
  assert.equal(playsIn(games[2], "Legacy"), false);
});

test("flow targets: winner and loser destinations resolve to game ids in the same division", () => {
  const rows = [
    { id: "d33", divisionId: "mens-d", label: "G33", flow: { winner: { next: "34" }, loser: { place: "3rd" } } },
    { id: "d34", divisionId: "mens-d", label: "G34", flow: { winner: { place: "🏆" }, loser: { place: "2nd" } } },
    { id: "d9", divisionId: "mens-d", label: "G9", flow: { winner: { next: "13" }, loser: { next: "33" } } },
    { id: "d13", divisionId: "mens-d", label: "G13", flow: null },
    { id: "e34", divisionId: "mens-e", label: "G34", flow: null },
  ];
  const t = flowTargets(rows);
  assert.deepEqual(t.get("d33"), { winner: "d34", loser: null });
  assert.deepEqual(t.get("d9"), { winner: "d13", loser: "d33" });
  assert.equal(t.has("d34"), false);
});
