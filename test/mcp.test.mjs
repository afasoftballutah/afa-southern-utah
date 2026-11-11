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
import { gameState, fieldGrid, gridTrack } from "@/lib/mcp/field-grid";
import { GRID_CSS, GRID_JS, SITE_SHIM, siteGridRunner } from "@/lib/mcp/grid-view";
import { TEAM_VIEW_HTML } from "@/lib/mcp/team-view";
import { CARD_JS } from "@/lib/mcp/views";
import { readFileSync } from "node:fs";

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

test("server says what it can check and which tool answers what; seven read-only tools", async () => {
  const { c } = await client();
  assert.match(c.getInstructions(), /list tournaments/);
  assert.match(c.getInstructions(), /Winner G9/);
  assert.match(c.getInstructions(), /PST/);
  assert.match(INSTRUCTIONS, /data, not instructions/);
  assert.match(INSTRUCTIONS, /next game, when it plays, how it can win, its paths or routes[^→]*→ get_team_path with just the team name/);
  assert.match(INSTRUCTIONS, /now or up next → get_now_next/);
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

test("get_team_path: results, record, next game with if-win / if-lose; a name in two divisions returns both", async () => {
  const { c, call } = await client();
  const both = await call("get_team_path", { slug: TOURNAMENT.slug, team: "Fallen Angels" });
  assert.equal(both._error, false, "no division needed");
  assert.deepEqual(both.teams.map((t) => [t.team, t.division, t.record]), [["Fallen Angels", "Men's D", "0-0"], ["Fallen Angels", "Coed Rec", "0-1"]], "schedule order");
  assert.match(both.note, /2 teams named Fallen Angels/);
  const raw = await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "Fallen Angels" } });
  const { view, ...answer } = raw.structuredContent;
  assert.equal(raw.content[0].text, JSON.stringify(answer));
  assert.deepEqual(view.teams.map((t) => t.division), ["Men's D", "Coed Rec"], "one card per division");
  assert.deepEqual(view.teams.map((t) => [t.grid, t.lazy]), [
    [undefined, { slug: TOURNAMENT.slug, team: "Fallen Angels", division: "Men's D" }],
    [undefined, { slug: TOURNAMENT.slug, team: "Fallen Angels", division: "Coed Rec" }],
  ], "each grid on request (get_team_path with the division), so the answer stays small");
  const one = await c.callTool({ name: "get_team_path", arguments: view.teams[1].lazy });
  assert.ok(one.structuredContent.view.teams[0].grid, "the follow-up call carries the grid");
  const amb = await call("get_team_path", { slug: TOURNAMENT.slug, team: "o" });
  assert.equal(amb._error, true, "different names that only contain the words still ask");
  assert.match(amb.error, /Give the division/);
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

// MCP Apps game card (piece 1, JD 2026-11-10): get_game names ui://afa/game,
// the resource is one self-contained HTML document, the text answer is the
// same JSON as before, and the card data is the site's card, nothing more.
test("get_game view: ui://afa/game resource, self-contained, block-all CSP", async () => {
  const { c } = await client();
  const { tools } = await c.listTools();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.equal(byName.get_game._meta.ui.resourceUri, "ui://afa/game");
  const VIEWS = { get_game: "ui://afa/game", get_team_path: "ui://afa/team", get_schedule: "ui://afa/games", get_now_next: "ui://afa/games" };
  for (const t of tools) assert.equal(t._meta?.ui?.resourceUri, VIEWS[t.name], `${t.name} view`);
  const { resources } = await c.listResources();
  assert.deepEqual(resources.map((r) => [r.uri, r.mimeType]).sort(), [...new Set(Object.values(VIEWS))].sort().map((u) => [u, "text/html;profile=mcp-app"]));
  const { contents } = await c.readResource({ uri: "ui://afa/game" });
  assert.equal(contents.length, 1);
  const [html] = contents;
  assert.equal(html.mimeType, "text/html;profile=mcp-app");
  assert.equal(html._meta.ui.csp, undefined, "nothing to allow: no fetches, scripts, fonts or frames from anywhere");
  assert.match(html.text, /^<!doctype html>/);
  assert.match(html.text, /ui\/initialize/);
  assert.match(html.text, /ui\/notifications\/tool-result/);
  assert.match(html.text, /ui\/open-link/);
  assert.doesNotMatch(html.text, /<script[^>]+src=|<link[^>]+href=|@import|url\(|fetch\(|XMLHttpRequest|innerHTML/i);
});

test("get_game view: text unchanged; card = division color, Winner/Loser G#, red/green next lines, PST, View on site", async () => {
  const { c } = await client();
  const call = (args) => c.callTool({ name: "get_game", arguments: { slug: TOURNAMENT.slug, division: "Coed Rec", ...args } });

  const r6 = await call({ game: 6 });
  const { card, ...answer } = r6.structuredContent;
  assert.equal(r6.content.length, 1);
  assert.equal(r6.content[0].text, JSON.stringify(answer), "text clients read exactly what they read before");
  assert.deepEqual(card.tone, { bg: "#eadbd0", ink: "#5a2e14", solid: "#6b3a1f" }, "Coed Rec brown (lib/division-tones.js)");
  assert.deepEqual(card.side, { text: "L", label: "Losers bracket", gold: false });
  assert.equal(card.title, "Game 6");
  assert.deepEqual(card.board.map((b) => b.team ?? `${b.from} ${b.game}`), ["Fallen Angels", "Loser G4"]);
  assert.deepEqual(card.loser, { next: "Game 7", where: "Sun 12 PM \u00b7 Hunter F2" });
  assert.deepEqual(card.winner, { next: "Game 8", where: "Sun 1 PM \u00b7 Hunter F2" });
  assert.equal(card.time, "Sun 11 AM PST");
  assert.equal(card.field, "Hunter F2");
  assert.equal(card.url, "https://afa-southern-utah.vercel.app/tournaments/2026-afa-world-series/division/rec?game=6");

  const c1 = (await call({ game: 1 })).structuredContent.card;
  assert.deepEqual(c1.board.map((b) => [b.team, b.score, b.won]), [["One Hit Wonders", 12, true], ["Fallen Angels", 8, false]]);
  assert.equal(c1.time, "Sat 6 PM PST");

  const c12 = (await call({ game: 12 })).structuredContent.card;
  assert.deepEqual(c12.side, { text: "\u2605 Final", label: "Championship", gold: true });
  assert.deepEqual(c12.board.map((b) => `${b.from} ${b.game}`), ["Winner G9", "Winner G11"]);
  assert.deepEqual([c12.winner, c12.loser], [{ champion: true }, { place: "2nd" }]);
  assert.deepEqual(c12.ifGame, { title: "Game 13", where: "Sun 5 PM \u00b7 Pioneer F2" });

  const all = JSON.stringify((await call({ game: 6 })).structuredContent);
  for (const secret of ["director@example.com", "435-555-0100", "Director Person", "contacts"]) assert.ok(!all.includes(secret), secret);

  const missing = await call({ game: 99 });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent, undefined, "an error has no card; the view shows the error text");
});

// Piece 2 (JD 2026-11-10: "i dont want to have to ask so specifically"):
// get_team_path draws the team's next game card and the field grid with
// its paths lit.
test("get_team_path view: ui://afa/team is self-contained; text unchanged; no contacts", async () => {
  const { c } = await client();
  const { contents } = await c.readResource({ uri: "ui://afa/team" });
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.equal(contents[0]._meta.ui.csp, undefined);
  assert.doesNotMatch(contents[0].text, /<script[^>]+src=|<link[^>]+href=|@import|url\(|fetch\(|XMLHttpRequest|innerHTML/i);
  assert.match(contents[0].text, /Paths to the title/);
  const r = await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } });
  const { view, ...answer } = r.structuredContent;
  assert.equal(r.content[0].text, JSON.stringify(answer), "text clients read exactly what they read before");
  assert.equal(view.teams.length, 1);
  for (const secret of ["director@example.com", "435-555-0100", "Director Person"]) assert.ok(!JSON.stringify(r.structuredContent).includes(secret), secret);
  assert.doesNotMatch(JSON.stringify(view), /\d:00\b/, "whole hours never show :00");
});

const at = (grid) => new Map(grid.days.flatMap((d) => d.games.map((x) => [x.i, x])));
const names = (grid, list) => list.map((i) => at(grid).get(i)?.n);
const arrows = (grid, edges) => edges.map(([a, b, k]) => `${at(grid).get(a).n}${{ w: ">", l: "~>", if: "?>" }[k]}${at(grid).get(b).n}`);

test("get_team_path grid: every game on the team's days by field and time; done only with a final score", async () => {
  const { c } = await client(); // Sun 11:30 AM PST
  const t = (await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } })).structuredContent.view.teams[0];
  const g = t.grid;
  assert.deepEqual(g.fields, ["Hunter F1", "Hunter F2", "Pioneer F1", "Pioneer F2", "Pioneer F3"], "every field of the tournament, Hunter then Pioneer");
  assert.equal(g.zone, "PST");
  assert.equal(g.now, "Sun 11:30 AM");
  assert.deepEqual(g.days.map((d) => d.title), ["Sat, Nov 14", "Sun, Nov 15"], "only the days this team plays or can play");
  assert.deepEqual(g.divs.find((d) => d.name === "Coed Rec"), { name: "Coed Rec", bg: "#eadbd0", ink: "#5a2e14", solid: "#6b3a1f", url: "https://afa-southern-utah.vercel.app/tournaments/2026-afa-world-series/division/rec" }, "division colour and page");
  const by = Object.fromEntries([...at(g).values()].map((x) => [x.n, x]));
  assert.deepEqual([by.G1.st, by.G1.sc, g.fields[by.G1.f], by.G1.tm], ["final", "12\u20138", "Pioneer F3", "Sat 6 PM"]);
  assert.equal(by.G3.st, "awaiting", "Sat 7 PM with no score yet: awaiting score, not done");
  assert.equal(by.G3.s1, undefined, "no score drawn for a game without a final");
  assert.equal(by.G5.st, "live", "Sun 11 AM at 11:30: in progress");
  assert.equal(by.G7.st, "upcoming");
  assert.deepEqual([by.G5.t1, by.G5.t2, by.G7.t1, by.G7.t2], ["FHT", "Loser G3", "Winner G5", "Loser G6"], "Winner/Loser G# slots");
  assert.deepEqual([by.G5.l, by.G5.w], ["Game 8", "Game 7"]);
  assert.equal(g.days[1].now, 11 * 60 + 30 - 11 * 60, "now line: minutes into Sunday's first hour");
  assert.equal(g.days[0].now, undefined);
  assert.equal(g.days[0].fold, undefined, "Sat 7 PM holds an unscored game: nothing folds");
});

