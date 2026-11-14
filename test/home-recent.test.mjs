import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasScoredFinal,
  latestFinalGame,
  recentFinalsByGender,
  recentGamesByGender,
  recentGamesByDivision,
  gameNumberLabel,
  divisionFinalStandings,
  divisionScoredRecords,
  RECENT_GAMES_CAP,
  sortResultEventsByRecency,
} from "../lib/home-recent.js";
import { isTournamentFinished, isPastTournament } from "../lib/tournament-state.js";
import { championshipGameOf } from "../lib/bracket/if-game.js";
import {
  cardsForResultPicker,
  defaultResultPickerValue,
  resultDivisionPickerOptions,
  shouldShowResultPicker,
} from "../lib/home-result-picker.js";

function game(id, extras = {}) {
  return {
    id,
    team1_name: extras.t1 ?? "A",
    team2_name: extras.t2 ?? "B",
    team1_score: extras.s1 ?? 1,
    team2_score: extras.s2 ?? 0,
    status: extras.status ?? "final",
    scheduled_time: extras.when ?? "2026-11-13T18:00:00Z",
    round: extras.round ?? 1,
    winner_feeds_game_id: extras.feeds ?? null,
    team1_source_game_id: extras.src1 ?? null,
    team2_source_game_id: extras.src2 ?? null,
  };
}

function finishedHeatStrokerLike() {
  const champ = game("hs-champ", {
    t1: "St. George",
    t2: "Cedar",
    s1: 13,
    s2: 7,
    when: "2026-07-26T20:00:00Z",
    round: 4,
    src1: "hs-semi",
  });
  const earlier = game("hs-semi", {
    t1: "St. George",
    t2: "Hurricane",
    s1: 12,
    s2: 9,
    when: "2026-07-26T17:00:00Z",
    round: 3,
    feeds: "hs-champ",
  });
  return {
    name: "Coed Heat Stroker",
    start_date: "2026-07-24",
    end_date: "2026-07-26",
    region: "southern_utah",
    divisions: [
      {
        id: "coed-gold",
        name: "Gold",
        gender: "coed",
        sort_order: 1,
        games: [earlier, champ],
      },
    ],
  };
}

function inProgressWorldsLike() {
  const mensEChamp = game("me-champ", {
    t1: "Men E Winner",
    t2: "Men E Runner",
    s1: 21,
    s2: 10,
    when: "2026-11-13T16:00:00Z",
    round: 5,
    src1: "me-semi",
  });
  const mensESemi = game("me-semi", {
    t1: "Men E Winner",
    t2: "Other",
    s1: 15,
    s2: 8,
    when: "2026-11-13T14:00:00Z",
    round: 4,
    feeds: "me-champ",
  });
  const mensDChamp = game("md-champ", {
    t1: "Men D Champ",
    t2: "Men D Runner",
    s1: 18,
    s2: 12,
    when: "2026-11-13T17:00:00Z",
    round: 5,
    src1: "md-semi",
  });
  const mensDSemi = game("md-semi", {
    t1: "Men D Champ",
    t2: "Other D",
    s1: 14,
    s2: 6,
    when: "2026-11-13T15:00:00Z",
    round: 4,
    feeds: "md-champ",
  });
  const womensDPool = game("wd-pool", {
    t1: "Profit 3.0",
    t2: "Utah Saints",
    s1: 20,
    s2: 8,
    when: "2026-11-13T19:00:00Z",
    round: 1,
  });
  const womensDOpen = game("wd-open", {
    t1: "Profit 3.0",
    t2: "TBD",
    status: "scheduled",
    s1: null,
    s2: null,
    when: "2026-11-14T16:00:00Z",
    round: 2,
  });
  return {
    name: "AFA World Series",
    start_date: "2026-11-12",
    end_date: "2026-11-15",
    region: "nevada",
    divisions: [
      {
        id: "mens-e",
        name: "Men's E",
        gender: "mens",
        sort_order: 2,
        games: [mensESemi, mensEChamp],
      },
      {
        id: "mens-d",
        name: "Men's D",
        gender: "mens",
        sort_order: 1,
        games: [mensDSemi, mensDChamp],
      },
      {
        id: "womens-d",
        name: "Women's D",
        gender: "womens",
        sort_order: 1,
        games: [womensDPool, womensDOpen],
      },
    ],
  };
}

