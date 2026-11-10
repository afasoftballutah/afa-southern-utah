import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shortTeamKey,
  isDisplayableManager,
  assignPageSlugs,
  buildTeamIdentities,
  buildHrefMap,
  teamPageHref,
  pageForSlug,
  gamesForIdentity,
} from "@/lib/team-page";

const CLASS_D = "class-d";
const CLASS_E = "class-e";
const classes = [
  { id: CLASS_D, name: "D" },
  { id: CLASS_E, name: "E" },
];

const tournaments = [
  { id: "t-heat", name: "Coed Heat Stroker", slug: "2026-coed-heat-stroker", start_date: "2026-07-24", end_date: "2026-07-26", status: "upcoming" },
  { id: "t-shirt", name: "Do It for the T-Shirts", slug: "2026-t-shirt-tournament", start_date: "2026-08-22", end_date: "2026-08-22", status: "upcoming" },
  { id: "t-worlds", name: "AFA World Series", slug: "2026-afa-world-series", start_date: "2026-11-12", end_date: "2026-11-16", status: "upcoming" },
];

const heatParent = "div-heat-coed";
const divisions = [
  { id: heatParent, name: "Coed", display_name: "Coed", gender: "coed", class_id: null, parent_division_id: null, tournament_id: "t-heat" },
  { id: "div-heat-silver", name: "Silver", display_name: "Silver", gender: "coed", class_id: null, parent_division_id: heatParent, tournament_id: "t-heat" },
  { id: "div-heat-gold", name: "Gold", display_name: "Gold", gender: "coed", class_id: null, parent_division_id: heatParent, tournament_id: "t-heat" },
  { id: "div-shirt-coed-d", name: "Coed D", display_name: "Coed D", gender: "coed", class_id: CLASS_D, parent_division_id: null, tournament_id: "t-shirt" },
  { id: "div-shirt-coed-e", name: "Coed E", display_name: "Coed E", gender: "coed", class_id: CLASS_E, parent_division_id: null, tournament_id: "t-shirt" },
  { id: "div-shirt-mens-d", name: "Men's D", display_name: "Men's D", gender: "mens", class_id: CLASS_D, parent_division_id: null, tournament_id: "t-shirt" },
  { id: "div-shirt-mens-e", name: "Men's E", display_name: "Men's E", gender: "mens", class_id: CLASS_E, parent_division_id: null, tournament_id: "t-shirt" },
  { id: "div-worlds-mens-d", name: "Men's D", display_name: "Men's D", gender: "mens", class_id: CLASS_D, parent_division_id: null, tournament_id: "t-worlds" },
  { id: "div-worlds-mens-e", name: "Men's E", display_name: "Men's E", gender: "mens", class_id: CLASS_E, parent_division_id: null, tournament_id: "t-worlds" },
  { id: "div-worlds-coed-d", name: "Coed D", display_name: "Coed D", gender: "coed", class_id: CLASS_D, parent_division_id: null, tournament_id: "t-worlds" },
];

