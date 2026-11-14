import { test } from "node:test";
import assert from "node:assert/strict";
import { json } from "./load.mjs";
import {
  teamSlug,
  buildTeamHistory,
  identityLabel,
  placementForTeam,
} from "@/lib/teams";
import { championOf } from "@/lib/bracket/if-game";

test("slug round-trip for known names", () => {
  assert.equal(teamSlug("Backwards K"), "backwards-k");
  assert.equal(teamSlug("J.E.T.S."), "j-e-t-s");
  assert.equal(teamSlug("The Pliggas"), "the-pliggas");
});

test("identity label", () => {
  assert.equal(identityLabel("coed", null), "Coed");
  assert.equal(identityLabel("mens", "D"), "Men's · D");
  assert.equal(identityLabel("womens", "E"), "Women's · E");
});

test("Backwards K history — one tournament, 6–0, Gold champion, six games newest first", async () => {
  const gold = await json("games-gold.json");
  // Attach division + tournament joins the way PostgREST would.
  const tournament = {
    id: "t-heat",
    slug: "2026-coed-heat-stroker",
    name: "Coed Heat Stroker",
    start_date: "2026-07-24",
    end_date: "2026-07-26",
    status: "upcoming",
  };
  const division = {
    id: "gold",
    name: "Gold",
    display_name: "Gold",
    gender: "coed",
    class_id: null,
    tournaments: tournament,
  };
  const bracketGames = gold.map((g) => ({
    ...g,
    division_id: "gold",
    divisions: division,
  }));
  // Minimal pool games so record can hit 6-0 if pool wins exist — fixtures are bracket only.
  // Acceptance on live data is 6-0 whole tournament; bracket-only fixtures may be 4-0.
  const history = buildTeamHistory("Backwards K", [], bracketGames, {
    "t-heat": { "Backwards K": { state: "champion", placement: "Champion", bracket_name: "Gold" } },
  });
  assert.ok(history);
  assert.equal(history.identities.length, 1);
  const id = history.identities[0];
  assert.equal(id.gender, "coed");
  assert.equal(id.tournaments.length, 1);
  const card = id.tournaments[0];
  assert.equal(card.tournament.slug, "2026-coed-heat-stroker");
  assert.equal(card.placement, "Champion");
  assert.ok(card.medal);
  assert.equal(championOf(gold), "Backwards K");
  // Games newest first
  for (let i = 1; i < card.games.length; i++) {
    const a = card.games[i - 1].scheduledTime ?? "";
    const b = card.games[i].scheduledTime ?? "";
    assert.ok(String(a) >= String(b), "games not newest-first");
  }
  assert.ok(card.games.length >= 4, "expected several bracket games");
});

test("J.E.T.S. slug", () => {
  assert.equal(teamSlug("J.E.T.S."), "j-e-t-s");
});

test("only the deciding championship game is flagged for matchup medals", async () => {
  const gold = await json("games-gold.json");
  const tournament = {
    id: "t-heat",
    slug: "2026-coed-heat-stroker",
    name: "Coed Heat Stroker",
    start_date: "2026-07-24",
    end_date: "2026-07-26",
    status: "upcoming",
  };
  const division = {
    id: "gold",
    name: "Gold",
    display_name: "Gold",
    gender: "coed",
    class_id: null,
    tournaments: tournament,
  };
  const bracketGames = gold.map((g) => ({
    ...g,
    division_id: "gold",
    divisions: division,
  }));
  const history = buildTeamHistory("Backwards K", [], bracketGames, {
    "t-heat": { "Backwards K": { state: "champion", placement: "Champion", bracket_name: "Gold" } },
  });
  const games = history.identities[0].tournaments[0].games;
  const flagged = games.filter((g) => g.championship);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].id, "7460a4f2-29b7-4541-b688-5e83e64c9a09");
  assert.equal(flagged[0].team1, "Backwards K");
  assert.equal(flagged[0].team2, "Del Fuegos");
  assert.ok(
    games.filter((g) => g.isFinal).length > 1,
    "other scored games should exist and not get medals"
  );
  assert.ok(games.some((g) => g.isFinal && !g.championship));
});

function goldHistory(team, games = null, status = null) {
  return (async () => {
    const gold = games ?? (await json("games-gold.json"));
    const tournament = {
      id: "t-heat",
      slug: "2026-coed-heat-stroker",
      name: "Coed Heat Stroker",
      start_date: "2026-07-24",
      end_date: "2026-07-26",
      status: "upcoming",
    };
    const division = {
      id: "gold",
      name: "Gold",
      display_name: "Gold",
      gender: "coed",
      class_id: null,
      tournaments: tournament,
    };
    const bracketGames = gold.map((g) => ({
      ...g,
      division_id: "gold",
      divisions: division,
    }));
    return buildTeamHistory(team, [], bracketGames, {
      "t-heat": status ?? { [team]: { state: "eliminated" } },
    });
  })();
}

test("elimination game carries Timeline places; 3rd is on Speed Demons, 5th on New Era", async () => {
  const third = await goldHistory("Speed Demons");
  const g15 = third.identities[0].tournaments[0].games.find((g) => g.id === "c0607b6b-d792-482c-aa19-fb7f3d3ab912");
  assert.ok(g15);
  assert.equal(g15.championship, false);
  assert.equal(g15.team1Place, null);
  assert.equal(g15.team2Place, "3rd");

  const fifth = await goldHistory("New Era");
  const g11 = fifth.identities[0].tournaments[0].games.find((g) => g.id === "d160e47f-8758-4129-85b0-14e46fc94fa9");
  assert.ok(g11);
  assert.equal(g11.championship, false);
  assert.equal(g11.team1Place, "5th");
  assert.equal(g11.team2Place, null);
});

test("championship game keeps 2nd on the runner-up slot for medals to replace", async () => {
  const history = await goldHistory("Del Fuegos");
  const final = history.identities[0].tournaments[0].games.find((g) => g.id === "7460a4f2-29b7-4541-b688-5e83e64c9a09");
  assert.equal(final.championship, true);
  assert.equal(final.team1Place, null);
  assert.equal(final.team2Place, "2nd");
});

test("a team still alive has no place on its games", async () => {
  const gold = await json("games-gold.json");
  // Leave the last two games unplayed: championship and the 3rd-place game.
  const open = gold.map((g) =>
    g.round >= 15
      ? { ...g, status: "scheduled", team1_score: null, team2_score: null }
      : g
  );
  const history = await goldHistory("Speed Demons", open);
  const games = history.identities[0].tournaments[0].games;
  assert.ok(games.length > 0);
  assert.ok(games.every((g) => !g.championship));
  const ownPlace = (g) =>
    (g.team1 === "Speed Demons" && g.team1Place) || (g.team2 === "Speed Demons" && g.team2Place);
  assert.ok(games.every((g) => !ownPlace(g)), "still-alive team shows no place of its own");
});