test("get_team_path grid: the team's paths from its next game (even unscored past its time), played games solid", async () => {
  const { c } = await client();
  const sc = (await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } })).structuredContent;
  const t = sc.view.teams[0];
  assert.equal(t.selected, "One Hit Wonders");
  assert.deepEqual(t.picker.map((p) => p.name), ["Band of Randoms", "Fallen Angels", "FHT", "One Hit Wonders", "Only Bangers", "Unity Raving Squirrels"]);
  const me = t.picker.find((p) => p.name === "One Hit Wonders");
  assert.equal(me.record, "1-0");
  assert.deepEqual(names(t.grid, me.played), ["G1"]);
  assert.deepEqual(arrows(t.grid, me.went), ["G1>G3"], "won G1, on to G3");
  assert.deepEqual(names(t.grid, me.reach).sort(), ["G10", "G11", "G12", "G13", "G3", "G5", "G7", "G8", "G9"], "G3 has no score yet: every path through it stays open (3GG: losing G5 still leads to G8)");
  assert.deepEqual(arrows(t.grid, me.edges).sort(), ["G10>G11", "G11>G12", "G12?>G13", "G3>G9", "G3~>G5", "G5>G7", "G5~>G8", "G7>G10", "G8>G10", "G9>G12", "G9~>G11"].sort());
  const out = Object.fromEntries(Object.entries(me.out).map(([i, p]) => [at(t.grid).get(Number(i)).n, p]));
  assert.equal(out.G13, "2nd", "the if-necessary game's loser is 2nd");
  assert.equal(out.G12, undefined, "the final's loser place depends on the side, so it sits on the if-necessary game");
  assert.deepEqual(out, { G7: "5th", G8: "5th", G10: "4th", G11: "3rd", G13: "2nd" }, "the finish wherever a loss ends the run");

  const fa = t.picker.find((p) => p.name === "Fallen Angels");
  assert.equal(fa.record, "0-1");
  assert.deepEqual(arrows(t.grid, fa.went), ["G1~>G6"], "lost G1: the traveled loss arrow into G6");
  assert.ok(!names(t.grid, fa.reach).includes("G3"), "winners-side games are no longer possible after the loss");
  assert.ok(JSON.stringify(sc).length < 40_000, "small enough to ride in structuredContent");
});

