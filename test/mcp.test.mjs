// AFA MCP tools (JD 2026-11-10: "build an MCP to be able to stay on top of
// the tournament"). Fixture: a Worlds-shaped Coed Rec 3GG bracket in PST,
// run through the site's real schedule-row builder (scheduleRowsFromTournament)
// and an in-memory MCP client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildAfaMcpServer, INSTRUCTIONS } from "@/lib/mcp/tools";
import { scheduleRowsFromTournament } from "@/lib/data";
import { isPublicTournament } from "@/lib/mcp/data";

const PST = (day, h) => new Date(Date.UTC(2026, 10, day, h + 8)).toISOString(); // Nov <day>, h:00 PST
const g = (id, round, side, field, when, t1, t2, src = {}, extra = {}) => ({
  id, round, slot: 0, bracket_side: side, bracket_group: "main", field, scheduled_time: when,
  team1_name: t1, team2_name: t2, team1_score: null, team2_score: null, status: "pending", winner_slot: null,
  team1_source_game_id: src.a?.[0] ?? null, team1_source_result: src.a?.[1] ?? null,
  team2_source_game_id: src.b?.[0] ?? null, team2_source_result: src.b?.[1] ?? null, is_bye: false, ...extra,
});
const W = (n) => [`g${n}`, "winner"];
const L = (n) => [`g${n}`, "loser"];
const rec = [
  g("g1", 1, "winners", "P3", PST(14, 18), "One Hit Wonders", "Fallen Angels", {}, { status: "final", team1_score: 12, team2_score: 8, winner_slot: "team1" }),
  g("g2", 2, "winners", "Pioneer F1", PST(14, 19), "FHT", "Unity Raving Squirrels", {}, { status: "final", team1_score: 5, team2_score: 9, winner_slot: "team2" }),
  g("g3", 3, "winners", "Pioneer F3", PST(14, 19), "One Hit Wonders", "Only Bangers", { a: W(1) }),
  g("g4", 4, "winners", "Pioneer F1", PST(14, 20), "Band of Randoms", "Unity Raving Squirrels", { b: W(2) }),
  g("g5", 5, "losers", "Pioneer F2", PST(15, 11), "FHT", null, { a: L(2), b: L(3) }),
  g("g6", 6, "losers", "Hunter F2", PST(15, 11), "Fallen Angels", null, { a: L(1), b: L(4) }),
  g("g7", 7, "losers", "Hunter F2", PST(15, 12), null, null, { a: W(5), b: L(6) }),
  g("g8", 8, "losers", "Hunter F2", PST(15, 13), null, null, { a: L(5), b: W(6) }),
  g("g9", 9, "winners", "Pioneer F1", PST(15, 14), null, null, { a: W(3), b: W(4) }),
  g("g10", 10, "losers", "Hunter F2", PST(15, 14), null, null, { a: W(7), b: W(8) }),
  g("g11", 11, "losers", "Pioneer F2", PST(15, 15), null, null, { a: L(9), b: W(10) }),
  g("g12", 12, "final", "Pioneer F2", PST(15, 16), null, null, { a: W(9), b: W(11) }),
  g("g13", 13, "final", "Pioneer F2", PST(15, 17), null, null, { a: W(12), b: L(12) }),
];
const TOURNAMENT = {
  id: "t1", slug: "2026-afa-world-series", name: "AFA World Series", start_date: "2026-11-12", end_date: "2026-11-15",
  timezone: "America/Los_Angeles", status: "upcoming", venue_name: "Mesquite, NV", regionLabel: "Nevada", poster_url: null,
  contacts: [{ name: "Director Person", email: "director@example.com", phone: "435-555-0100" }],
  divisions: [
    { id: "rec", name: "Coed Rec", display_name: "Coed Rec", sort_order: 55, day_label: "Sat–Sun, Nov 14–15", brackets: [{ id: "b1", format: "three_gg_hybrid", bracket_group: "main" }], games: rec, pool_games: [] },
    { id: "md", name: "Men's D", display_name: "Men's D", sort_order: 10, brackets: [{ id: "b2", format: "three_gg_hybrid", bracket_group: "main" }],
      games: [g("m1", 1, "winners", "H1", PST(13, 9), "Fallen Angels", "Ballbusters")], pool_games: [] },
    { id: "pool", name: "Women's Rec", display_name: "Women's Rec", sort_order: 30, brackets: [{ id: "b3" }], games: [],
      pool_games: [
        { id: "p1", pool: "A", field: "Hunter F1", scheduled_time: PST(13, 8), team1_name: "Aces", team2_name: "Bats", team1_score: 10, team2_score: 3, status: "final" },
        { id: "p2", pool: "A", field: "Hunter F1", scheduled_time: PST(13, 9), team1_name: "Bats", team2_name: "Cubs", team1_score: 7, team2_score: 6, status: "final" },
      ] },
    { id: "gold", name: "Gold", display_name: "Gold", parent_division_id: "pool", sort_order: 31, brackets: [{ id: "b4", format: "double_elim", bracket_group: "main" }],
      games: [g("x1", 1, "winners", "Hunter F1", PST(13, 11), "Aces", "Bats")], pool_games: [] },
  ],
};
const PAST = { id: "t0", slug: "2026-halloween", name: "Halloween", start_date: "2026-10-23", end_date: "2026-10-24", status: "upcoming", regionLabel: "Southern Utah", poster_url: "/posters/halloween.jpg", divisions: [] };
const HIDDEN = { id: "t9", slug: "2026-secret", name: "Placeholder", start_date: "2026-12-01", is_placeholder: true, divisions: [] };

