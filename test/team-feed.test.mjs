// Team calendar feed scope (JD, 2026-11-09: "the calendar subscription is
// subscribing to all teams with the matched name, not just the relevant one").
import { test } from "node:test";
import assert from "node:assert/strict";
import { divisionFamily, teamFeedGames, teamFeedHref, teamFromFeedFile, feedSequence, sourceSlotLabeler } from "../lib/team-feed.js";

// Worlds 2026: two different teams called Fallen.
const WORLDS_DIVS = [
  { id: "mens-d", parent_division_id: null },
  { id: "mens-e", parent_division_id: null },
  { id: "womens-rec", parent_division_id: null },
];
const row = (id, divisionId, team1, team2, extra = {}) => ({
  id, divisionId, team1, team2, scheduledTime: "2026-11-13T23:00:00Z", ...extra,
});
const WORLDS_ROWS = [
  row("d5", "mens-d", "Jaded", "Fallen"),
  row("d9", "mens-d", "Winner of Game 5", "Elite"),
  row("e6", "mens-e", "Fallen", "Rejects"),
  row("e20", "mens-e", "Loser of Game 6", "OTF"),
  row("r4", "womens-rec", null, "Dirt Divas"),
];

test("old name-only link: every same-named team (the bug, kept for old links)", () => {
  const ids = teamFeedGames(WORLDS_ROWS, { team: "Fallen" }).map((g) => g.id);
  assert.deepEqual(ids, ["d5", "e6"]);
});

test("with the division: only the Fallen that was picked", () => {
  const e = teamFeedGames(WORLDS_ROWS, { team: "Fallen", family: divisionFamily(WORLDS_DIVS, "mens-e") });
  const d = teamFeedGames(WORLDS_ROWS, { team: "Fallen", family: divisionFamily(WORLDS_DIVS, "mens-d") });
  assert.deepEqual(e.map((g) => g.id), ["e6"]);
  assert.deepEqual(d.map((g) => g.id), ["d5"]);
});

test("a game joins the feed when W#/L# advancement names the team", () => {
  const family = divisionFamily(WORLDS_DIVS, "mens-e");
  const rows = WORLDS_ROWS.map((g) => ({ ...g }));
  assert.equal(teamFeedGames(rows, { team: "Fallen", family }).length, 1);
  rows.find((g) => g.id === "e20").team1 = "Fallen"; // lost G6, now named in G20
  assert.deepEqual(teamFeedGames(rows, { team: "Fallen", family }).map((g) => g.id), ["e6", "e20"]);
  // …and the other division's game that names the other Fallen stays out
  rows.find((g) => g.id === "d9").team1 = "Fallen";
  assert.deepEqual(teamFeedGames(rows, { team: "Fallen", family }).map((g) => g.id), ["e6", "e20"]);
});

test("no registration needed: Women's Rec names live only on game rows", () => {
  const got = teamFeedGames(WORLDS_ROWS, { team: "Dirt Divas", family: divisionFamily(WORLDS_DIVS, "womens-rec") });
  assert.deepEqual(got.map((g) => g.id), ["r4"]);
});

test("pool parent + bracket children are one team's tournament", () => {
  const divs = [
    { id: "coed-e", parent_division_id: null },
    { id: "coed-e-gold", parent_division_id: "coed-e" },
    { id: "coed-e-silver", parent_division_id: "coed-e" },
    { id: "mens-e", parent_division_id: null },
  ];
  const rows = [
    row("p1", "coed-e", "Fallen", "JKL"),
    row("g1", "coed-e-gold", "Fallen", "Oddballs"),
    row("m1", "mens-e", "Fallen", "Rejects"),
  ];
  for (const from of ["coed-e", "coed-e-gold", "coed-e-silver"]) {
    const ids = teamFeedGames(rows, { team: "Fallen", family: divisionFamily(divs, from) }).map((g) => g.id);
    assert.deepEqual(ids, ["p1", "g1"], `subscribed from ${from}`);
  }
});

test("a division id from another tournament falls back to name-only", () => {
  assert.equal(divisionFamily(WORLDS_DIVS, "somewhere-else"), null);
  assert.equal(divisionFamily(WORLDS_DIVS, null), null);
});

test("subscribe link is a plain .ics path: no query string, spaces as %20", () => {
  // JD's iPhone: "opened calendar and didnt add". No "&", no "+".
  const href = teamFeedHref({ host: "afa.example", slug: "2026-afa-world-series", team: "Hit & Run", divisionId: "womens-rec" });
  assert.equal(href, "webcal://afa.example/tournaments/2026-afa-world-series/cal/womens-rec/Hit%20%26%20Run.ics");
  assert.ok(!href.includes("?") && !href.includes("+"));
  assert.equal(
    teamFeedHref({ host: "afa.example", slug: "s", team: "Laced Up", divisionId: "5349d521-435a-42d2-8551-df96b8e2f95b" }),
    "webcal://afa.example/tournaments/s/cal/5349d521-435a-42d2-8551-df96b8e2f95b/Laced%20Up.ics"
  );
  // Before mount: same path, no host.
  assert.equal(teamFeedHref({ slug: "s", team: "Legacy", divisionId: "d" }), "/tournaments/s/cal/d/Legacy.ics");
});

test("the path round-trips every team name back to the exact name", () => {
  for (const team of ["Legacy", "Laced Up", "Hit & Run", "Mama's Boys", "Côté · Team", "100% Fun", "A+B"]) {
    const href = teamFeedHref({ slug: "s", team, divisionId: "d" });
    assert.equal(teamFromFeedFile(href.split("/").pop()), team);
  }
  assert.equal(teamFromFeedFile("Legacy"), null);
  assert.equal(teamFromFeedFile(".ics"), null);
  assert.equal(teamFromFeedFile("%E0%A4%A.ics"), null);
});

test("no division, or a name with a slash: the old games.ics link", () => {
  assert.equal(teamFeedHref({ slug: "s", team: "Fallen" }), "/tournaments/s/games.ics?team=Fallen");
  assert.equal(
    teamFeedHref({ slug: "s", team: "A/B", divisionId: "d" }),
    "/tournaments/s/games.ics?team=A%2FB&division=d"
  );
});

test("SEQUENCE only goes up, so edited games replace in place", () => {
  const a = feedSequence(new Date("2026-11-13T22:00:00Z"));
  const b = feedSequence(new Date("2026-11-13T22:01:00Z"));
  assert.ok(Number.isInteger(a) && b > a);
  assert.ok(feedSequence(new Date("2038-01-01T00:00:00Z")) < 2 ** 31);
});

test("an empty sheet slot is named by the game it waits on, never null", () => {
  const label = sourceSlotLabeler([{ id: "g1", round: 1 }, { id: "g6", round: 6 }]);
  assert.equal(label("g1", "winner"), "Winner of Game 1");
  assert.equal(label("g6", "loser"), "Loser of Game 6");
  assert.equal(label(null, "winner"), null);
  assert.equal(label("elsewhere", "winner"), null);
});
