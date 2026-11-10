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

test("Fallen splits into one club per key, and /teams/fallen is the chooser", () => {
  const all = identities();
  const fallen = all.filter((t) => t.nameSlug === "fallen");
  // 6 team rows + 1 unlinked Worlds Coed D registration
  assert.equal(fallen.length, 7);
  assert.ok(fallen.every((t) => t.sharedName));

  const byId = Object.fromEntries(fallen.map((t) => [t.id, t]));
  const brooksCoed = byId["aaaaaaaa-1111-4111-8111-111111111111"];
  const heat = byId["bbbbbbbb-2222-4222-8222-222222222222"];
  const brooksMens = byId["cccccccc-3333-4333-8333-333333333333"];
  const tbdMens = byId["dddddddd-4444-4444-8444-444444444444"];
  const tbdCoed = byId["eeeeeeee-5555-4555-8555-555555555555"];
  const dotMens = byId["ffffffff-6666-4666-8666-666666666666"];
  const worldsCoed = fallen.find((t) => t.source === "registration");

  assert.equal(brooksCoed.slug, "fallen-brayden-brooks-coed");
  assert.equal(brooksMens.slug, "fallen-brayden-brooks-mens");
  assert.equal(brooksMens.managerName, "Brayden Brooks");
  assert.ok(heat.slug.endsWith("bbbbbbbb"));
  assert.ok(tbdMens.slug.endsWith("dddddddd"));
  assert.ok(tbdCoed.slug.endsWith("eeeeeeee"));
  assert.ok(dotMens.slug.endsWith("ffffffff"));
  assert.ok(worldsCoed);
  assert.equal(worldsCoed.managerName, null);
  assert.ok(tbdMens.managerName == null);
  assert.ok(tbdCoed.managerName == null);

  const slugs = new Set(fallen.map((t) => t.slug));
  assert.equal(slugs.size, 7);

  const chooser = pageForSlug("fallen", { identities: all, poolGames, bracketGames, teamStatusByTournament: {}, classNames: { [CLASS_D]: "D", [CLASS_E]: "E" } });
  assert.equal(chooser.kind, "chooser");
  assert.equal(chooser.options.length, 7);
  assert.ok(chooser.options.every((o) => o.href.startsWith("/teams/fallen-")));
});

test("Tbd rows and no-manager rows are not merged", () => {
  const fallen = identities().filter((t) => t.nameSlug === "fallen");
  const unmanaged = fallen.filter((t) => !t.managerName);
  // Heat (no manager), two Tbd, punctuation ".", Worlds Coed D unlinked
  assert.equal(unmanaged.length, 5);
  const ids = new Set(unmanaged.map((t) => t.id));
  assert.equal(ids.size, 5);
});

test("each Fallen club only gets its own games, including a pool-parent family", () => {
  const all = identities();
  const byId = Object.fromEntries(all.map((t) => [t.id, t]));
  const heat = byId["bbbbbbbb-2222-4222-8222-222222222222"];
  const { pool, bracket } = gamesForIdentity(heat, poolGames, bracketGames);
  assert.deepEqual(pool.map((g) => g.id), ["p1"]);
  assert.deepEqual(bracket.map((g) => g.id), ["b-heat-fallen"]);

  const brooksMens = byId["cccccccc-3333-4333-8333-333333333333"];
  const mens = gamesForIdentity(brooksMens, poolGames, bracketGames);
  assert.deepEqual(mens.pool.map((g) => g.id), []);
  assert.deepEqual(new Set(mens.bracket.map((g) => g.id)), new Set(["b-shirt-mens-d", "b-worlds-mens-d"]));

  const worldsCoed = all.find((t) => t.source === "registration" && t.nameSlug === "fallen");
  const wc = gamesForIdentity(worldsCoed, poolGames, bracketGames);
  assert.deepEqual(wc.bracket.map((g) => g.id), ["b-worlds-coed-d"]);

  const page = pageForSlug("fallen-brayden-brooks-mens", {
    identities: all,
    poolGames,
    bracketGames,
    teamStatusByTournament: {},
    classNames: { [CLASS_D]: "D", [CLASS_E]: "E" },
  });
  assert.equal(page.kind, "team");
  assert.equal(page.managerName, "Brayden Brooks");
  assert.equal(page.tournamentCount, 2);
  const gameIds = page.identities[0].tournaments.flatMap((c) => c.games.map((g) => g.id));
  assert.deepEqual(new Set(gameIds), new Set(["b-shirt-mens-d", "b-worlds-mens-d"]));
});

test("short-key aliases still resolve to the same club", () => {
  const all = identities();
  const ident = all.find((t) => t.id === "aaaaaaaa-1111-4111-8111-111111111111");
  assert.ok(ident.aliases.includes("fallen-aaaaaaaa"));
  const viaAlias = pageForSlug("fallen-aaaaaaaa", { identities: all, poolGames, bracketGames, teamStatusByTournament: {}, classNames: {} });
  const viaCanon = pageForSlug(ident.slug, { identities: all, poolGames, bracketGames, teamStatusByTournament: {}, classNames: {} });
  assert.equal(viaAlias.kind, "team");
  assert.equal(viaAlias.slug, viaCanon.slug);
});

test("links from a division go to that club, not the chooser", () => {
  const all = identities();
  const hrefMap = buildHrefMap(all, divisions);
  assert.equal(
    teamPageHref("Fallen", { divisionId: "div-shirt-mens-d", hrefMap }),
    "/teams/fallen-brayden-brooks-mens"
  );
  assert.equal(
    teamPageHref("Fallen", { divisionId: "div-heat-silver", hrefMap }),
    "/teams/fallen-bbbbbbbb"
  );
  // Pool parent is in the same family as the Silver registration.
  assert.equal(
    teamPageHref("Fallen", { divisionId: heatParent, hrefMap }),
    "/teams/fallen-bbbbbbbb"
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

test("assignPageSlugs: one manager, unique, keeps manager slug", () => {
  const rows = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Gloveworks", managerName: "Raylee Perry", gender: "womens" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Gloveworks", managerName: null, gender: "coed" },
  ];
  assignPageSlugs(rows);
  assert.equal(rows[0].slug, "gloveworks-raylee-perry");
  assert.equal(rows[1].slug, "gloveworks-22222222");
});