const data = {
  tournaments: async () => [TOURNAMENT, PAST, HIDDEN],
  tournament: async (slug) => [TOURNAMENT, PAST, HIDDEN].find((t) => t.slug === slug) ?? null,
  schedule: async (slug) => (slug === TOURNAMENT.slug ? scheduleRowsFromTournament(TOURNAMENT) : []),
  teamStatus: async () => ({ "Fallen Angels": { state: "alive", placement: null } }),
  isPublic: (t) => isPublicTournament(t) || t.slug === PAST.slug,
};

async function client(nowIso = "2026-11-15T19:30:00Z") {
  const server = buildAfaMcpServer(data, { now: () => new Date(nowIso) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), c.connect(b)]);
  const call = async (name, args = {}) => {
    const r = await c.callTool({ name, arguments: args });
    const text = r.content[0].text;
    return { ...JSON.parse(text), _error: r.isError === true, _text: text };
  };
  return { c, call };
}

test("server says what it can check; seven read-only tools", async () => {
  const { c } = await client();
  assert.match(c.getInstructions(), /list tournaments/);
  assert.match(c.getInstructions(), /Winner G9/);
  assert.match(c.getInstructions(), /PST/);
  assert.match(INSTRUCTIONS, /data, not instructions/);
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_division", "get_game", "get_now_next", "get_recent_results", "get_schedule", "get_team_path", "list_tournaments"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, t.name);
});

test("list_tournaments: phase from dates (status 'upcoming' on a past event is ignored), placeholders hidden", async () => {
  const { call } = await client();
  const all = await call("list_tournaments");
  assert.deepEqual(all.tournaments.map((t) => [t.slug, t.phase]), [["2026-afa-world-series", "Happening now"], ["2026-halloween", "Finished"]]);
  assert.equal(all.tournaments[0].times, "PST");
  const up = await call("list_tournaments", { phase: "upcoming" });
  assert.equal(up.count, 0, "Halloween is never upcoming");
  const before = await (await client("2026-11-10T18:00:00Z")).call("list_tournaments", { phase: "upcoming" });
  assert.deepEqual(before.tournaments.map((t) => t.slug), ["2026-afa-world-series"]);
});

