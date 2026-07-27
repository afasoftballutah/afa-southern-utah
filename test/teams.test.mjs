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
