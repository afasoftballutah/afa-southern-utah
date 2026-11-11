import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bothTeamsReady,
  scorekeeperFieldName,
  scorekeeperFieldAbbrev,
  gameNumber,
  scorekeeperWhen,
  scorekeeperWhenPill,
  scorekeeperWhenMark,
  scorekeeperMarkLine,
  scorekeeperDivisionAbbrev,
  scorekeeperToneNeedsDarkInk,
  buildScorekeeperCatalog,
  scorekeeperFieldOptions,
  scorekeeperDayOptions,
  filterScorekeeperCatalog,
  firstOpenIndex,
  defaultDayKey,
  fieldStorageKey,
} from "@/lib/scorekeeper-list";
import { fieldDisplayName } from "@/lib/schedule-timeline";

const TZ = "America/Los_Angeles";
const thu2 = "2026-11-12T22:00:00.000Z"; // Thu 2 PM PST
const thu3 = "2026-11-12T23:00:00.000Z";
const fri9 = "2026-11-13T17:00:00.000Z";
const fri930 = "2026-11-13T17:30:00.000Z";

function game(id, round, field, time, t1, t2, extra = {}) {
  return {
    id,
    status: extra.status ?? "pending",
    is_bye: extra.is_bye ?? false,
    round,
    scheduled_time: time,
    field,
    team1_name: t1,
    team2_name: t2,
    team1_score: extra.team1_score ?? null,
    team2_score: extra.team2_score ?? null,
    team1_source_game_id: extra.t1src ?? null,
    team2_source_game_id: extra.t2src ?? null,
    team1_source_result: extra.t1res ?? null,
    team2_source_result: extra.t2res ?? null,
  };
}

const divisions = [
  {
    id: "mens-d",
    name: "Men's D",
    display_name: "Men's D",
    pool_games: [],
    games: [
      game("md1", 1, "Hunter F1", thu2, "Banana Slugs", "Vice", {
        status: "final",
        team1_score: 13,
        team2_score: 7,
      }),
      game("md2", 2, "Pioneer F1", thu2, "Ragin Rhinos", "Phat Kids"),
      game("md9", 9, "Hunter F2", thu3, "Banana Slugs", "Phat Kids"),
      game("md15", 15, "Hunter F1", fri9, "Banana Slugs", "Winner of Game 9", {
        t2src: "md9",
        t2res: "winner",
      }),
      game("md-bye", 99, "Hunter F1", fri9, "Bye team", "Nobody", { is_bye: true }),
    ],
  },
  {
    id: "womens-rec",
    name: "Women's Rec",
    display_name: "Women's Rec",
    pool_games: [],
    games: [
      game("wr49", 49, "Pioneer F2", thu3, "Oddballs", "Fallen Angels"),
      game("wr50", 50, "Pioneer F3", fri9, "Winner of Game 48", "Winner of Game 49", {
        t1src: "wr48",
        t1res: "winner",
        t2src: "wr49",
        t2res: "winner",
      }),
      game("wr55", 55, "P2", fri930, "Del Fuegos", "Band of Randoms"),
    ],
  },
];

test("bothTeamsReady is false for empty or Winner/Loser G# slots", () => {
  assert.equal(bothTeamsReady(game("a", 1, "Hunter F1", thu2, "Oddballs", "Fallen")), true);
  assert.equal(bothTeamsReady(game("b", 1, "Hunter F1", thu2, "Oddballs", "Winner of Game 9")), false);
  assert.equal(bothTeamsReady(game("c", 1, "Hunter F1", thu2, "Loser G7", "Alley Cats")), false);
  assert.equal(bothTeamsReady(game("d", 1, "Hunter F1", thu2, "Oddballs", null)), false);
  assert.equal(bothTeamsReady(game("e", 1, "Hunter F1", thu2, "Winner G48", "Winner G49")), false);
});