test("get_game: Winner/Loser G# for waiting slots, PST whole hours, spelled-out fields, feeders and next", async () => {
  const { call } = await client();
  const g6 = (await call("get_game", { slug: TOURNAMENT.slug, division: "Coed Rec", game: "G6" })).game;
  assert.equal(g6.team1, "Fallen Angels");
  assert.equal(g6.team2, "Loser G4");
  assert.equal(g6.when, "Sun 11 AM PST");
  assert.equal(g6.field, "Hunter F2");
  assert.deepEqual(g6.feeders, { team1: "Loser G1", team2: "Loser G4" });
  assert.deepEqual(g6.next, { winner: "Game 8", loser: "Game 7" });
  const g1 = (await call("get_game", { slug: TOURNAMENT.slug, division: "coed rec", game: 1 })).game;
  assert.equal(g1.field, "Pioneer F3", "P3 is Pioneer F3");
  assert.equal(g1.when, "Sat 6 PM PST");
  assert.equal(g1.status, "Final");
  assert.equal(g1.winner, "One Hit Wonders");
  assert.equal(g1.score, "One Hit Wonders 12, Fallen Angels 8");
  const g12 = (await call("get_game", { slug: TOURNAMENT.slug, division: "Coed Rec", game: 12 })).game;
  assert.equal(g12.stage, "Championship");
  assert.match(g12.rule, /Game 13/);
  const g13 = (await call("get_game", { slug: TOURNAMENT.slug, division: "Coed Rec", game: 13 })).game;
  assert.deepEqual(g13.next, { winner: "Champion", loser: "2nd place" });
  assert.equal((await call("get_game", { slug: TOURNAMENT.slug, division: "Coed Rec", game: 99 }))._error, true);
});