test("field grid: a game is done only with a final score; only an all-final opening run of hours folds", () => {
  const now = new Date(PST(15, 12));
  const row = (h, extra = {}) => ({ id: `r${h}${extra.f ?? ""}`, label: "G1", field: extra.f ?? "H1", divisionId: "d", divisionName: "Coed Rec", scheduledTime: PST(15, h), team1: "A", team2: "B", score1: null, score2: null, status: "pending", ...extra });
  assert.equal(gameState(row(8, { status: "final", isFinal: true, score1: 3, score2: 1 }), now), "final");
  assert.equal(gameState(row(8, { status: "final", isFinal: true }), now), "awaiting", "marked final but no score: not done");
  assert.equal(gameState(row(10), now), "awaiting", "two hours past its start, no score");
  assert.equal(gameState(row(11, { scheduledTime: new Date(Date.UTC(2026, 10, 15, 19, 10)).toISOString() }), now), "live", "50 minutes in");
  assert.equal(gameState(row(13), now), "upcoming");
  const fin = { status: "final", isFinal: true, score1: 5, score2: 2 };
  const rows = [row(8, fin), row(9, fin), row(10, { ...fin, f: "H2" }), row(10), row(11, fin), row(13)];
  const { grid } = fieldGrid(rows, "America/Los_Angeles", now, { siteUrl: "https://x", slug: "s" });
  assert.equal(grid.days[0].fold, 2, "8 and 9 AM are all final; 10 AM holds a game with no score");
  assert.equal(grid.days[0].foldLabel, "8 AM\u201310 AM \u00b7 all final");
  assert.equal(grid.days[0].now, 4 * 60);
  const done = fieldGrid([row(8, fin), row(9, fin)], "America/Los_Angeles", now, { siteUrl: "https://x", slug: "s" }).grid;
  assert.equal(done.days[0].foldLabel, "Sun \u00b7 all final", "a day all scored folds whole");
});

test("get_schedule / get_now_next view: ui://afa/games cards by day or now/next; text unchanged", async () => {
  const { c } = await client();
  const html = (await c.readResource({ uri: "ui://afa/games" })).contents[0];
  assert.equal(html.mimeType, "text/html;profile=mcp-app");
  assert.doesNotMatch(html.text, /<script[^>]+src=|<link[^>]+href=|@import|url\(|fetch\(|XMLHttpRequest|innerHTML/i);

  const r = await c.callTool({ name: "get_schedule", arguments: { slug: TOURNAMENT.slug, team: "Fallen Angels" } });
  const { view, ...answer } = r.structuredContent;
  assert.equal(r.content[0].text, JSON.stringify(answer), "text clients read exactly what they read before");
  assert.equal(view.title, "Fallen Angels \u00b7 AFA World Series");
  assert.deepEqual(view.groups.map((g) => [g.label, g.cards.map((x) => `${x.division} ${x.title} ${x.time} ${x.field}`)]), [
    ["Fri, Nov 13", ["Men's D Game 1 Fri 9 AM PST Hunter F1"]],
    ["Sat, Nov 14", ["Coed Rec Game 1 Sat 6 PM PST Pioneer F3"]],
    ["Sun, Nov 15", ["Coed Rec Game 6 Sun 11 AM PST Hunter F2"]],
  ], "a name in two divisions: a card per division game, in its own color");
  assert.deepEqual(view.groups[0].cards[0].tone, { bg: "#fde3e3", ink: "#a51c1c", solid: "#dc2626" }, "Men's D red");
  assert.deepEqual(view.groups[2].cards[0].board.map((b) => [b.team ?? `${b.from} ${b.game}`, Boolean(b.us)]), [["Fallen Angels", true], ["Loser G4", false]]);
  assert.deepEqual(view.groups[2].cards[0].loser, { next: "Game 7", where: "Sun 12 PM \u00b7 Hunter F2" });
  assert.equal(view.url, "https://afa-southern-utah.vercel.app/tournaments/2026-afa-world-series/schedule");

  const nn = await c.callTool({ name: "get_now_next", arguments: { slug: TOURNAMENT.slug, at: "2026-11-15T19:30:00Z", limit: 3 } });
  const { view: nv, ...nanswer } = nn.structuredContent;
  assert.equal(nn.content[0].text, JSON.stringify(nanswer));
  assert.equal(nv.subtitle, "As of Sun 11:30 AM PST");
  assert.deepEqual(nv.groups.map((g) => [g.label, g.cards.map((x) => x.title)]), [["Now playing", ["Game 6", "Game 5"]], ["Up next", ["Game 7", "Game 8", "Game 10"]]]);
  assert.deepEqual(nanswer.nowPlaying.map((g) => g.game), ["G6", "G5"], "same order as the text");
  assert.deepEqual(nanswer.upNext.map((g) => g.game), ["G7", "G8", "G10"], "same games, same order as the text");
  for (const secret of ["director@example.com", "435-555-0100", "Director Person"]) assert.ok(!JSON.stringify([r.structuredContent, nn.structuredContent]).includes(secret), secret);
});

test("site Path view: the MCP team grid's own code and track; a Schedule tab next to an unchanged Timeline", async () => {
  // One drawing source for both: the MCP view inlines it, the site runs it.
  assert.ok(TEAM_VIEW_HTML.includes(GRID_JS) && TEAM_VIEW_HTML.includes(GRID_CSS));
  const run = siteGridRunner(CARD_JS);
  assert.equal(typeof run.gridEl, "function");
  assert.equal(typeof run.keyEl, "function");

  // The site's track for a picked team is the MCP picker's track.
  const now = new Date("2026-11-15T19:30:00Z");
  const rows = scheduleRowsFromTournament(TOURNAMENT);
  const { index } = fieldGrid(rows, "America/Los_Angeles", now, { siteUrl: "", slug: TOURNAMENT.slug });
  const site = gridTrack(rows, "One Hit Wonders", new Set(["rec"]), null, index);
  const { c } = await client();
  const sc = (await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } })).structuredContent;
  const mcp = sc.view.teams[0].picker.find((p) => p.name === "One Hit Wonders");
  const { name, ...mcpTrack } = mcp;
  assert.equal(name, "One Hit Wonders");
  assert.deepEqual(site, mcpTrack);

  // The tab: "Path view" beside By field / By time / Timeline, driven by Find your team.
  const browser = readFileSync(new URL("../components/ScheduleBrowser.js", import.meta.url), "utf8");
  assert.match(browser, />\s*Path view\s*</);
  assert.match(browser, />\s*Timeline\s*</);
  assert.match(browser, /<PathView rows=\{rows\}[^>]*team=\{team\}/);
  const view = readFileSync(new URL("../components/PathView.js", import.meta.url), "utf8");
  assert.ok(!/setInterval|setTimeout\(\s*\w+,\s*\d{4,}/.test(view), "no polling");
});

