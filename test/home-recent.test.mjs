import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasScoredFinal,
  latestFinalGame,
  recentFinalsByGender,
  recentGamesByGender,
  gameNumberLabel,
  RECENT_GAMES_CAP,
  sortResultEventsByRecency,
} from "../lib/home-recent.js";
import { isTournamentFinished, isPastTournament } from "../lib/tournament-state.js";
import { championshipGameOf } from "../lib/bracket/if-game.js";

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
  assert.match(src, /export async function getRecentCompletedTournaments/);
  assert.match(src, /export async function getRecentResultTournaments/);
  const completed = src.slice(
    src.indexOf("export async function getRecentCompletedTournaments"),
    src.indexOf("export async function getRecentResultTournaments")
  );
  assert.match(completed, /\.eq\("region", "southern_utah"\)/);
  assert.match(completed, /isTournamentFinished/);
  const results = src.slice(
    src.indexOf("export async function getRecentResultTournaments"),
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