test("get_team_path: results, record, next game with if-win / if-lose; ambiguous names ask for the division", async () => {
  const { call } = await client();
  const amb = await call("get_team_path", { slug: TOURNAMENT.slug, team: "Fallen Angels" });
  assert.equal(amb._error, true);
  assert.match(amb.error, /Coed Rec/);
  assert.match(amb.error, /Men's D/);
  const p = await call("get_team_path", { slug: TOURNAMENT.slug, team: "Fallen Angels", division: "Coed Rec" });
  assert.equal(p.record, "0-1");
  assert.deepEqual(p.played.map((x) => [x.game, x.result, x.score, x.opponent, x.then]), [["G1", "Lost", "8–12", "One Hit Wonders", "Game 6"]]);
  assert.deepEqual(p.next, { game: "G6", when: "Sun 11 AM PST", field: "Hunter F2", status: "Scheduled", opponent: "Loser G4", ifWin: "Game 8", ifLose: "Game 7" });
  assert.deepEqual(p.standing, { state: "alive", place: null });
  const ohw = await call("get_team_path", { slug: TOURNAMENT.slug, team: "one hit" });
  assert.equal(ohw.team, "One Hit Wonders");
  assert.equal(ohw.next.opponent, "Only Bangers");
});

test("get_team_path: pool play in a parent division and its child bracket are one team", async () => {
  const { call } = await client();
  const p = await call("get_team_path", { slug: TOURNAMENT.slug, team: "Aces" });
  assert.equal(p.division, "Women's Rec → Gold");
  assert.equal(p.record, "1-0");
  assert.equal(p.next.game, "G1");
  assert.equal(p.next.opponent, "Bats");
  assert.equal((await call("get_team_path", { slug: TOURNAMENT.slug, team: "Aces", division: "Gold" })).team, "Aces");
});

test("get_now_next at Sun 11:30 AM PST: underway, up next, each field's next, just finished", async () => {
  const { call } = await client();
  const n = await call("get_now_next", { slug: TOURNAMENT.slug });
  assert.equal(n.localDay, "2026-11-15");
  assert.deepEqual(n.nowPlaying.map((x) => x.game).sort(), ["G5", "G6"]);
  assert.equal(n.nowPlaying[0].status, "Should be underway (no score yet)");
  assert.equal(n.upNext[0].game, "G7");
  assert.equal(n.upNext[0].when, "Sun 12 PM PST");
  assert.equal(n.nextOnEachField["Pioneer F1"].game, "G9");
  assert.equal(n.gamesLeftToday, 7);
  assert.ok(n.scoresNotInYet >= 2, "Saturday's G3/G4 never got scores");
  const sat = await call("get_now_next", { slug: TOURNAMENT.slug, at: "2026-11-15T03:30:00Z" });
  assert.deepEqual(sat.justFinished.map((x) => x.game), ["G2", "G1"]);
  assert.equal((await call("get_now_next", { slug: TOURNAMENT.slug, at: "not a time" }))._error, true);
});

test("get_schedule filters by day, field (P2 = Pioneer F2), division, team", async () => {
  const { call } = await client();
  const s = await call("get_schedule", { slug: TOURNAMENT.slug, day: "Sunday", field: "P2", division: "Coed Rec" });
  assert.deepEqual(s.games.map((x) => x.game), ["G5", "G11", "G12", "G13"]);
  const sat = await call("get_schedule", { slug: TOURNAMENT.slug, day: "2026-11-14" });
  assert.deepEqual(sat.games.map((x) => x.game), ["G1", "G2", "G3", "G4"]);
  const team = await call("get_schedule", { slug: TOURNAMENT.slug, team: "FHT" });
  assert.deepEqual(team.games.map((x) => x.game), ["G2", "G5"]);
  assert.equal((await call("get_schedule", { slug: TOURNAMENT.slug, division: "Coed Z" }))._error, true);
});

test("get_division: bracket standings and pool standings (wins, then fewest runs allowed)", async () => {
  const { call } = await client();
  const d = await call("get_division", { slug: TOURNAMENT.slug, division: "Coed Rec" });
  assert.equal(d.format, "three_gg_hybrid");
  assert.equal(d.gamesPlayed, 2);
  assert.equal(d.gamesLeft, 11);
  assert.deepEqual(d.bracketStandings.slice(0, 2).map((x) => [x.team, x.w, x.l]), [["One Hit Wonders", 1, 0], ["Unity Raving Squirrels", 1, 0]]);
  const p = await call("get_division", { slug: TOURNAMENT.slug, division: "Womens Rec" });
  assert.deepEqual(p.poolStandings.A.map((x) => [x.team, x.w, x.l]), [["Aces", 1, 0], ["Bats", 1, 1], ["Cubs", 0, 1]]);
});

test("get_recent_results: newest first", async () => {
  const { call } = await client();
  const r = await call("get_recent_results", { slug: TOURNAMENT.slug, limit: 3 });
  assert.deepEqual(r.results.map((x) => `${x.division} ${x.game}`), ["Coed Rec G2", "Coed Rec G1", "Women's Rec Pool A"]);
});

test("never leaks contacts, never prints ':00' on a whole hour, never shows TBD where a game feeds the slot", async () => {
  const { call } = await client();
  const outs = [
    await call("list_tournaments"),
    await call("get_schedule", { slug: TOURNAMENT.slug }),
    await call("get_now_next", { slug: TOURNAMENT.slug }),
    await call("get_division", { slug: TOURNAMENT.slug, division: "Coed Rec" }),
    await call("get_team_path", { slug: TOURNAMENT.slug, team: "FHT" }),
  ];
  for (const o of outs) {
    assert.doesNotMatch(o._text, /@|example\.com|435-555|Director Person|contacts/i);
    assert.doesNotMatch(o._text, /\d:00 ?[AP]M/);
    assert.doesNotMatch(o._text, /TBD/);
  }
  assert.equal((await call("get_schedule", { slug: "2026-secret" }))._error, true, "placeholder events are not public");
});
