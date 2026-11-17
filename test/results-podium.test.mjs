import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { divisionPodium } from "@/lib/data";
import { divisionPlacings, mainBracketFormat } from "@/lib/bracket/placing";
import { bracketStandings } from "@/lib/bracket/standings";
import { divisionFinalStandings } from "@/lib/home-recent";
import { divisionStandingsHref, STANDINGS_VIEW } from "@/lib/archive";

// Real Worlds 2026 Coed D bracket (prod, read-only snapshot). G39 Aces Wild
// 12–8 Fallen; G40 (if-game) moot; G38 Fallen 10–9 Bunt Cakes; G37 Fallen
// 18–3 RNB; G34 RNB 12–11 Glove Workz.
const coedD = JSON.parse(
  readFileSync(new URL("./fixtures/worlds-2026-coed-d.json", import.meta.url), "utf8")
);
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Coed D podium comes from the bracket: Bunt Cakes 3rd, not Glove Workz", () => {
  const podium = divisionPodium(coedD, {});
  assert.deepEqual(
    podium.map((r) => [r.place, r.team, `${r.w}-${r.l}`, r.label]),
    [
      [1, "Aces Wild", "5-0", "Champion"],
      [2, "Fallen", "5-2", "2nd"],
      [3, "Bunt Cakes", "3-2", "3rd"],
    ]
  );
  assert.ok(!podium.some((r) => r.team === "Glove Workz"));
});

test("team_status.placement only rewords the label; the bracket sets the place", () => {
  const podium = divisionPodium(coedD, {
    "Bunt Cakes": { state: "eliminated", placement: "3rd Place" },
    "Glove Workz": { state: "eliminated", placement: "3rd" },
  });
  const third = podium.filter((r) => r.place === 3);
  assert.deepEqual(third.map((r) => [r.team, r.label]), [["Bunt Cakes", "3rd Place"]]);
});

test("no champion yet: no podium is guessed from records", () => {
  const games = coedD.games.map((g) =>
    g.round === 39 ? { ...g, status: "scheduled", team1_score: null, team2_score: null } : g
  );
  const podium = divisionPodium({ ...coedD, games }, {});
  assert.deepEqual(podium, []);
});

test("Coed D standings panel: every team placed from the bracket, none 'still in'", () => {
  const placings = divisionPlacings(coedD.games, mainBracketFormat(coedD.brackets));
  const rows = bracketStandings(coedD.games, {}, placings);
  assert.equal(rows.length, 18);
  assert.ok(rows.every((r) => r.finish), "every eliminated team has a finish");
  const at = (team) => rows.find((r) => r.team === team).finish.n;
  assert.equal(at("Aces Wild"), 1);
  assert.equal(at("Fallen"), 2);
  assert.equal(at("Bunt Cakes"), 3);
  assert.equal(at("RNB"), 4);
  assert.equal(at("Glove Workz"), 5);
  assert.deepEqual(rows.slice(0, 4).map((r) => r.team), ["Aces Wild", "Fallen", "Bunt Cakes", "RNB"]);
});

test("podium, panel and home standings agree on Coed D places", () => {
  const home = divisionFinalStandings(coedD);
  const placings = divisionPlacings(coedD.games, mainBracketFormat(coedD.brackets));
  for (const r of home) if (r.place != null) assert.equal(placings.get(r.team)?.place, r.place, r.team);
});

test("Full standings link opens the division page on its standings", () => {
  assert.equal(
    divisionStandingsHref("2026-afa-world-series", "d6b9b6c5-66d2-40a5-8713-62e525a22bc5"),
    "/tournaments/2026-afa-world-series/division/d6b9b6c5-66d2-40a5-8713-62e525a22bc5?view=standings"
  );
  assert.equal(STANDINGS_VIEW, "standings");
  assert.match(src("components/TournamentResults.js"), /divisionStandingsHref\(slug, column\.divisionId\)/);
  const view = src("components/DivisionView.js");
  assert.match(view, /q\.get\("view"\) === STANDINGS_VIEW/);
  assert.match(view, /setStandingsFor\(standingsId\)/);
  assert.match(view, /data-standings-pane/);
});

test("division page gives a lone bracket (no Gold/Silver children) a standings pane", () => {
  const page = src("app/tournaments/[slug]/division/[divisionId]/page.js");
  assert.match(page, /\[division\.id\]: bracketGames/);
  assert.match(page, /bracketStandings\(list, teamStatus, divisionPlacings\(list, formatOf\(id\)\)\)/);
});