const teams = [
  { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Fallen", normalized_name: "fallen", gender: "coed", class_id: CLASS_D, manager_name: "Brayden Brooks", merged_into_id: null },
  { id: "bbbbbbbb-2222-4222-8222-222222222222", name: "Fallen", normalized_name: "fallen", gender: "coed", class_id: null, manager_name: null, merged_into_id: null },
  { id: "cccccccc-3333-4333-8333-333333333333", name: "Fallen", normalized_name: "fallen", gender: "mens", class_id: CLASS_D, manager_name: "Brayden", merged_into_id: null },
  { id: "dddddddd-4444-4444-8444-444444444444", name: "Fallen", normalized_name: "fallen", gender: "mens", class_id: CLASS_E, manager_name: "Tbd", merged_into_id: null },
  { id: "eeeeeeee-5555-4555-8555-555555555555", name: "Fallen", normalized_name: "fallen", gender: "coed", class_id: CLASS_E, manager_name: "Tbd", merged_into_id: null },
  { id: "ffffffff-6666-4666-8666-666666666666", name: "Fallen", normalized_name: "fallen", gender: "mens", class_id: CLASS_E, manager_name: ".", merged_into_id: null },
  { id: "abababab-7777-4777-8777-777777777777", name: "The Pliggas", normalized_name: "the pliggas", gender: "coed", class_id: null, manager_name: null, merged_into_id: null },
];

const registrations = [
  { id: "r1", team_id: "aaaaaaaa-1111-4111-8111-111111111111", team_name: "Fallen", tournament_id: "t-shirt", division_id: "div-shirt-coed-d", manager_name: "Brayden Brooks", status: "submitted" },
  { id: "r2", team_id: "bbbbbbbb-2222-4222-8222-222222222222", team_name: "Fallen", tournament_id: "t-heat", division_id: "div-heat-silver", manager_name: null, status: "confirmed" },
  { id: "r3", team_id: "cccccccc-3333-4333-8333-333333333333", team_name: "Fallen", tournament_id: "t-shirt", division_id: "div-shirt-mens-d", manager_name: "Brayden Brooks", status: "submitted" },
  { id: "r4", team_id: "dddddddd-4444-4444-8444-444444444444", team_name: "Fallen", tournament_id: "t-shirt", division_id: "div-shirt-mens-e", manager_name: "Tbd", status: "submitted" },
  { id: "r5", team_id: "eeeeeeee-5555-4555-8555-555555555555", team_name: "Fallen", tournament_id: "t-shirt", division_id: "div-shirt-coed-e", manager_name: "Tbd", status: "submitted" },
  { id: "r6", team_id: "cccccccc-3333-4333-8333-333333333333", team_name: "Fallen", tournament_id: "t-worlds", division_id: "div-worlds-mens-d", manager_name: null, status: "confirmed" },
  { id: "r7", team_id: "ffffffff-6666-4666-8666-666666666666", team_name: "Fallen", tournament_id: "t-worlds", division_id: "div-worlds-mens-e", manager_name: ".", status: "submitted" },
  { id: "r8", team_id: null, team_name: "Fallen", tournament_id: "t-worlds", division_id: "div-worlds-coed-d", manager_name: null, status: "confirmed" },
  { id: "r9", team_id: "abababab-7777-4777-8777-777777777777", team_name: "The Pliggas", tournament_id: "t-heat", division_id: "div-heat-gold", manager_name: null, status: "confirmed" },
];

function divisionJoin(divisionId) {
  const division = divisions.find((d) => d.id === divisionId);
  const tournament = tournaments.find((t) => t.id === division?.tournament_id);
  return division
    ? { ...division, tournaments: tournament ?? null }
    : null;
}

function game(id, divisionId, team1, team2, extra = {}) {
  return {
    id,
    division_id: divisionId,
    team1_name: team1,
    team2_name: team2,
    team1_score: extra.s1 ?? null,
    team2_score: extra.s2 ?? null,
    status: extra.status ?? "scheduled",
    scheduled_time: extra.when ?? "2026-08-22T15:00:00Z",
    field: "F1",
    pool: extra.pool ?? null,
    round: extra.round ?? null,
    divisions: divisionJoin(divisionId),
  };
}

const poolGames = [
  game("p1", heatParent, "Fallen", "Has Beens", { pool: "A", status: "final", s1: 13, s2: 7, when: "2026-07-24T16:00:00Z" }),
  game("p2", heatParent, "Backwards K", "The Pliggas", { pool: "B", status: "final", s1: 1, s2: 15, when: "2026-07-24T17:00:00Z" }),
];

const bracketGames = [
  game("b-heat-fallen", "div-heat-silver", "Fallen", "Silver Foe", { round: 1, status: "final", s1: 10, s2: 12, when: "2026-07-25T16:00:00Z" }),
  game("b-heat-pliggas", "div-heat-gold", "The Pliggas", "Backwards K", { round: 1, status: "final", s1: 15, s2: 10, when: "2026-07-25T18:00:00Z" }),
  game("b-shirt-coed-d", "div-shirt-coed-d", "Fallen", "Coed D Foe", { round: 1 }),
  game("b-shirt-coed-e", "div-shirt-coed-e", "Fallen", "Coed E Foe", { round: 1 }),
  game("b-shirt-mens-d", "div-shirt-mens-d", "Fallen", "Mens D Foe", { round: 1 }),
  game("b-shirt-mens-e", "div-shirt-mens-e", "Fallen", "Mens E Foe", { round: 1 }),
  game("b-worlds-mens-d", "div-worlds-mens-d", "Fallen", "Worlds D Foe", { round: 1 }),
  game("b-worlds-mens-e", "div-worlds-mens-e", "Fallen", "Worlds E Foe", { round: 1 }),
  game("b-worlds-coed-d", "div-worlds-coed-d", "Fallen", "Worlds Coed Foe", { round: 1 }),
];

function identities() {
  return buildTeamIdentities({
    teams,
    registrations,
    divisions,
    tournaments,
    classes,
    poolGames,
    bracketGames,
  });
}

test("short key uses the uuid prefix, including provisional reg ids", () => {
  assert.equal(shortTeamKey("aaaaaaaa-1111-4111-8111-111111111111"), "aaaaaaaa");
  assert.equal(shortTeamKey("reg:r8-not-a-uuid-00000000-1111-4111-8111-999999999999"), "00000000");
});

test("TBD and punctuation are not displayable managers", () => {
  assert.equal(isDisplayableManager("Tbd"), false);
  assert.equal(isDisplayableManager("TBD"), false);
  assert.equal(isDisplayableManager("."), false);
  assert.equal(isDisplayableManager(""), false);
  assert.equal(isDisplayableManager("Brayden Brooks"), true);
});

test("unique names keep the bare slug", () => {
  const all = identities();
  const pliggas = all.find((t) => t.normalizedName === "the pliggas");
  assert.ok(pliggas);
  assert.equal(pliggas.slug, "the-pliggas");
  assert.equal(pliggas.sharedName, false);
});

test("Fallen pages group by name, gender and class; /teams/fallen is the chooser", () => {
  const all = identities();
  const fallen = all.filter((t) => t.nameSlug === "fallen");
  assert.equal(fallen.length, 5);
  assert.ok(fallen.every((t) => t.sharedName));

  const bySlug = Object.fromEntries(fallen.map((t) => [t.slug, t]));
  assert.ok(bySlug["fallen-coed-d"]);
  assert.ok(bySlug["fallen-coed-e"]);
  assert.ok(bySlug["fallen-mens-d"]);
  assert.ok(bySlug["fallen-mens-e"]);
  assert.ok(bySlug["fallen-coed"]);

  const coedD = bySlug["fallen-coed-d"];
  assert.equal(coedD.managerName, "Brayden Brooks");
  assert.equal(coedD.className, "D");
  assert.equal(coedD.gender, "coed");
  assert.equal(
    new Set(coedD.seats.map((s) => s.tournamentSlug)).size,
    2,
    "T-Shirts Coed D and Worlds Coed D share one page"
  );
  assert.ok(coedD.aliases.includes("fallen-aaaaaaaa"));
  assert.ok(coedD.aliases.includes("fallen-brayden-brooks-coed"));
  // Worlds Coed D was a provisional registration page
  assert.ok(coedD.aliases.some((a) => a.startsWith("fallen-") && a !== "fallen-coed-d"));

  const mensD = bySlug["fallen-mens-d"];
  assert.equal(mensD.managerName, "Brayden Brooks");
  assert.deepEqual(
    new Set(mensD.seats.map((s) => s.tournamentSlug)),
    new Set(["2026-t-shirt-tournament", "2026-afa-world-series"])
  );
  assert.ok(mensD.aliases.includes("fallen-cccccccc"));
  assert.ok(mensD.aliases.includes("fallen-brayden-brooks-mens"));

  const mensE = bySlug["fallen-mens-e"];
  assert.equal(mensE.managerName, null);
  assert.deepEqual(
    new Set(mensE.seats.map((s) => s.tournamentSlug)),
    new Set(["2026-t-shirt-tournament", "2026-afa-world-series"])
  );
  assert.ok(mensE.aliases.includes("fallen-dddddddd"));
  assert.ok(mensE.aliases.includes("fallen-ffffffff"));

  const coedE = bySlug["fallen-coed-e"];
  assert.equal(coedE.managerName, null);
  assert.deepEqual(
    coedE.seats.map((s) => s.tournamentSlug),
    ["2026-t-shirt-tournament"]
  );

  const heat = bySlug["fallen-coed"];
  assert.equal(heat.className, null);
  assert.equal(heat.gender, "coed");
  assert.deepEqual(heat.seats.map((s) => s.tournamentSlug), ["2026-coed-heat-stroker"]);
  assert.ok(heat.aliases.includes("fallen-bbbbbbbb"));

  const slugs = new Set(fallen.map((t) => t.slug));
  assert.equal(slugs.size, 5);

  const chooser = pageForSlug("fallen", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: { [CLASS_D]: "D", [CLASS_E]: "E" },
  });
  assert.equal(chooser.kind, "chooser");
  assert.equal(chooser.options.length, 5);
  assert.deepEqual(
    chooser.options.map((o) => o.slug).sort(),
    ["fallen-coed", "fallen-coed-d", "fallen-coed-e", "fallen-mens-d", "fallen-mens-e"]
  );
});

