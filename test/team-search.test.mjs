// "Find my team" goes straight to the team's bracket (JD, 2026-11-09).
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTournamentTeams, teamBracketHref, teamSearchKey } from "../lib/team-search.js";

const T = (name, divisionId, seatLabel, managerNames = []) => ({ name, divisionId, seatLabel, managerNames });
const WORLDS = [
  T("Fallen", "mens-d", "Men's D", ["TBD"]),
  T("Fallen", "mens-e", "Men's E", ["Brayden Brooks"]),
  T("Legacy", "womens-d", "Women's D", ["Sam Hill"]),
  T("Band of Randoms", "womens-rec", "Women's Rec"),
];

test("same-named teams in two divisions are two results", () => {
  const hits = searchTournamentTeams(WORLDS, "fallen");
  assert.deepEqual(hits.map((t) => t.seatLabel), ["Men's D", "Men's E"]);
  assert.notEqual(teamSearchKey(hits[0]), teamSearchKey(hits[1]));
});

test("each result opens its own division's bracket", () => {
  const [d, e] = searchTournamentTeams(WORLDS, "Fallen");
  assert.equal(teamBracketHref("2026-afa-world-series", d), "/tournaments/2026-afa-world-series/division/mens-d");
  assert.equal(teamBracketHref("2026-afa-world-series", e), "/tournaments/2026-afa-world-series/division/mens-e");
});

test("no division: no link (the row falls back to a plain pick)", () => {
  assert.equal(teamBracketHref("s", T("Ghost", null, "")), null);
  assert.equal(teamBracketHref(null, WORLDS[0]), null);
});

test("matches team or manager, case-insensitive; blank finds nothing", () => {
  assert.deepEqual(searchTournamentTeams(WORLDS, "  SAM ").map((t) => t.name), ["Legacy"]);
  assert.deepEqual(searchTournamentTeams(WORLDS, "rand").map((t) => t.name), ["Band of Randoms"]);
  assert.deepEqual(searchTournamentTeams(WORLDS, "   "), []);
});

test("a duplicate row for the same team in the same division shows once; limit holds", () => {
  const dup = [...WORLDS, T("Legacy", "womens-d", "Women's D", ["Sam Hill"])];
  assert.equal(searchTournamentTeams(dup, "legacy").length, 1);
  assert.equal(searchTournamentTeams(WORLDS, "a", 2).length, 2);
});