test("scorekeeperFieldName uses Timeline spelling and does not guess a park", () => {
  assert.equal(scorekeeperFieldName("Hunter F1"), "Hunter F1");
  assert.equal(scorekeeperFieldName("Pioneer F2"), "Pioneer F2");
  assert.equal(scorekeeperFieldName("H2"), "Hunter F2");
  assert.equal(scorekeeperFieldName("P 3"), "Pioneer F3");
  assert.equal(scorekeeperFieldName("pf1"), "Pioneer F1");
  // Bare numbers / "F2" have no park in the data — do not invent Hunter or Pioneer.
  assert.equal(scorekeeperFieldName("F2"), "F2");
  assert.equal(scorekeeperFieldName("Field 4"), "Field 4");
  assert.equal(scorekeeperFieldName("2"), "2");
  assert.equal(scorekeeperFieldName(""), null);
  assert.equal(scorekeeperFieldName("H2"), fieldDisplayName("H2"));
});

test("scorekeeperFieldAbbrev is the park's first letter plus the number", () => {
  assert.equal(scorekeeperFieldAbbrev("Hunter F1"), "H1");
  assert.equal(scorekeeperFieldAbbrev("Pioneer F2"), "P2");
  assert.equal(scorekeeperFieldAbbrev("H3"), "H3");
  assert.equal(scorekeeperFieldAbbrev("P 1"), "P1");
  assert.equal(scorekeeperFieldAbbrev("Hunter Field 2"), "H2");
  // No park in the data — do not invent H or P.
  assert.equal(scorekeeperFieldAbbrev("F2"), "F2");
  assert.equal(scorekeeperFieldAbbrev("Field 4"), "Field 4");
  assert.equal(scorekeeperFieldAbbrev(""), null);
});

test("scorekeeperWhen drops :00 and labels Worlds times PST", () => {
  assert.equal(scorekeeperWhen(thu2, TZ), "Thu 2 PM PST");
  assert.equal(scorekeeperWhen(fri930, TZ), "Fri 9:30 AM PST");
  assert.equal(scorekeeperWhen(null, TZ), "");
});

test("scorekeeperWhenPill drops :00 and leaves the zone off the pill", () => {
  assert.equal(scorekeeperWhenPill(thu2, TZ), "Thu 2 PM");
  assert.equal(scorekeeperWhenPill(fri930, TZ), "Fri 9:30 AM");
  assert.equal(scorekeeperWhenPill(null, TZ), "");
});

test("scorekeeperDivisionAbbrev is gender plus class, two letters", () => {
  assert.equal(scorekeeperDivisionAbbrev("Men's D"), "MD");
  assert.equal(scorekeeperDivisionAbbrev("Men's E"), "ME");
  assert.equal(scorekeeperDivisionAbbrev("Men's Rec"), "MR");
  assert.equal(scorekeeperDivisionAbbrev("Men's Open"), "MO");
  assert.equal(scorekeeperDivisionAbbrev("Women's D"), "WD");
  assert.equal(scorekeeperDivisionAbbrev("Women's E"), "WE");
  assert.equal(scorekeeperDivisionAbbrev("Women's Rec"), "WR");
  assert.equal(scorekeeperDivisionAbbrev("Coed D"), "CD");
  assert.equal(scorekeeperDivisionAbbrev("Coed E"), "CE");
  assert.equal(scorekeeperDivisionAbbrev("Coed Rec"), "CR");
  assert.equal(scorekeeperDivisionAbbrev("Coed Open"), "CO");
  assert.equal(scorekeeperDivisionAbbrev(""), null);
  // Gold Men's Rec solid is too light for white letters.
  assert.equal(scorekeeperToneNeedsDarkInk("mens-rec"), true);
  assert.equal(scorekeeperToneNeedsDarkInk("mens-d"), false);
  assert.equal(scorekeeperToneNeedsDarkInk("coed-rec"), false);
});