test("grid finishes read just the place, not bold; no legend text for them (JD 2026-11-10)", () => {
  assert.ok(!/their finish/.test(GRID_JS), "no 'their finish if they lose there' legend");
  assert.ok(!/"Out "/.test(GRID_JS), "finish labels read '9th', not 'Out 9th'");
  assert.match(GRID_CSS, /button\.pill \.fin \{[^}]*font-weight: 400;/);
});

test("Path view compact pills: narrower boxes, tiny corner place, score under the number (JD iPhone size)", () => {
  assert.match(GRID_JS, /G\.ph = show \? 32 : 44/);
  assert.match(GRID_JS, /hour: show \? 48 : 86/);
  assert.match(GRID_JS, /var n = h < x\.fold \|\| h < first \|\| h > last \? 0 : G\.hour/);
  assert.match(GRID_JS, /dayPad: show \? 10 : 0/);
  assert.match(GRID_JS, /var minLane = show \? 54 : 46/);
  assert.doesNotMatch(GRID_JS, /var rail = show \? 16 : 0/);
  assert.match(GRID_JS, /function routeLines/);
  assert.match(GRID_JS, /G\.pw = show \? 48 : G\.lane - 8/);
  assert.match(GRID_JS, /G\.pad = Math\.max\(0, Math\.floor\(\(G\.lane - G\.pw\) \/ 2\)\)/);
  assert.match(GRID_JS, /if \(vertical && G\.across < width\) G\.across = width/);
  assert.match(GRID_JS, /y: t \+ Math\.floor\(\(G\.hour - G\.ph\) \/ 2\)/);
  assert.match(GRID_JS, /u \+ Math\.floor\(\(G\.hour - 11\) \/ 2\)/);
  assert.match(GRID_CSS, /\.fg-top \{ display: flex; align-items: center/);
  assert.match(GRID_CSS, /text-overflow: ellipsis/);
  assert.match(GRID_CSS, /\.fg-lab\.day \{[^}]*word-spacing: 0\.2em/);
  assert.match(GRID_CSS, /\.fg-head\.v \.fg-fname \{ font-size: 0\.6875rem/);
  assert.match(GRID_CSS, /\.fg-coltint \{[^}]*z-index: 0;[^}]*background: rgba\(0, 0, 0, 0\.025\)/);
  assert.match(GRID_CSS, /\.fg-fname\.tint \{ background: rgba\(0, 0, 0, 0\.025\)/);
  assert.match(GRID_JS, /fg-coltint/);
  assert.match(GRID_JS, /day\.start - pad - G\.dayHead/);
  assert.match(GRID_JS, /day\.start - pad - 1/);
  assert.match(GRID_CSS, /button\.pill\.compact \{[^}]*flex-direction: column/);
  assert.match(GRID_CSS, /button\.pill\.compact \.fin \{[^}]*position: absolute;[^}]*font-size: 0\.5rem/);
  assert.match(GRID_CSS, /button\.pill\.compact \.fin \{[^}]*padding-right: 2px;[^}]*overflow: visible/);
  assert.match(GRID_CSS, /button\.pill \.fin \{[^}]*padding-right: 2px;[^}]*overflow: visible/);
  assert.match(GRID_CSS, /button\.pill \{[^}]*overflow: visible/);
  assert.match(GRID_CSS, /button\.pill\.compact \.gno \{[^}]*font-size: 0\.6875rem/);
  assert.match(GRID_CSS, /button\.pill\.compact \.scr \{[^}]*font-size: 0\.5625rem;[^}]*margin-top: 0/);
});