test("hasScoredFinal is true for an in-progress tournament with finals", () => {
  const worlds = inProgressWorldsLike();
  assert.equal(hasScoredFinal(worlds), true);
  assert.equal(isTournamentFinished(worlds), false);
});

test("hasScoredFinal is false when nothing is scored", () => {
  const t = {
    divisions: [
      {
        id: "x",
        name: "Women's D",
        gender: "womens",
        games: [game("open", { status: "scheduled", s1: null, s2: null })],
      },
    ],
  };
  assert.equal(hasScoredFinal(t), false);
});

test("recentFinalsByGender uses championships when a division is finished", () => {
  const heat = finishedHeatStrokerLike();
  assert.equal(isTournamentFinished(heat), true);
  const cards = recentFinalsByGender(heat);
  assert.equal(cards.coed.length, 1);
  assert.equal(cards.coed[0].championship, true);
  assert.equal(cards.coed[0].team1, "St. George");
  assert.equal(cards.coed[0].score1, 13);
  assert.equal(cards.coed[0].caption, "Gold");
  // Same game championshipGameOf would have picked
  const champ = championshipGameOf(heat.divisions[0].games);
  assert.equal(champ.id, "hs-champ");
});

test("recentFinalsByGender falls back to the latest final in an unfinished division", () => {
  const worlds = inProgressWorldsLike();
  const cards = recentFinalsByGender(worlds);
  assert.equal(cards.mens.length, 2);
  assert.equal(cards.mens[0].championship, true);
  assert.equal(cards.mens[0].divisionName, "Men's D");
  assert.equal(cards.mens[1].divisionName, "Men's E");
  assert.equal(cards.womens.length, 1);
  assert.equal(cards.womens[0].championship, false);
  assert.equal(cards.womens[0].team1, "Profit 3.0");
  assert.equal(cards.womens[0].score1, 20);
  assert.equal(cards.womens[0].caption, "Women's D");
  assert.equal(cards.coed.length, 0);
});

test("latestFinalGame prefers later scheduled_time, then later round", () => {
  const later = game("later", { when: "2026-11-13T20:00:00Z", round: 1 });
  const earlier = game("earlier", { when: "2026-11-13T18:00:00Z", round: 3 });
  assert.equal(latestFinalGame([earlier, later]).id, "later");
  const r2 = game("r2", { when: "2026-11-13T18:00:00Z", round: 2 });
  const r3 = game("r3", { when: "2026-11-13T18:00:00Z", round: 3 });
  assert.equal(latestFinalGame([r2, r3]).id, "r3");
});

test("sortResultEventsByRecency puts Worlds ahead of Heat Stroker", () => {
  const events = [
    { name: "Coed Heat Stroker", startDate: "2026-07-24" },
    { name: "AFA World Series", startDate: "2026-11-12" },
  ];
  const sorted = sortResultEventsByRecency(events);
  assert.equal(sorted[0].name, "AFA World Series");
  assert.equal(sorted[1].name, "Coed Heat Stroker");
});

test("isPastTournament is unchanged for a still-running Worlds", () => {
  const worlds = inProgressWorldsLike();
  // Mid-tournament, before the end date — not past, and not finished.
  assert.equal(isTournamentFinished(worlds), false);
  assert.equal(
    isPastTournament(worlds, new Date("2026-11-13T20:00:00Z")),
    false
  );
  // After the scheduled end, past stays past (latch is not weakened).
  assert.equal(
    isPastTournament(worlds, new Date("2026-11-16T12:00:00Z")),
    true
  );
});