test("scorekeeperWhenMark is 2-letter day, 12-hour clock with A/P, no :00", () => {
  assert.deepEqual(scorekeeperWhenMark(thu2, TZ), {
    label: "Th 2P",
    day: "Th",
    clock: "2P",
    hasMinutes: false,
  });
  assert.deepEqual(scorekeeperWhenMark(fri930, TZ), {
    label: "Fr 9:30A",
    day: "Fr",
    clock: "9:30A",
    hasMinutes: true,
  });
  const thu1030 = "2026-11-12T18:30:00.000Z";
  assert.equal(scorekeeperWhenMark(thu1030, TZ).label, "Th 10:30A");
  assert.equal(scorekeeperWhenMark(thu3, TZ).label, "Th 3P");
  assert.ok(!String(scorekeeperWhenMark(thu2, TZ).clock).includes(":00"));
  assert.equal(scorekeeperWhenMark(null, TZ), null);
  assert.equal(scorekeeperMarkLine(scorekeeperWhenMark(thu3, TZ), "H1"), "Th 3P · H1");
  assert.equal(scorekeeperMarkLine(scorekeeperWhenMark(thu1030, TZ), "P2"), "Th 10:30A · P2");
  assert.equal(scorekeeperMarkLine(null, null), "—");
});

test("catalog is one time-sorted list, hides waiting/byes, keeps both parks' F1", () => {
  const catalog = buildScorekeeperCatalog(divisions, TZ);
  assert.deepEqual(
    catalog.map((r) => r.id),
    ["md1", "md2", "md9", "wr49", "wr55"]
  );
  assert.ok(!catalog.some((r) => r.id === "md15" || r.id === "wr50" || r.id === "md-bye"));
  assert.deepEqual(
    catalog.map((r) => r.sortKey),
    [...catalog.map((r) => r.sortKey)].sort()
  );
  assert.equal(catalog[0].fieldName, "Hunter F1");
  assert.equal(catalog[0].fieldAbbrev, "H1");
  assert.equal(catalog[0].divisionAbbrev, "MD");
  assert.equal(catalog.find((r) => r.id === "wr49").divisionAbbrev, "WR");
  assert.equal(catalog[0].whenMark.label, "Th 2P");
  assert.equal(catalog[0].markLine, "Th 2P · H1");
  assert.equal(catalog[1].fieldName, "Pioneer F1");
  assert.equal(catalog.find((r) => r.id === "wr55").fieldName, "Pioneer F2");
  assert.equal(catalog.find((r) => r.id === "wr49").tone, "womens-rec");
  assert.equal(catalog.find((r) => r.id === "md1").tone, "mens-d");
  assert.equal(catalog.find((r) => r.id === "md1").scored, true);
  assert.equal(catalog.find((r) => r.id === "md1").open, false);
  assert.equal(catalog.find((r) => r.id === "wr49").open, true);
  assert.equal(gameNumber(catalog.find((r) => r.id === "wr49").game, "bracket"), 49);
});

test("field options keep Hunter F1 and Pioneer F1 separate, in park order", () => {
  const fields = scorekeeperFieldOptions(buildScorekeeperCatalog(divisions, TZ));
  assert.deepEqual(
    fields.map((f) => f.key),
    ["Hunter F1", "Hunter F2", "Pioneer F1", "Pioneer F2"]
  );
});

test("filter by field and day; default day is the first game that still needs a score", () => {
  const catalog = buildScorekeeperCatalog(divisions, TZ);
  const hunter = filterScorekeeperCatalog(catalog, { field: "Hunter F1" });
  assert.deepEqual(hunter.map((r) => r.id), ["md1"]);
  const days = scorekeeperDayOptions(catalog);
  assert.deepEqual(
    days.map((d) => d.label),
    ["Thu", "Fri"]
  );
  assert.equal(defaultDayKey(catalog), "2026-11-12"); // first open is Thu (md2)
  const thu = filterScorekeeperCatalog(catalog, { day: "2026-11-12" });
  assert.ok(thu.every((r) => r.dayKey === "2026-11-12"));
  assert.ok(thu.some((r) => r.id === "wr49"));
  assert.ok(!thu.some((r) => r.id === "wr55"));
  const rows = filterScorekeeperCatalog(catalog, { field: "Pioneer F2", day: "all" });
  assert.deepEqual(rows.map((r) => r.id), ["wr49", "wr55"]);
  assert.equal(firstOpenIndex(catalog), 1); // md1 is scored, md2 is open
  assert.equal(firstOpenIndex(catalog.filter((r) => r.scored)), -1);
});