test("site header: tournament name in the bar, phone menu, compact Schedule title (JD 2026-11-11)", () => {
  const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  const header = readFileSync(new URL("../components/SiteHeader.js", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../components/SiteNav.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/tournaments/[slug]/schedule/page.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const wordmark = readFileSync(new URL("../components/SiteWordmark.js", import.meta.url), "utf8");
  assert.match(layout, /<SiteHeader \/>/);
  assert.match(header, /getTournamentWordmarks/);
  assert.match(header, /SiteWordmark/);
  assert.match(header, /aria-label="AFA SlowPitch home"/);
  assert.match(wordmark, /usePathname/);
  assert.match(wordmark, /AFA SlowPitch/);
  assert.match(wordmark, /href=\{\`\/tournaments\/\$\{slug\}\`\}/);
  assert.match(wordmark, /tournamentSlugFromPath/);
  assert.match(nav, /aria-label="Menu"/);
  assert.match(nav, /site-nav__bars/);
  assert.match(nav, /site-nav__dropdown/);
  assert.match(nav, /Tournaments/);
  assert.match(nav, /News/);
  assert.match(nav, /Rules/);
  assert.match(css, /@media \(min-width: 640px\) \{\s*\.site-nav__links \{ display: flex; \}/);
  assert.match(css, /\.site-nav__links \{ display: none;/);
  assert.match(css, /\.site-wordmark \{[^}]*text-overflow: ellipsis/);
  assert.match(page, /className="sched-head"/);
  assert.match(page, /className="space-y-2"/);
  assert.doesNotMatch(page, /sched-head__back|sched-head__tourney|‹/);
  assert.match(css, /\.sched-head__title \{[^}]*font-size: 1\.125rem/);
  assert.match(css, /\.site-main:has\(\.sched-head\) \{ padding-top: 0\.5rem/);
});

// A just-enough DOM to run the grid's own drawing code in node.
function fakeDom() {
  class Node {
    constructor(tag) { this.tagName = tag; this.childNodes = []; this.attrs = {}; this.className = ""; this.parent = null; this._text = "";
      const self = this;
      this.style = { cssText: "", setProperty() {} };
      this.classList = { add: (c) => { if (!self.cls().includes(c)) self.className = (self.className + " " + c).trim(); }, remove: (c) => { self.className = self.cls().filter((x) => x !== c).join(" "); }, contains: (c) => self.cls().includes(c) };
    }
    cls() { return this.className.split(/\s+/).filter(Boolean); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "class") this.className = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    appendChild(c) { c.parent = this; this.childNodes.push(c); return c; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
    remove() { if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((x) => x !== this); }
    replaceWith(n) { const p = this.parent; if (p) { p.childNodes[p.childNodes.indexOf(this)] = n; n.parent = p; } }
    addEventListener() {}
    set textContent(v) { this._text = String(v); this.childNodes = []; }
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(""); }
    all(pred, out = []) { for (const c of this.childNodes) { if (pred(c)) out.push(c); c.all?.(pred, out); } return out; }
  }
  class Text extends Node { constructor(t) { super("#text"); this._text = t; } }
  return { document: { createElement: (t) => new Node(t), createElementNS: (ns, t) => new Node(t), createTextNode: (t) => new Text(t) } };
}

test("Path view with a team picked: only its games, every edge a line, sticky head, traveled legs bold", async () => {
  const { c } = await client();
  const sc = (await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } })).structuredContent;
  const t = sc.view.teams[0];
  const me = t.picker.find((p) => p.name === "One Hit Wonders");
  const dom = fakeDom();
  const run = new Function("document", "window", "setTimeout", `${CARD_JS}\n${SITE_SHIM}\n${GRID_JS}\nreturn { gridEl: gridEl, keyEl: keyEl };`)(dom.document, { innerWidth: 390 }, () => {});
  for (const width of [390, 1280]) {
    const out = run.gridEl(t, "One Hit Wonders", { clientWidth: width });
    const pills = out.all((n) => n.tagName === "button" && n.classList.contains("pill"));
    const gno = (p) => p.all((n) => n.className === "gno")[0]?.textContent ?? p.childNodes[0].textContent;
    const shown = pills.map(gno).filter((n) => /^G\d+$/.test(n)).sort();
    assert.deepEqual(shown, at(t.grid) && [...new Set([...me.played, ...me.reach])].map((i) => at(t.grid).get(i).n).sort(), "only the team's games are drawn");
    assert.ok(pills.every((p) => !p.classList.contains("dim")), "nothing faded: the rest are hidden");
    assert.ok(width >= 640 || pills.every((p) => p.classList.contains("compact")), "phone team view uses compact pills");
    if (width < 640) {
      const dim = (css, k) => Number((css.match(new RegExp(k + ":([\\d.]+)px")) || [])[1]);
      const ph = pills.map((p) => dim(p.style.cssText, "height")).filter(Boolean);
      const pw = pills.map((p) => dim(p.style.cssText, "width")).filter(Boolean);
      assert.ok(ph.length && ph.every((x) => x === 32), "phone team pills are 32px tall");
      assert.ok(pw.length && pw.every((x) => x === 48), "phone team pills stay 48px wide");
      const gridBox = out.all((n) => n.className === "fg")[0];
      const gridW = Number.parseFloat(gridBox?.style.width) || dim(gridBox?.style.cssText || "", "width");
      assert.ok(gridW >= width - 1, "grid fills the card width: " + gridW + " vs " + width);
      const px = (n) => Number.parseFloat(n.style.width) || dim(n.style.cssText, "width");
      const lanes = out.all((n) => /\bfg-fname\b/.test(n.className)).map(px);
      assert.ok(lanes.length && lanes.every((w) => w === lanes[0]), "field columns share a width");
      const fnames = out.all((n) => /\bfg-fname\b/.test(n.className));
      fnames.forEach((n, i) => {
        assert.equal(n.classList.contains("tint"), i % 2 === 0, `header column ${i} tint is every other`);
      });
      const tints = out.all((n) => /\bfg-coltint\b/.test(n.className));
      assert.equal(tints.length, Math.ceil(fnames.length / 2), "one full-height tint band per even field column");
      tints.forEach((n) => {
        const s = n.style.cssText;
        const left = Number((s.match(/left:(-?[\d.]+)px/) || [])[1]);
        assert.ok(left >= 40, "tint does not cover the time column");
        assert.match(s, /top:0/);
      });
      const lane = lanes[0];
      assert.ok(40 + lanes.length * lane <= gridW + 1, "columns span the card");
      const pad = Math.floor((lane - 48) / 2);
      for (const p of pills) {
        const x = dim(p.style.cssText, "left");
        assert.equal((x - 40) % lane, pad, "box is centered in its column");
      }
      const hours = out.all((n) => /\bfg-lab\b/.test(n.className) && /\bhour\b/.test(n.className));
      const hourLabs = hours.map((n) => Number.parseFloat(n.style.top) || dim(n.style.cssText, "top")).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
      const labOff = Math.floor((48 - 11) / 2);
      const rowStarts = hourLabs.map((top) => top - labOff);
      const dayGaps = [];
      for (let i = 1; i < rowStarts.length; i++) {
        const dlt = rowStarts[i] - rowStarts[i - 1];
        if (dlt < 60) dayGaps.push(dlt);
      }
      assert.ok(dayGaps.length && dayGaps.every((d) => d === 48), "every hour row in a day is 48px, no skipped hours: " + dayGaps.join(","));
      const mid = Math.floor((48 - 32) / 2);
      for (const p of pills) {
        const y = dim(p.style.cssText, "top");
        const row = rowStarts.find((u) => y >= u && y < u + 48);
        if (row != null) assert.equal(y, row + mid, "card is vertically centered in its hour row");
      }
    }
    const route = pills.filter((p) => p.classList.contains("route")).map(gno);
    assert.deepEqual(route, ["G3", "G9", "G12"], "win-out route: G3, win G9, win the final G12");
    assert.equal(out.all((n) => /\bstub\b/.test(n.className)).length, 0, "every edge drawn as a line, no W→G labels");
    const thick = out.all((n) => n.tagName === "path" && n.getAttribute("fill") === "none" && n.getAttribute("stroke-width") === "4");
    assert.equal(thick.length, 1, "only the traveled G1→G3 win is bold; the rest of the win-out stays thin");
    const thinWin = out.all((n) => n.tagName === "path" && n.getAttribute("fill") === "none" && n.getAttribute("stroke") === "var(--win)" && n.getAttribute("stroke-width") === "1.25");
    assert.ok(thinWin.length >= 2, "undecided win-out legs are thin and light");
    // Orthogonal lines, one clean head each, the line stopping at the head's base (JD on his iPhone).
    const pts = (d) => d.replace(/^M/, "").split(" L").map((x) => x.trim().split(/\s+/).map(Number));
    const lines = out.all((n) => n.tagName === "path" && n.getAttribute("fill") === "none");
    const heads = out.all((n) => n.tagName === "path" && n.getAttribute("class") === "head");
    assert.equal(heads.length, lines.length, "one head per line");
    for (const [li, line] of lines.entries()) {
      const p = pts(line.getAttribute("d"));
      for (let k = 1; k < p.length; k++) {
        const dx = Math.abs(p[k][0] - p[k - 1][0]), dy = Math.abs(p[k][1] - p[k - 1][1]);
        assert.ok(dx < 0.11 || dy < 0.11, `segment ${k} of line ${li} is not diagonal`);
      }
      assert.ok(p.length === 2 || p.length === 4 || p.length === 6, `line ${li} is straight, one elbow, or a side-lane jog, not ${p.length} points`);
      if (p.length === 4 && width < 640) {
        assert.ok(Math.abs(p[0][0] - p[1][0]) < 0.11 && Math.abs(p[1][1] - p[2][1]) < 0.11 && Math.abs(p[2][0] - p[3][0]) < 0.11, `line ${li} is V-H-V`);
        const lo = Math.min(p[0][0], p[3][0]), hi = Math.max(p[0][0], p[3][0]);
        assert.ok(p[1][0] >= lo - 0.2 && p[2][0] <= hi + 0.2 && p[2][0] >= lo - 0.2, `line ${li} stays in the column span`);
        assert.ok(p[3][1] > p[2][1] && Math.abs(p[3][0] - p[2][0]) < 0.11, `line ${li} enters from the top`);
      }
      if (p.length === 6 && width < 640) {
        assert.ok(Math.abs(p[0][0] - p[1][0]) < 0.11 && p[1][1] > p[0][1] - 0.01, `line ${li} exits down from the source`);
        assert.ok(Math.abs(p[1][1] - p[2][1]) < 0.11, `line ${li} jogs sideways in the source gutter`);
        assert.ok(Math.abs(p[2][0] - p[3][0]) < 0.11, `line ${li} runs in a side lane`);
        assert.ok(Math.abs(p[3][1] - p[4][1]) < 0.11, `line ${li} re-enters in the target gutter`);
        assert.ok(p[5][1] > p[4][1] - 0.01 && Math.abs(p[5][0] - p[4][0]) < 0.11, `line ${li} enters from the top`);
      }
      if (width < 640) {
        const a = p[p.length - 2], b = p[p.length - 1];
        assert.ok(b[1] > a[1] - 0.01 && Math.abs(b[0] - a[0]) < 0.11, `line ${li} last segment points down`);
      }
      const h = pts(heads[li].getAttribute("d").replace(" Z", ""));
      const base = [(h[1][0] + h[2][0]) / 2, (h[1][1] + h[2][1]) / 2];
      const end = p[p.length - 1];
      assert.ok(Math.hypot(end[0] - base[0], end[1] - base[1]) < 1, "line ends at the head's base");
      const w = Number(line.getAttribute("stroke-width")), hl = Math.hypot(h[0][0] - base[0], h[0][1] - base[1]);
      assert.ok(hl <= Math.max(6.5, w * 2.6) + 0.2 && hl >= 3, "head sized to the stroke, or shortened to fit a tight row");
    }
    if (width < 640) {
      const dim = (css, k) => Number((css.match(new RegExp(k + ":([\\d.]+)px")) || [])[1]);
      const gridBox = out.all((n) => n.className === "fg")[0];
      const gridW = Number.parseFloat(gridBox?.style.width) || dim(gridBox?.style.cssText || "", "width");
      const boxR = pills.map((pill) => {
        const css = pill.style.cssText || "";
        return { x: dim(css, "left"), y: dim(css, "top"), w: dim(css, "width"), h: dim(css, "height"), label: gno(pill) };
      }).filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && b.w && b.h);
      const hits = (a, b, box) => {
        const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
        const bx1 = box.x + 0.6, by1 = box.y + 0.6, bx2 = box.x + box.w - 0.6, by2 = box.y + box.h - 0.6;
        const near = (x, y) => (Math.abs(x - (box.x + box.w / 2)) < box.w / 2 + 1 && (Math.abs(y - box.y) < 2 || Math.abs(y - (box.y + box.h)) < 2));
        if (near(x1, y1) || near(x2, y2)) return false;
        if (Math.abs(x1 - x2) < 0.11) return x1 > bx1 && x1 < bx2 && Math.max(y1, y2) > by1 && Math.min(y1, y2) < by2;
        if (Math.abs(y1 - y2) < 0.11) return y1 > by1 && y1 < by2 && Math.max(x1, x2) > bx1 && Math.min(x1, x2) < bx2;
        return false;
      };
      for (const [li, line] of lines.entries()) {
        const p = pts(line.getAttribute("d"));
        for (let k = 1; k < p.length; k++) {
          const hit = boxR.filter((box) => hits(p[k - 1], p[k], box)).map((b) => b.label);
          assert.deepEqual(hit, [], `line ${li} segment ${k} must not pass through a box (${hit.join(", ")})`);
        }
        const xs = p.map((pt) => pt[0]);
        assert.ok(Math.min(...xs) >= -0.5 && Math.max(...xs) <= gridW + 0.5, `line ${li} stays inside the card`);
      }
    }
    const fins = out.all((n) => /\bfin\b/.test(n.className)).map((n) => n.textContent).sort();
    assert.deepEqual(fins, ["2nd", "3rd", "4th", "5th", "5th"], "finishes just the place, inside the boxes");
    // Place is a corner label; the game number stays first / centered.
    const withPlace = pills.find((p) => p.all((n) => /\bfin\b/.test(n.className)).length);
    if (width < 640 && withPlace) {
      const first = withPlace.childNodes.find((n) => !/\bbgstar\b/.test(n.className)) || withPlace.childNodes[0];
      const fin = withPlace.all((n) => /\bfin\b/.test(n.className))[0];
      assert.ok(/\bgno\b/.test(first.className), "game number stays centered; place is not inline beside it");
      assert.ok(fin && /\bfin\b/.test(fin.className), "place is still inside the box");
    }
    const head = out.all((n) => /\bfg-head\b/.test(n.className))[0];
    assert.ok(head && /One Hit Wonders/.test(head.textContent) && /Coed Rec/.test(head.textContent), "team and division in the sticky head");
    assert.match(head.textContent, /Win/, "Win / Loss key sits on the team row");
    assert.ok(head.all((n) => /\bfg-key\b/.test(n.className) && /\bfg-top\b/.test((n.parent && n.parent.className) || "")).length || head.all((n) => /\bfg-top\b/.test(n.className)).length, "team and key share the top row");
    if (width < 640) assert.match(head.textContent, /Pioneer/, "phone: field names pinned in the head");
    assert.ok(!/still possible|their finish|Played/.test(out.textContent));
  }
  assert.match(GRID_CSS, /\.fg-head \{ position: sticky; top: 0;/);
  assert.match(GRID_CSS, /\.fg-head\.v \{ padding-bottom: 0; \}/);
  // The wide hour grid must scroll inside .fg-scroll, not stretch the page.
  assert.match(GRID_CSS, /\.fg-outer \{ min-width: 0; max-width: 100%; \}/);
  assert.match(GRID_CSS, /\.fg-scroll \{[^}]*min-width: 0; max-width: 100%/);
  assert.ok(!/Played/.test(GRID_JS.slice(GRID_JS.indexOf("function keyEl"))), "key: Win, Loss, Times only");
  const view = readFileSync(new URL("../components/PathView.js", import.meta.url), "utf8");
  assert.ok(!/still possible|Pick your team/.test(view), "no count or hint text above the grid");
  assert.match(view, /:host \{ display: block; min-width: 0; max-width: 100%;/);
  assert.match(view, /\.pv \{ display: grid; gap: 0\.625rem; min-width: 0; width: 100%; \}/);
});


function recGames(patch = {}) {
  return rec.map((g) => (patch[g.id] ? { ...g, ...patch[g.id] } : { ...g }));
}

function drawTeam(games, team, width = 390) {
  const tnm = {
    ...TOURNAMENT,
    divisions: TOURNAMENT.divisions.map((d) => (d.id === "rec" ? { ...d, games } : d)),
  };
  const rows = scheduleRowsFromTournament(tnm);
  const { grid, index } = fieldGrid(rows, "America/Los_Angeles", new Date("2026-11-15T19:30:00Z"), { siteUrl: "https://x", slug: tnm.slug });
  const tr = gridTrack(rows, team, new Set(["rec"]), null, index);
  const mine = new Set([...tr.played, ...tr.reach]);
  const days = grid.days.filter((d) => d.games.some((g) => mine.has(g.i)));
  const t = { grid: { ...grid, days: days.length ? days : grid.days, zone: "PST" }, picker: [{ name: team, ...tr }] };
  const dom = fakeDom();
  const run = new Function("document", "window", "setTimeout", `${CARD_JS}\n${SITE_SHIM}\n${GRID_JS}\nreturn { gridEl: gridEl, keyEl: keyEl };`)(dom.document, { innerWidth: width }, () => {});
  return { tr, grid, out: run.gridEl(t, team, { clientWidth: width }) };
}

function edgeStyles(out) {
  const box = {};
  for (const p of out.all((n) => n.tagName === "button" && n.classList.contains("pill"))) {
    const label = p.all((n) => n.className === "gno")[0]?.textContent ?? p.childNodes[0].textContent;
    const s = p.style.cssText;
    const num = (k) => Number((s.match(new RegExp(k + ":(-?[\\d.]+)px")) || [])[1]);
    box[label] = { x: num("left"), y: num("top"), w: num("width"), h: num("height") };
  }
  const near = (pt, port) => {
    let best, d0 = Infinity;
    for (const [n, b] of Object.entries(box)) {
      const q = port === "out" ? [b.x + b.w / 2, b.y + b.h] : [b.x + b.w / 2, b.y];
      const d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
      if (d < d0) { d0 = d; best = n; }
    }
    return best;
  };
  const pts = (d) => d.replace(/^M/, "").replace(/ Z$/, "").split(/ L/).map((x) => x.trim().split(/\s+/).map(Number));
  const lines = out.all((n) => n.tagName === "path" && n.getAttribute("fill") === "none");
  const heads = out.all((n) => n.tagName === "path" && n.getAttribute("class") === "head");
  const edges = {};
  lines.forEach((line, i) => {
    const p = pts(line.getAttribute("d"));
    const tip = heads[i] ? pts(heads[i].getAttribute("d"))[0] : p[p.length - 1];
    const from = near(p[0], "out");
    const to = near(tip, "in");
    edges[`${from}>${to}`] = {
      width: Number(line.getAttribute("stroke-width")),
      dash: line.getAttribute("stroke-dasharray") || "",
      color: line.getAttribute("stroke"),
      opacity: Number(line.getAttribute("opacity")),
    };
  });
  return edges;
}

function assertLight(e, msg) {
  assert.equal(e?.width, 1.25, msg);
  assert.equal(e?.opacity, 0.55, msg);
}

function assertBoldWin(e, msg) {
  assert.equal(e?.width, 4, msg);
  assert.equal(e?.opacity, 1, msg);
  assert.equal(e?.color, "var(--win)", msg);
  assert.equal(e?.dash, "", msg);
}

function assertBoldLoss(e, msg) {
  assert.equal(e?.width, 4, msg);
  assert.equal(e?.opacity, 1, msg);
  assert.equal(e?.color, "var(--lose)", msg);
  assert.equal(e?.dash, "5 3", msg);
}

test("Path lines: 0 games played — every win-out leg is a thin light green line", () => {
  const none = recGames({
    g1: { status: "pending", team1_score: null, team2_score: null, winner_slot: null },
    g2: { status: "pending", team1_score: null, team2_score: null, winner_slot: null },
  });
  const { tr, grid, out } = drawTeam(none, "One Hit Wonders");
  assert.deepEqual(names(grid, tr.played), []);
  assert.deepEqual(tr.went, []);
  const e = edgeStyles(out);
  assertLight(e["G1>G3"], "G1→G3 undecided win-out");
  assertLight(e["G3>G9"], "G3→G9 undecided win-out");
  assertLight(e["G9>G12"], "G9→G12 undecided win-out");
  assert.equal(e["G1>G3"].color, "var(--win)");
  assert.equal(e["G1>G3"].dash, "");
  assert.ok(Object.values(e).every((x) => x.width === 1.25), "no leg is bold before a score");
  assert.equal(e["G1~>G6"]?.dash ?? e[Object.keys(e).find((k) => k.startsWith("G1") && e[k].color === "var(--lose)")]?.dash, "5 3");
});

test("Path lines: 1 win played — only the traveled win is bold; later win-out stays light", () => {
  const { tr, grid, out } = drawTeam(recGames(), "One Hit Wonders");
  assert.deepEqual(names(grid, tr.played), ["G1"]);
  assert.deepEqual(arrows(grid, tr.went), ["G1>G3"]);
  const e = edgeStyles(out);
  assertBoldWin(e["G1>G3"], "traveled G1→G3 win");
  assertLight(e["G3>G9"], "future G3→G9 stays light");
  assertLight(e["G9>G12"], "future G9→G12 stays light");
  assert.equal(e["G3>G9"].color, "var(--win)");
  const loss = Object.entries(e).find(([, x]) => x.color === "var(--lose)" && x.dash === "5 3");
  assert.ok(loss, "undecided loss legs stay red dashed");
  assert.equal(loss[1].width, 1.25);
});

test("Path lines: a win then a loss — traveled win bold green, traveled loss bold red dashed, the rest light", () => {
  const games = recGames({
    g2: { status: "pending", team1_score: null, team2_score: null, winner_slot: null },
    g3: { status: "final", team1_score: 4, team2_score: 10, winner_slot: "team2", team1_name: "One Hit Wonders", team2_name: "Only Bangers" },
    g5: { team2_name: "One Hit Wonders" },
  });
  const { tr, grid, out } = drawTeam(games, "One Hit Wonders");
  assert.deepEqual(names(grid, tr.played), ["G1", "G3"]);
  assert.deepEqual(arrows(grid, tr.went), ["G1>G3", "G3~>G5"]);
  const e = edgeStyles(out);
  assertBoldWin(e["G1>G3"], "traveled win G1→G3");
  assertBoldLoss(e["G3>G5"], "traveled loss G3→G5");
  const future = Object.entries(e).filter(([k]) => k !== "G1>G3" && k !== "G3>G5");
  assert.ok(future.length > 0, "future legs remain");
  for (const [k, x] of future) {
    assert.equal(x.width, 1.25, `${k} stays thin`);
    assert.equal(x.opacity, 0.55, `${k} stays light`);
  }
});

function pillNamed(out, label) {
  return out.all((n) => n.tagName === "button" && n.classList.contains("pill") && (n.all((c) => c.className === "gno")[0]?.textContent === label || n.childNodes[0]?.textContent === label))[0];
}

test("Path view: a picked team's scored box gets won-box or lost-box, unplayed boxes do not", () => {
  const win = drawTeam(recGames(), "One Hit Wonders");
  const g1 = pillNamed(win.out, "G1");
  assert.ok(g1.classList.contains("won-box"), "G1 is a win for One Hit Wonders");
  assert.ok(g1.classList.contains("done"));
  assert.ok(g1.classList.contains("compact"));
  assert.match(g1.textContent, /12/, "score is shown");
  assert.ok(!g1.classList.contains("lost-box"));
  const g1bits = g1.childNodes.map((n) => [n.className, n.textContent]);
  assert.deepEqual(g1bits.map((x) => x[0]), ["gno", "scr"], "scored box is the number over the score: 'G1' over '12-5'");
  const g3 = pillNamed(win.out, "G3");
  assert.ok(g3 && g3.classList.contains("route") && !g3.classList.contains("won-box") && !g3.classList.contains("lost-box") && !g3.classList.contains("done"), "unplayed win-path G3 is a route box (green outline, no scored fill)");

  const games = recGames({
    g2: { status: "pending", team1_score: null, team2_score: null, winner_slot: null },
    g3: { status: "final", team1_score: 4, team2_score: 10, winner_slot: "team2", team1_name: "One Hit Wonders", team2_name: "Only Bangers" },
    g5: { team2_name: "One Hit Wonders" },
  });
  const both = drawTeam(games, "One Hit Wonders");
  assert.ok(pillNamed(both.out, "G1").classList.contains("won-box"));
  const lost = pillNamed(both.out, "G3");
  assert.ok(lost.classList.contains("lost-box"), "G3 is a loss");
  assert.ok(!lost.classList.contains("won-box"));
  assert.match(lost.textContent, /10/, "score is shown on a loss");
  const next = pillNamed(both.out, "G5");
  assert.ok(next && next.classList.contains("route") && !next.classList.contains("won-box") && !next.classList.contains("lost-box"), "after a loss, the remaining win-out from G5 is still a win-path route box");

  const none = drawTeam(recGames({
    g1: { status: "pending", team1_score: null, team2_score: null, winner_slot: null },
    g2: { status: "pending", team1_score: null, team2_score: null, winner_slot: null },
  }), "One Hit Wonders");
  for (const label of ["G1", "G3", "G9", "G12"]) {
    const p = pillNamed(none.out, label);
    assert.ok(p.classList.contains("route"), `${label} is on the unplayed win path`);
    assert.ok(!p.classList.contains("won-box") && !p.classList.contains("lost-box"));
  }
  assert.ok(pillNamed(none.out, "G12").classList.contains("final"), "the championship stays a final, now in the green family");
  const starOf = (label) => (pillNamed(none.out, label)?.all((n) => n.tagName === "svg" && /\bbgstar\b/.test(n.className)) || [])[0];
  const g12star = starOf("G12");
  const g13star = starOf("G13");
  assert.ok(g12star, "the championship box (G12) gets the faint gold star watermark");
  assert.ok(g13star, "the if-necessary box (G13) gets the same star, as on the Timeline");
  assert.equal(g12star.getAttribute("viewBox"), "0 0 20 20");
  assert.equal(g12star.childNodes[0]?.getAttribute("d"), "M10 1.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L10 15l-5.38 2.85 1.03-6L1.3 7.6l6-.9z");
  assert.ok(!starOf("G1") && !starOf("G3") && !starOf("G5"), "non-championship boxes do not get the star");
  const first = pillNamed(none.out, "G1");
  assert.ok(first.classList.contains("next") && first.classList.contains("route"), "the current next game is the highlighted route box");
  assert.ok(!pillNamed(none.out, "G3").classList.contains("next") && !pillNamed(none.out, "G12").classList.contains("next"), "later win-path boxes, including the championship, are not the current game");
  const lossBox = pillNamed(none.out, "G5") || pillNamed(none.out, "G11");
  if (lossBox) assert.ok(!lossBox.classList.contains("route"), "a loss-path box is not given the win-path style");

  assert.match(GRID_CSS, /button\.pill\.done\.won-box, button\.pill\.won-box \{[^}]*background: var\(--win\);[^}]*color: #fff;/);
  assert.match(GRID_CSS, /button\.pill\.done\.lost-box, button\.pill\.lost-box \{[^}]*background: var\(--lose\);[^}]*color: #fff;/);
  assert.match(GRID_CSS, /button\.pill\.route \{[^}]*background: transparent;[^}]*color: var\(--win\)/);
  assert.match(GRID_CSS, /button\.pill\.route \{[^}]*border: 1px solid var\(--win\);[^}]*font-weight: 450/);
  assert.match(GRID_CSS, /button\.pill\.route\.final \{[^}]*background: transparent;[^}]*color: var\(--win\);[^}]*border-color: var\(--win\)/);
  assert.match(GRID_CSS, /button\.pill\.route\.next \{[^}]*background: color-mix\(in srgb, var\(--win\) 18%, #fff\)/);
  assert.match(GRID_CSS, /button\.pill \.bgstar \{[^}]*color: #d4a72c;[^}]*opacity: 0\.2/);
  assert.match(GRID_CSS, /button\.pill\.compact \.bgstar \{ width: 1\.75rem; height: 1\.75rem; \}/);
  assert.match(GRID_JS, /M10 1\.2l2\.7 5\.5 6 \.9-4\.35 4\.25 1\.03 6L10 15l-5\.38 2\.85 1\.03-6L1\.3 7\.6l6-\.9z/);
  assert.doesNotMatch(GRID_CSS, /button\.pill\.route \{[^}]*2\.5px/);
  assert.doesNotMatch(GRID_CSS, /button\.pill\.route \{[^}]*font-weight: 800/);
  assert.doesNotMatch(GRID_CSS, /button\.pill\.route\.final \{[^}]*#c99a1e/);
});