test("home page uses result tournaments for Recent Results and completed only for Last Tournament", () => {
  const src = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(src, /getRecentResultTournaments/);
  assert.match(src, /getRecentCompletedTournaments/);
  assert.match(src, /recentFinalsByGender/);
  assert.match(src, /recentGamesByGender/);
  assert.match(src, /lastResults = recentCompleted\[0\]/);
  assert.match(src, /resultSource =\s*\n?\s*recentResults/s);
});

test("data.js keeps the finished-only Southern Utah helper for Last Tournament", () => {
  const src = readFileSync(new URL("../lib/data.js", import.meta.url), "utf8");
  assert.match(src, /function getRecentCompletedTournaments/);
  assert.match(src, /function getRecentResultTournaments/);
  const completed = src.slice(
    src.indexOf("function getRecentCompletedTournaments"),
    src.indexOf("function getRecentResultTournaments")
  );
  assert.match(completed, /\.eq\("region", "southern_utah"\)/);
  assert.match(completed, /isTournamentFinished/);
  const results = src.slice(
    src.indexOf("function getRecentResultTournaments"),
    src.indexOf("export async function getLastCompletedTournamentResults")
  );
  assert.doesNotMatch(results, /\.eq\("region"/);
  assert.match(results, /hasScoredFinal/);
  assert.doesNotMatch(results, /isTournamentFinished/);
});

test("gameNumberLabel uses Game N for brackets and Pool X for pool games", () => {
  assert.equal(gameNumberLabel({ round: 4 }), "Game 4");
  assert.equal(gameNumberLabel({ pool: "A", round: 1 }), "Pool A");
  assert.equal(gameNumberLabel({}), null);
});

test("recentGamesByGender lists newest scored games with division and game number", () => {
  const worlds = inProgressWorldsLike();
  const games = recentGamesByGender(worlds);
  // Men's D champ is later than Men's E champ
  assert.equal(games.mens[0].caption, "Men's D · Game 5");
  assert.equal(games.mens[0].championship, true);
  assert.equal(games.mens[0].team1, "Men D Champ");
  assert.equal(games.mens[1].caption, "Men's E · Game 5");
  assert.equal(games.mens[1].championship, true);
  // Earlier semis follow
  assert.equal(games.mens[2].caption, "Men's D · Game 4");
  assert.equal(games.mens[2].championship, false);
  assert.equal(games.womens[0].caption, "Women's D · Game 1");
  assert.equal(games.womens[0].championship, false);
  assert.equal(games.womens[0].team1, "Profit 3.0");
  assert.equal(games.womens.length, 1);
});

test("recentGamesByGender caps per gender and keeps later games", () => {
  const games = [];
  for (let i = 1; i <= 15; i++) {
    games.push(
      game(`w-${i}`, {
        t1: `T${i}`,
        t2: "Opp",
        s1: i,
        s2: 0,
        when: `2026-11-13T${String(i).padStart(2, "0")}:00:00Z`,
        round: i,
      })
    );
  }
  const t = {
    name: "Cap check",
    divisions: [
      { id: "wd", name: "Women's D", gender: "womens", games },
    ],
  };
  const out = recentGamesByGender(t);
  assert.equal(out.womens.length, RECENT_GAMES_CAP);
  assert.equal(out.womens[0].gameNumber, "Game 15");
  assert.equal(out.womens[11].gameNumber, "Game 4");
  // Game 1–3 dropped (oldest)
  assert.ok(!out.womens.some((g) => g.gameNumber === "Game 1"));
});

test("recentGamesByGender keeps every scored game in a finished division, not just the championship", () => {
  const heat = finishedHeatStrokerLike();
  const games = recentGamesByGender(heat);
  assert.equal(games.coed.length, 2);
  assert.equal(games.coed[0].caption, "Gold · Game 4");
  assert.equal(games.coed[0].championship, true);
  assert.equal(games.coed[1].caption, "Gold · Game 3");
  assert.equal(games.coed[1].championship, false);
});

test("By division still shows one headline result per division", () => {
  const worlds = inProgressWorldsLike();
  const cards = recentFinalsByGender(worlds);
  assert.equal(cards.womens.length, 1);
  assert.equal(cards.mens.length, 2);
});

test("home Recent Results has a By division / Recent games slider and light captions", () => {
  const ui = readFileSync(new URL("../components/HomeRecentResults.js", import.meta.url), "utf8");
  assert.match(ui, /By division/);
  assert.match(ui, /Recent games/);
  assert.match(ui, /useState\("division"\)/);
  assert.match(ui, /recentGames/);
  assert.match(ui, /isFinal\s+championship/);

  const card = readFileSync(new URL("../components/ui/MatchupCard.js", import.meta.url), "utf8");
  assert.match(card, /--matchup-caption/);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.home-results__panel[^{]*\{[^}]*--matchup-caption:\s*#f1f5f9/s);
  assert.match(css, /\.home-results__mode/);
});


/** 4-team double-elim with an if-necessary final (same shape as placing tests). */
function buildDe4() {
  const sheet = [
    [1, "winners", "Aces", "Bats"],
    [2, "winners", "Cats", "Dogs"],
    [3, "winners", null, null, 1, "winner", 2, "winner"],
    [4, "losers", null, null, 1, "loser", 2, "loser"],
    [5, "losers", null, null, 4, "winner", 3, "loser"],
    [6, "final", null, null, 3, "winner", 5, "winner"],
    [7, "final", null, null, 6, "winner", 6, "loser"],
  ];
  return sheet.map(([n, side, t1, t2, s1, r1, s2, r2]) => ({
    id: `g${n}`,
    round: n,
    bracket_side: side,
    bracket_group: "main",
    team1_name: t1 ?? null,
    team2_name: t2 ?? null,
    team1_source_game_id: s1 ? `g${s1}` : null,
    team1_source_result: r1 ?? null,
    team2_source_game_id: s2 ? `g${s2}` : null,
    team2_source_result: r2 ?? null,
    team1_score: null,
    team2_score: null,
    winner_slot: null,
    status: "pending",
    is_bye: false,
  }));
}

function play(games, id, team1Wins, scores = [9, 3]) {
  const g = games.find((x) => x.id === id);
  const [hi, lo] = scores;
  Object.assign(g, {
    team1_score: team1Wins ? hi : lo,
    team2_score: team1Wins ? lo : hi,
    winner_slot: team1Wins ? "team1" : "team2",
    status: "final",
  });
  const w = team1Wins ? g.team1_name : g.team2_name;
  const l = team1Wins ? g.team2_name : g.team1_name;
  for (const x of games) {
    for (const s of ["team1", "team2"]) {
      if (x[`${s}_source_game_id`] !== id) continue;
      x[`${s}_name`] =
        String(x[`${s}_source_result`] ?? "winner").toLowerCase() === "loser" ? l : w;
    }
  }
}

function finishedDe4Division({ playIfGame = false, poolGames = [] } = {}) {
  const games = buildDe4();
  for (const n of [1, 2, 3, 4, 5]) play(games, `g${n}`, true);
  if (playIfGame) {
    play(games, "g6", false);
    play(games, "g7", true);
  } else {
    play(games, "g6", true);
  }
  return {
    id: "gold",
    name: "Gold",
    gender: "coed",
    brackets: [{ id: "b1", bracket_group: "main", format: "double_elim" }],
    games,
    pool_games: poolGames,
  };
}

test("divisionFinalStandings is null while a division is still open", () => {
  const worlds = inProgressWorldsLike();
  assert.equal(divisionFinalStandings(worlds.divisions.find((d) => d.id === "womens-d")), null);
  const cards = recentFinalsByGender(worlds);
  assert.equal(cards.womens[0].standings, null);
  assert.equal(cards.womens[0].team1, "Profit 3.0");
});

test("divisionFinalStandings lists every team in finishing order with medals and W-L", () => {
  const d = finishedDe4Division();
  const rows = divisionFinalStandings(d);
  assert.deepEqual(
    rows.map((r) => [r.label, r.team, `${r.w}-${r.l}`, r.medal]),
    [
      ["1st", "Aces", "3-0", "\u{1F3C6}"],
      ["2nd", "Bats", "2-2", "\u{1F948}"],
      ["3rd", "Cats", "1-2", "\u{1F949}"],
      ["4th", "Dogs", "0-2", null],
    ]
  );
  // If-game was moot and must not invent a loss or win.
  const rec = divisionScoredRecords(d);
  assert.equal(rec.get("Aces").w + rec.get("Aces").l, 3);
});

test("divisionFinalStandings includes the if-necessary game in W-L when it was played", () => {
  const d = finishedDe4Division({ playIfGame: true });
  const rows = divisionFinalStandings(d);
  // G6: Aces lose to Bats; G7 team1 is Bats, team1 wins — Bats are champions 4-1; Aces 2-2.
  assert.equal(rows[0].team, "Bats");
  assert.equal(rows[0].label, "1st");
  assert.equal(rows[0].w, 4);
  assert.equal(rows[0].l, 1);
  assert.equal(rows[1].team, "Aces");
  assert.equal(rows[1].label, "2nd");
  assert.equal(rows[1].w, 2);
  assert.equal(rows[1].l, 2);
});

test("divisionScoredRecords counts pool finals and ignores unscored games", () => {
  const poolGames = [
    {
      id: "p1",
      pool: "A",
      team1_name: "Aces",
      team2_name: "Cats",
      team1_score: 12,
      team2_score: 5,
      status: "final",
    },
    {
      id: "p2",
      pool: "A",
      team1_name: "Bats",
      team2_name: "Dogs",
      team1_score: null,
      team2_score: null,
      status: "scheduled",
    },
  ];
  const d = finishedDe4Division({ poolGames });
  const rec = divisionScoredRecords(d);
  assert.equal(rec.get("Aces").w, 4); // 3 bracket + 1 pool
  assert.equal(rec.get("Cats").l, 3); // 2 bracket + 1 pool
  assert.equal(rec.get("Bats").w, 2); // unscored pool ignored
  const rows = divisionFinalStandings(d);
  assert.equal(rows[0].w, 4);
});

test("recentFinalsByGender attaches standings only on completed divisions", () => {
  const t = {
    name: "Mixed",
    divisions: [
      finishedDe4Division(),
      inProgressWorldsLike().divisions.find((d) => d.id === "womens-d"),
    ],
  };
  const cards = recentFinalsByGender(t);
  assert.equal(cards.coed[0].championship, true);
  assert.ok(cards.coed[0].standings);
  assert.equal(cards.coed[0].standings[0].label, "1st");
  assert.equal(cards.womens[0].standings, null);
});

test("By division UI renders standings for a completed division", () => {
  const ui = readFileSync(new URL("../components/HomeRecentResults.js", import.meta.url), "utf8");
  assert.match(ui, /DivisionStandings/);
  assert.match(ui, /final\.standings/);
  assert.match(ui, /home-results__standings/);
});

test("resultDivisionPickerOptions groups divisions under All Women's / Men's / Coed", () => {
  const worlds = inProgressWorldsLike();
  const genderFinals = recentFinalsByGender(worlds);
  const recentGames = recentGamesByGender(worlds);
  const groups = resultDivisionPickerOptions(genderFinals, recentGames);
  assert.deepEqual(
    groups.map((g) => [g.key, g.allLabel, g.divisions.map((d) => d.label)]),
    [
      ["womens", "All Women's", ["Women's D"]],
      ["mens", "All Men's", ["Men's D", "Men's E"]],
    ]
  );
  assert.equal(defaultResultPickerValue(groups), "womens");
  assert.equal(shouldShowResultPicker(groups), true);
});

test("default picker is All Women's when Women's has results — same as today's default", () => {
  const worlds = inProgressWorldsLike();
  const groups = resultDivisionPickerOptions(recentFinalsByGender(worlds));
  assert.equal(defaultResultPickerValue(groups), "womens");
});

test("single-gender events with several divisions still get a picker", () => {
  const heat = finishedHeatStrokerLike();
  const groups = resultDivisionPickerOptions(recentFinalsByGender(heat));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].allLabel, "All Coed");
  // Only one Gold division in the fixture — no picker needed
  assert.equal(shouldShowResultPicker(groups), false);
  const multi = {
    coed: [
      { key: "g", divisionName: "Gold" },
      { key: "s", divisionName: "Silver" },
    ],
  };
  const g2 = resultDivisionPickerOptions(multi);
  assert.equal(shouldShowResultPicker(g2), true);
  assert.deepEqual(g2[0].divisions.map((d) => d.label), ["Gold", "Silver"]);
});

