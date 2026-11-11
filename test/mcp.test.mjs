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
// get_team_path draws the team's next game card and its paths to the title.
test("get_team_path view: ui://afa/team is self-contained; text unchanged", async () => {
  const { c } = await client();
  const { contents } = await c.readResource({ uri: "ui://afa/team" });
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.equal(contents[0]._meta.ui.csp, undefined);
  assert.doesNotMatch(contents[0].text, /<script[^>]+src=|<link[^>]+href=|@import|url\(|fetch\(|XMLHttpRequest|innerHTML/i);
  assert.match(contents[0].text, /Paths to the title/);
  const r = await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } });
  const { view, ...answer } = r.structuredContent;
  assert.equal(r.content[0].text, JSON.stringify(answer), "text clients read exactly what they read before");
  assert.equal(view.paths, false);
  const withPaths = await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec", paths: true } });
  assert.equal(withPaths.content[0].text, r.content[0].text, "paths only opens the card");
  assert.equal(withPaths.structuredContent.view.paths, true);
  for (const secret of ["director@example.com", "435-555-0100", "Director Person"]) assert.ok(!JSON.stringify(r.structuredContent).includes(secret), secret);
});

const route = (rt) => rt.steps.map((s) => `${s.title.replace("Game ", "G")} ${s.board.map((x) => (x.us ? "*" : "") + (x.team ?? `${x.from} ${x.game}`) + (x.via ? ` (${x.via})` : "")).join(" v ")}`);

test("get_team_path view: undefeated route and the route after a loss follow the bracket, Winner/Loser linked", async () => {
  const { c } = await client();
  const t = (await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "One Hit Wonders", division: "Coed Rec" } })).structuredContent.view.teams[0];
  assert.deepEqual([t.team, t.division, t.record], ["One Hit Wonders", "Coed Rec", "1-0"]);
  assert.deepEqual(t.tone, { bg: "#eadbd0", ink: "#5a2e14", solid: "#6b3a1f" });
  assert.equal(t.next.title, "Game 3");
  assert.equal(t.next.time, "Sat 7 PM PST");
  assert.deepEqual(t.next.board.map((b) => [b.team, Boolean(b.us)]), [["One Hit Wonders", true], ["Only Bangers", false]]);
  assert.deepEqual(t.played, [{ result: "Won", score: "12–8", opponent: "Fallen Angels", title: "Game 1" }]);
  const [win, loss] = t.routes;
  assert.equal(win.title, "Undefeated route");
  assert.deepEqual(route(win), ["G3 *One Hit Wonders v Only Bangers", "G9 *One Hit Wonders (Winner G3) v Winner G4", "G12 *One Hit Wonders (Winner G9) v Winner G11"]);
  assert.deepEqual(win.steps[0].loser, { next: "Game 5", where: "Sun 11 AM \u00b7 Pioneer F2" }, "red line: where a loss goes, day time field");
  assert.deepEqual(win.steps[2].loser, { next: "Game 13", where: "Sun 5 PM \u00b7 Pioneer F2" }, "undefeated: losing the final forces the if-necessary game");
  assert.deepEqual(win.steps[2].winner, { champion: true });
  assert.deepEqual(win.span, ["Sat 7 PM PST", "Sun 4 PM PST"]);
  assert.equal(loss.title, "After losing Game 3");
  assert.deepEqual(route(loss), [
    "G5 FHT v *One Hit Wonders (Loser G3)",
    "G7 *One Hit Wonders (Winner G5) v Loser G6",
    "G10 *One Hit Wonders (Winner G7) v Winner G8",
    "G11 Loser G9 v *One Hit Wonders (Winner G10)",
    "G12 Winner G9 v *One Hit Wonders (Winner G11)",
    "G13 *One Hit Wonders (Winner G12) v Loser G12",
  ]);
  assert.deepEqual(loss.steps[4].winner, { next: "Game 13", where: "Sun 5 PM \u00b7 Pioneer F2" }, "from the losers side a final win forces Game 13");
  assert.match(loss.steps[5].flag, /Only played if One Hit Wonders wins Game 12/);
  for (const s of [...win.steps, ...loss.steps]) assert.doesNotMatch(`${s.time} ${s.loser?.where ?? ""} ${s.winner?.where ?? ""}`, /:00/);

  const fa = (await c.callTool({ name: "get_team_path", arguments: { slug: TOURNAMENT.slug, team: "Fallen Angels", division: "Coed Rec" } })).structuredContent.view.teams[0];
  assert.equal(fa.record, "0-1");
  assert.equal(fa.routes[0].title, "Win out", "already has a loss: no undefeated route");
  assert.equal(route(fa.routes[0]).at(-1), "G13 *Fallen Angels (Winner G12) v Loser G12");
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