test("field storage key is per tournament", () => {
  assert.equal(fieldStorageKey("abc"), "afa-scorekeeper-field:abc");
  assert.equal(fieldStorageKey(), "afa-scorekeeper-field:default");
  assert.equal(
    fieldStorageKey("abc", "division:div-1"),
    "afa-scorekeeper-field:abc:division:div-1"
  );
});

test("ScorekeeperBoard is one list with a colored mark pill and a when/field line, no per-division tables", () => {
  const board = readFileSync(new URL("../components/scorekeeper/ScorekeeperBoard.js", import.meta.url), "utf8");
  assert.match(board, /buildScorekeeperCatalog/);
  assert.match(board, /scorekeeperFieldOptions/);
  assert.match(board, /tl-tone-\$\{/);
  assert.match(board, /sk-mark__pill/);
  assert.match(board, /divisionAbbrev/);
  assert.match(board, /sk-mark__div[\s\S]+sk-mark__num/);
  assert.match(board, /sk-mark__meta/);
  assert.match(board, /sk-mark__when/);
  assert.match(board, /sk-mark__day/);
  assert.match(board, /sk-mark__clock/);
  assert.match(board, /sk-mark__dot/);
  assert.match(board, /sk-mark__field/);
  assert.match(board, /markLine/);
  assert.match(board, /SegmentBar/);
  assert.match(board, /scorekeeperFieldAbbrev/);
  assert.doesNotMatch(board, /sk-mark__tone/);
  assert.doesNotMatch(board, /sk-pill/);
  assert.doesNotMatch(board, /All fields/);
  assert.doesNotMatch(board, /ScoreTable/);
  assert.doesNotMatch(board, /Need score/);
  assert.doesNotMatch(board, /Find a team/);
  // Must not strip a park name down to F1 / F2.
  assert.doesNotMatch(board, /return n \? `F\$\{n\[1\]\}`/);
  // Team 1, then its score, then team 2 — left/right, not stacked names.
  const row = board.slice(board.indexOf("function GameRow"));
  assert.match(row, /sk-game__team1[\s\S]+sk-game__score[\s\S]+sk-game__team2/);
});

test("ScoreEntry confirms both scores and locks a saved row", () => {
  const src = readFileSync(new URL("../components/scorekeeper/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(src, /sk-score__confirm/);
  assert.match(src, /sk-score__tile/);
  assert.match(src, /is-locked/);
  assert.match(src, /sk-score__step/);
  assert.match(src, /inputMode="numeric"/);
  assert.doesNotMatch(src, />Save</);
});

test("games page does not advertise how many still need a score", () => {
  const page = readFileSync(new URL("../app/scorekeeper/games/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(page, /need a score/);
  assert.doesNotMatch(page, /leftCount/);
  assert.match(page, /compact/);
});

test("director division Scores view reuses the scorekeeper board, still director-gated", () => {
  const page = readFileSync(
    new URL("../app/director/division/[divisionId]/page.js", import.meta.url),
    "utf8"
  );
  assert.match(page, /requireDirectorPage/);
  assert.match(page, /ScorekeeperBoard/);
  assert.match(page, /storageScope/);
  assert.match(page, /tournamentZoneLabel/);
  assert.match(page, /sk-zone/);
  assert.match(page, /buildScorekeeperCatalog/);
  assert.match(page, /pool_games: data\.poolGames/);
  assert.doesNotMatch(page, /ScoreTable/);
  // Matchups view and director-only tools stay on this page.
  assert.match(page, /ViewDoors/);
  assert.match(page, /BracketManager/);
  assert.match(page, /GameUmpireAssign/);
  assert.match(page, /CreatePoolRoundRobin/);
  assert.match(page, /RemovePoolPlay/);
  assert.match(page, /HandGames/);
});

test("a one-division catalog stays scoped to that division", () => {
  const onlyMens = buildScorekeeperCatalog(
    divisions.filter((d) => d.id === "mens-d"),
    TZ
  );
  assert.ok(onlyMens.length > 0);
  assert.ok(onlyMens.every((r) => r.divisionId === "mens-d"));
  assert.ok(!onlyMens.some((r) => r.id.startsWith("wr") || r.id.startsWith("ce")));
});