test("a no-class Coed team stays on its own page, not Coed D", () => {
  const fallen = identities().filter((t) => t.nameSlug === "fallen");
  const heat = fallen.find((t) => t.slug === "fallen-coed");
  const coedD = fallen.find((t) => t.slug === "fallen-coed-d");
  assert.ok(heat && coedD);
  assert.notEqual(heat.id, coedD.id);
  assert.ok(!heat.seats.some((s) => s.divisionName === "Coed D"));
  assert.ok(!coedD.seats.some((s) => s.tournamentSlug === "2026-coed-heat-stroker"));
});

test("each Fallen page only gets its own games, including a pool-parent family", () => {
  const all = identities();
  const heat = all.find((t) => t.slug === "fallen-coed");
  const { pool, bracket } = gamesForIdentity(heat, poolGames, bracketGames);
  assert.deepEqual(pool.map((g) => g.id), ["p1"]);
  assert.deepEqual(bracket.map((g) => g.id), ["b-heat-fallen"]);

  const mensD = all.find((t) => t.slug === "fallen-mens-d");
  const mens = gamesForIdentity(mensD, poolGames, bracketGames);
  assert.deepEqual(mens.pool.map((g) => g.id), []);
  assert.deepEqual(new Set(mens.bracket.map((g) => g.id)), new Set(["b-shirt-mens-d", "b-worlds-mens-d"]));

  const coedD = all.find((t) => t.slug === "fallen-coed-d");
  const cd = gamesForIdentity(coedD, poolGames, bracketGames);
  assert.deepEqual(new Set(cd.bracket.map((g) => g.id)), new Set(["b-shirt-coed-d", "b-worlds-coed-d"]));

  const page = pageForSlug("fallen-mens-d", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: { [CLASS_D]: "D", [CLASS_E]: "E" },
  });
  assert.equal(page.kind, "team");
  assert.equal(page.slug, "fallen-mens-d");
  assert.equal(page.managerName, "Brayden Brooks");
  assert.equal(page.tournamentCount, 2);
  const gameIds = page.identities[0].tournaments.flatMap((c) => c.games.map((g) => g.id));
  assert.deepEqual(new Set(gameIds), new Set(["b-shirt-mens-d", "b-worlds-mens-d"]));
});

