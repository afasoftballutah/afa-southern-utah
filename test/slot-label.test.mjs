// "instead of TBD can we have Winner GX, Loser GY" (JD, 2026-11-09).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  slotLabel, feedLabel, parseFeed, sourceLabeler, sourceLabelsFor, isWaitingSlot, NO_SOURCE,
} from "../lib/slot-label.js";
import { buildTeamHistory } from "../lib/teams.js";
import { sideLabel, matchupSide } from "../lib/schedule-timeline.js";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a slot shows the team, else Winner G#/Loser G# of its source game, else TBD", () => {
  assert.equal(slotLabel("Fallen", null), "Fallen");
  assert.equal(slotLabel(null, "Winner of Game 9"), "Winner G9");
  assert.equal(slotLabel(null, "Loser of Game 3"), "Loser G3");
  assert.equal(slotLabel("Winner of Game 12", null), "Winner G12"); // hand-built/QS brackets store the words
  assert.equal(slotLabel("loser of g 7", null), "Loser G7");
  assert.equal(slotLabel(null, "W-G4"), "Winner G4");
  assert.equal(slotLabel(null, null), "TBD");
  assert.equal(slotLabel("", "  "), NO_SOURCE);
  assert.equal(slotLabel(null, null, "—"), "—");
  // a real team that merely contains the words is still a team
  assert.equal(slotLabel("Winners Circle", null), "Winners Circle");
  assert.equal(slotLabel("W5", null), "W5");
});

test("short enough for a phone row: at most 'Winner G40'", () => {
  for (let n = 1; n <= 40; n++) {
    assert.ok(feedLabel("winner", n).length <= 10);
    assert.ok(feedLabel("loser", n).length <= 9);
  }
  assert.equal(feedLabel("winner", null), null);
  assert.deepEqual(parseFeed("Loser of Game 31"), { result: "loser", game: 31 });
  assert.equal(parseFeed("Bunt Cakes"), null);
  assert.equal(isWaitingSlot(null), true);
  assert.equal(isWaitingSlot("Winner of Game 2"), true);
  assert.equal(isWaitingSlot("HIQI"), false);
});

test("source links → the source game's number, incl. a loser out of a losers game (Coed D 3GG: L12 → G16)", () => {
  const games = [
    { id: "g12", round: 12, team1_name: null, team2_name: null },
    { id: "g11", round: 11, team1_name: null, team2_name: null },
    { id: "g16", round: 16, team1_name: null, team1_source_game_id: "g12", team1_source_result: "loser",
      team2_name: null, team2_source_game_id: "g11", team2_source_result: "winner" },
    { id: "g9", round: 9, team1_name: "Aces Wild", team2_name: null, team2_source_game_id: "gone", team2_source_result: "winner" },
  ];
  const label = sourceLabeler(games);
  assert.deepEqual(sourceLabelsFor(games[2], label), { team1From: "Loser G12", team2From: "Winner G11" });
  // source not in the set → no label → TBD at display
  assert.deepEqual(sourceLabelsFor(games[3], label), { team1From: null, team2From: null });
  assert.equal(slotLabel(games[3].team2_name, null), "TBD");
});

test("team page: an opponent still waiting on a game reads Winner G#, not TBD", () => {
  const division = { id: "coed-d", name: "Coed D", gender: "coed", class_id: null,
    tournaments: { id: "t", name: "Worlds", slug: "2026-afa-world-series" } };
  const bracket = [
    { id: "g1", round: 1, division_id: "coed-d", divisions: division, team1_name: "Toxic Waste", team2_name: "208 MOB", status: "pending" },
    { id: "g9", round: 9, division_id: "coed-d", divisions: division, team1_name: "Aces Wild", team2_name: null,
      team2_source_game_id: "g1", team2_source_result: "winner", status: "pending" },
  ];
  const h = buildTeamHistory("Aces Wild", [], bracket, {}, {});
  const sections = h.sections ?? h;
  const games = JSON.stringify(sections);
  assert.match(games, /"team2From":"Winner G1"/);
  // the club page filters to this team's games first; the source game is
  // only in the full list, which it passes along
  const only = bracket.filter((g) => g.id === "g9");
  assert.doesNotMatch(JSON.stringify(buildTeamHistory("Aces Wild", [], only, {}, {})), /Winner G1/);
  assert.match(JSON.stringify(buildTeamHistory("Aces Wild", [], only, {}, {}, bracket)), /"team2From":"Winner G1"/);
  assert.match(src("lib/team-page.js"), /buildTeamHistory\(ident\.name, pool, bracket, teamStatusByTournament, classNames, bracketGames\)/);
});

