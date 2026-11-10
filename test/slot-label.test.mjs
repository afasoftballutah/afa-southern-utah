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
