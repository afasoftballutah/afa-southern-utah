// lib/team-reach.js: the games a followed team can still play, for the
// schedule timeline's picker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { teamReachIds } from "@/lib/team-reach";

// A small double elimination: G1 → W G3 / L G2; G2 (losers) → W G4 / out;
// G3 → W G5 (final) / L G4; G4 → W G5 / out; G5 the final → if-game G6.
const row = (n, t1, t2, flow, extra = {}) => ({ id: `g${n}`, label: `G${n}`, divisionId: "d", team1: t1, team2: t2, flow, scheduledTime: `2026-11-14T${String(10 + n).padStart(2, "0")}:00:00Z`, ...extra });
const rows = [
  row(1, "Fallen", "Jaded", { winner: { next: 3 }, loser: { next: 2 } }),
  row(2, "Vice", null, { winner: { next: 4 }, loser: { place: "5th" } }),
  row(3, null, "SIS", { winner: { next: 5 }, loser: { next: 4 } }),
  row(4, null, null, { winner: { next: 5 }, loser: { place: "3rd" } }),
  row(5, null, null, { winner: { place: "🏆" }, loser: { place: "2nd" }, ifGame: "Game 6" }),
  row(6, null, null, { winner: { place: "🏆" }, loser: { place: "2nd" } }),
  row(1, "Other", "Team", { winner: { next: 3 } }, { id: "x1", divisionId: "e" }),
  row(3, null, null, {}, { id: "x3", divisionId: "e" }),
];
const fallen = { name: "Fallen", divisionId: "d" };

test("from the next game: every game a win or a loss can lead to, the if-game too, only in its own division", () => {
  assert.deepEqual([...teamReachIds(rows, fallen, "g1")].sort(), ["g1", "g2", "g3", "g4", "g5", "g6"]);
});

test("after a final loss with the next slot still unnamed: from where the loss sent them", () => {
  const lost = rows.map((r) => (r.id === "g1" ? { ...r, isFinal: true, status: "final", score1: 7, score2: 12 } : r));
  assert.deepEqual([...teamReachIds(lost, fallen, null)].sort(), ["g2", "g4", "g5", "g6"], "the winners side is gone");
});

test("a game past its time without a final score decides nothing", () => {
  const unscored = rows.map((r) => (r.id === "g1" ? { ...r, status: "final", isFinal: true, score1: null, score2: null } : r));
  assert.equal(teamReachIds(unscored, fallen, null).size, 0, "no final score: not a result, and the timeline still treats G1 as next");
  assert.equal(teamReachIds(rows, null, null).size, 0);
});