test("old short-id and manager slugs alias to the new readable page", () => {
  const all = identities();
  const viaOldManager = pageForSlug("fallen-brayden-brooks-coed", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: { [CLASS_D]: "D" },
  });
  const viaShort = pageForSlug("fallen-aaaaaaaa", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: { [CLASS_D]: "D" },
  });
  const viaCanon = pageForSlug("fallen-coed-d", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: { [CLASS_D]: "D" },
  });
  assert.equal(viaOldManager.kind, "team");
  assert.equal(viaOldManager.slug, "fallen-coed-d");
  assert.equal(viaShort.slug, "fallen-coed-d");
  assert.equal(viaCanon.slug, "fallen-coed-d");
  const gameIds = new Set(
    viaOldManager.identities[0].tournaments.flatMap((c) => c.games.map((g) => g.id))
  );
  assert.ok(gameIds.has("b-shirt-coed-d"));
  assert.ok(gameIds.has("b-worlds-coed-d"));
});

test("links from a division go to that club, not the chooser", () => {
  const all = identities();
  const hrefMap = buildHrefMap(all, divisions);
  assert.equal(
    teamPageHref("Fallen", { divisionId: "div-shirt-mens-d", hrefMap }),
    "/teams/fallen-mens-d"
  );
  assert.equal(
    teamPageHref("Fallen", { divisionId: "div-worlds-mens-e", hrefMap }),
    "/teams/fallen-mens-e"
  );
  assert.equal(
    teamPageHref("Fallen", { divisionId: "div-heat-silver", hrefMap }),
    "/teams/fallen-coed"
  );
  // Pool parent is in the same family as the Silver registration.
  assert.equal(
    teamPageHref("Fallen", { divisionId: heatParent, hrefMap }),
    "/teams/fallen-coed"
  );
  assert.equal(
    teamPageHref("Fallen", { divisionId: "div-worlds-coed-d", hrefMap }),
    "/teams/fallen-coed-d"
  );
  // Name only, shared: the chooser.
  assert.equal(teamPageHref("Fallen", { hrefMap }), "/teams/fallen");
  // Unique name, even without a division.
  assert.equal(teamPageHref("The Pliggas", { hrefMap }), "/teams/the-pliggas");
  assert.equal(
    teamPageHref("The Pliggas", { divisionId: "div-heat-gold", hrefMap }),
    "/teams/the-pliggas"
  );
});

test("a unique team page payload is unchanged in shape", () => {
  const all = identities();
  const page = pageForSlug("the-pliggas", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: {},
  });
  assert.equal(page.kind, "team");
  assert.equal(page.slug, "the-pliggas");
  assert.equal(page.sharedName, false);
  assert.equal(page.identities.length, 1);
  assert.ok(page.tournamentCount >= 1);
  const games = page.identities[0].tournaments.flatMap((c) => c.games.map((g) => g.id));
  assert.ok(games.includes("b-heat-pliggas"));
  assert.ok(!games.includes("p1"), "must not pick up Fallen's pool game");
});

test("assignPageSlugs uses gender and class, not the manager", () => {
  const rows = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Gloveworks", managerName: "Raylee Perry", gender: "womens", className: "Rec" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Gloveworks", managerName: null, gender: "coed", className: "E" },
  ];
  assignPageSlugs(rows);
  assert.equal(rows[0].slug, "gloveworks-womens-rec");
  assert.equal(rows[1].slug, "gloveworks-coed-e");
  assert.ok(rows[0].aliases.includes("gloveworks-raylee-perry-womens"));
  assert.ok(rows[0].aliases.includes("gloveworks-11111111"));
});