test("cardsForResultPicker keeps All Women's and filters to one division in both modes", () => {
  const worlds = inProgressWorldsLike();
  const genderFinals = recentFinalsByGender(worlds);
  const recentGames = recentGamesByGender(worlds);
  const byDivision = recentGamesByDivision(worlds);
  const allW = cardsForResultPicker({
    mode: "division",
    picker: "womens",
    genderFinals,
    recentGames,
    recentGamesByDivision: byDivision,
  });
  assert.equal(allW.length, 1);
  assert.equal(allW[0].divisionName, "Women's D");
  const mensAll = cardsForResultPicker({
    mode: "division",
    picker: "mens",
    genderFinals,
    recentGames,
    recentGamesByDivision: byDivision,
  });
  assert.equal(mensAll.length, 2);
  const mensDId = mensAll[0].key;
  const one = cardsForResultPicker({
    mode: "division",
    picker: mensDId,
    genderFinals,
    recentGames,
    recentGamesByDivision: byDivision,
  });
  assert.equal(one.length, 1);
  assert.equal(one[0].divisionName, "Men's D");

  const allGames = cardsForResultPicker({
    mode: "games",
    picker: "mens",
    genderFinals,
    recentGames,
    recentGamesByDivision: byDivision,
  });
  const oneGames = cardsForResultPicker({
    mode: "games",
    picker: mensDId,
    genderFinals,
    recentGames,
    recentGamesByDivision: byDivision,
  });
  assert.ok(allGames.length >= oneGames.length);
  assert.ok(oneGames.length > 0);
  assert.ok(oneGames.every((c) => c.divisionId === mensDId && c.divisionName === "Men's D"));
});

test("recentGamesByDivision caps per division and is not limited by the gender cap", () => {
  const games = [];
  for (let i = 1; i <= 15; i++) {
    games.push(
      game(`w-${i}`, {
        t1: `T${i}`,
        when: `2026-11-13T${String(i).padStart(2, "0")}:00:00Z`,
        round: i,
      })
    );
  }
  const t = {
    divisions: [{ id: "wd", name: "Women's D", gender: "womens", games }],
  };
  const byDiv = recentGamesByDivision(t);
  assert.equal(byDiv.wd.length, RECENT_GAMES_CAP);
  assert.equal(byDiv.wd[0].gameNumber, "Game 15");
  assert.equal(byDiv.wd[0].divisionId, "wd");
});

test("HomeRecentResults dropdown lists All Women's and individual divisions", () => {
  const ui = readFileSync(new URL("../components/HomeRecentResults.js", import.meta.url), "utf8");
  assert.match(ui, /resultDivisionPickerOptions/);
  assert.match(ui, /<optgroup/);
  assert.match(ui, /allLabel/);
  assert.match(ui, /aria-label="Division"/);
  assert.doesNotMatch(ui, /aria-label="Gender"/);
});