test("every list renderer passes the slot's source and renders through the one helper", () => {
  assert.match(src("components/ui/FeedAwareName.js"), /slotLabel\(name, from, fallback\)/);
  assert.match(src("components/ScheduleBrowser.js"), /team1From=\{row\.team1From\}[\s\S]*team2From=\{row\.team2From\}/);
  assert.match(src("components/ui/Matchup.js"), /<FeedAwareName name=\{team1\} from=\{team1From\} \/>/);
  assert.match(src("components/ui/MatchupCard.js"), /<FeedAwareName name=\{name\} from=\{from\} \/>/);
  assert.match(src("components/TeamFinder.js"), /from=\{opponentFrom\}/);
  assert.match(src("app/teams/[slug]/page.js"), /team1From=\{g\.team1From\}/);
  assert.match(src("app/tournaments/[slug]/division/[divisionId]/page.js"), /sourceLabelsFor\(g, ownSource\)/);
  assert.match(src("components/bracket/DrawnBracket.js"), /sourceLabelsFor\(g, labelSource\)/);
  assert.match(src("lib/data.js"), /sourceLabelsFor\(g, sourceLabeler\(byDivision/);
});

test("timeline: TBD only with no source; a fed slot names its game", () => {
  assert.deepEqual(sideLabel({}, 1), { text: "TBD", known: false });
  assert.deepEqual(matchupSide({ team1From: "Loser of Game 2" }, 1), { from: "Loser of", game: "Game 2" });
});

test("schedule page finder: a waiting opponent reads Winner G2 with its day, time and field (Coed E Oddballs)", async () => {
  const { scheduleFinderGames } = await import("../lib/schedule-finder.js");
  const [g] = scheduleFinderGames(
    [{ id: "g6", divisionId: "coed-e", divisionName: "Coed E", scheduledTime: "2026-11-15T01:00:00Z",
       field: "Hunter F2", team1: null, team2: "Oddballs", team1From: "Winner of Game 2", team2From: null,
       timeLabel: "Sat 5 PM PST", isFinal: false }],
    "America/Los_Angeles"
  );
  assert.equal(slotLabel(g.team1, g.team1From), "Winner G2");
  assert.deepEqual(g.whenShort, { day: "Sat", time: "5 PM PST" });
  assert.equal(g.field, "Hunter F2");
  assert.equal(g.when, "2026-11-15T01:00:00Z");
  assert.match(src("app/tournaments/[slug]/schedule/page.js"), /scheduleFinderGames\(rows, timeZone\)/);
});

// JD's rule on the bracket drawings too (2026-11-10): an empty slot reads
// "Winner G5" / "Loser G3" — not the paper shorthand [W5] / [L3] / W5, an
// em-dash, or TBD — wherever a source game is known.
test("bracket drawings: paper shorthand becomes Winner G / Loser G words", async () => {
  const { paperFeedWords } = await import("../lib/slot-label.js");
  assert.equal(paperFeedWords("W5"), "Winner G5");
  assert.equal(paperFeedWords("L12"), "Loser G12");
  for (const keep of ["Oddballs", "—", "awaiting team", "W-G9", "Loser of Game 2"]) {
    assert.equal(paperFeedWords(keep), keep);
  }
});

const eng = (id, side, round, slot, extra = {}) => ({
  id, bracket_side: side, round, slot, status: "pending", is_bye: false,
  team1_name: null, team2_name: null, team1_source_game_id: null, team2_source_game_id: null,
  team1_source_result: null, team2_source_result: null, ...extra,
});
const feed = (s1, r1, s2, r2) => ({
  team1_source_game_id: s1, team1_source_result: r1, team2_source_game_id: s2, team2_source_result: r2,
});
// Engine double-elim: `round` is the structure round (two games share
// round 1), so the printed numbers come from the tree: w1 G1, w2 G2, w3 G3,
// l1 G4, l2 G5, f1 G6. The losers' first game is G4, not "G1".
const engine = [
  eng("w1", "winners", 1, 1, { team1_name: "A", team2_name: "B" }),
  eng("w2", "winners", 1, 2, { team1_name: "C", team2_name: "D" }),
  eng("w3", "winners", 2, 1, feed("w1", "winner", "w2", "winner")),
  eng("l1", "losers", 1, 1, feed("w1", "loser", "w2", "loser")),
  eng("l2", "losers", 2, 1, feed("l1", "winner", "w3", "loser")),
  eng("f1", "final", 1, 1, feed("w3", "winner", "l2", "winner")),
];

test("tree and list view: slotWords names the printed game (engine bracket)", async () => {
  const { assignGameNumbers, slotWords } = await import("../lib/bracket/tree.js");
  const nums = assignGameNumbers(engine);
  const byId = new Map(engine.map((g) => [g.id, g]));
  const words = (id, side) => slotWords(byId.get(id), side, nums, byId).text;
  assert.equal(words("l1", "team1"), "Loser G1");
  assert.equal(words("l2", "team1"), "Winner G4");
  assert.equal(words("l2", "team2"), "Loser G3");
  assert.equal(words("f1", "team2"), "Winner G5");
  assert.equal(words("w1", "team1"), "A"); // real names untouched
  const unfed = eng("x", "winners", 3, 1);
  assert.equal(slotWords(unfed, "team1", nums, byId).text, "—"); // nothing feeds it
});

test("scorekeeper tables: feedSlotLabeler uses printed numbers for both bracket kinds", async () => {
  const { feedSlotLabeler } = await import("../lib/bracket/for-drawn-bracket.js");
  const engineLabel = feedSlotLabeler(engine);
  assert.equal(engineLabel("l1", "winner"), "Winner G4");
  assert.equal(engineLabel("w3", "loser"), "Loser G3");
  assert.equal(engineLabel("missing", "winner"), null);
  assert.equal(engineLabel(null, "winner"), null);
  // Hand-built / 3GG: `round` is already the paper number (Worlds Coed Rec).
  const paper = [
    eng("g1", "winners", 1, 1, { team1_name: "One Hit Wonders", team2_name: "Fallen Angels" }),
    eng("g4", "winners", 4, 1, { team1_name: "Band of Randoms" }),
    eng("g6", "losers", 6, 1, feed("g1", "loser", "g4", "loser")),
  ];
  const paperLabel = feedSlotLabeler(paper);
  assert.equal(paperLabel("g1", "loser"), "Loser G1");
  assert.equal(paperLabel("g4", "loser"), "Loser G4");
});

test("every bracket surface uses the shared words, not [L5] / W5 / em-dash / TBD", () => {
  const matchup = src("components/bracket/BracketMatchup.js");
  assert.match(matchup, /label: feedLabel\(feedNum\[1\]\.toLowerCase\(\), feedNum\[2\]\)/);
  assert.doesNotMatch(matchup, /tag: `\$\{kind\}\$\{feedNum\[2\]\}`/);
  const canvas = src("components/bracket/TreeCanvas.js");
  assert.doesNotMatch(canvas, /slotDisplay\(/);
  assert.match(canvas, /slotWords\(game, "team1"/);
  assert.match(canvas, /`Loser G\$\{paperNum\} → survivor pool`/);
  assert.match(src("components/bracket/ListView.js"), /slotWords\(g, side, numberByGameId, gamesById\)/);
  const table = src("components/scorekeeper/ScoreTable.js");
  assert.match(table, /feedSlotLabeler\(list\)/);
  assert.doesNotMatch(table, /team[12]_name \|\| "TBD"/);
  assert.match(src("app/director/division/[divisionId]/page.js"), /umpireFrom\(g\.team1_source_game_id/);
});
