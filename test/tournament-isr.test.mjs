import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isBracketLive,
  isBracketLiveFromResults,
  resolveIsPast,
} from "@/lib/tournament-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("safety fallback is 24 hours, not a short TTL", () => {
  const src = read("lib/tournament-isr.js");
  assert.match(src, /export const SAFETY_REVALIDATE = 86400/);
});

test("tournament, schedule, and division pages are ISR with generateStaticParams", () => {
  const pages = {
    "app/tournaments/[slug]/page.js": "tournamentSlugParams",
    "app/tournaments/[slug]/schedule/page.js": "tournamentSlugParams",
    "app/tournaments/[slug]/division/[divisionId]/page.js": "tournamentDivisionParams",
  };
  for (const [file, helper] of Object.entries(pages)) {
    const src = read(file);
    assert.match(src, /export const revalidate = 86400/, file);
    assert.match(src, new RegExp(`export const generateStaticParams = ${helper}`), file);
    assert.doesNotMatch(src, /export const revalidate = 30/, file);
    assert.doesNotMatch(src, /EXPERIMENT/, file);
  }
});

test("home and team pages use the 24h safety fallback, not a 30s timer", () => {
  const home = read("app/page.js");
  assert.match(home, /export const revalidate = 86400/);
  assert.doesNotMatch(home, /export const revalidate = 30/);

  const team = read("app/teams/[slug]/page.js");
  assert.match(team, /export const revalidate = 86400/);
  assert.match(team, /export const generateStaticParams = teamPageParams/);
  assert.doesNotMatch(team, /export const revalidate = 30/);
});

test("division server page does not use Date.now for the tab that ships to the client", () => {
  const src = read("app/tournaments/[slug]/division/[divisionId]/page.js");
  // Generate-time initial is allowed; request-time live must not be the prop.
  assert.match(src, /initialBracketLive=\{initialBracketLive\}/);
  assert.match(src, /bracketSignals=\{bracketSignals\}/);
  assert.doesNotMatch(src, /bracketLive=\{/);
});

test("isBracketLive is results-or-clock; initial from results ignores the clock", () => {
  const pending = [{ status: "pending", scheduledTime: "2026-11-01T16:00:00.000Z" }];
  const scored = [{ status: "final", scheduledTime: "2026-12-01T16:00:00.000Z" }];
  assert.equal(isBracketLiveFromResults(pending), false);
  assert.equal(isBracketLiveFromResults(scored), true);
  assert.equal(isBracketLive(pending, new Date("2026-10-31T00:00:00Z")), false);
  assert.equal(isBracketLive(pending, new Date("2026-11-01T17:00:00Z")), true);
  assert.equal(isBracketLive(scored, new Date("2026-01-01T00:00:00Z")), true);
});

test("resolveIsPast latches: a past tournament never shows as future", () => {
  const ended = { start_date: "2026-07-24", end_date: "2026-07-26", timezone: "America/Denver" };
  const future = { start_date: "2026-12-01", end_date: "2026-12-03", timezone: "America/Denver" };
  const after = new Date("2026-08-01T18:00:00Z");
  const before = new Date("2026-07-01T18:00:00Z");
  const stillBefore = new Date("2026-11-01T18:00:00Z");

  assert.equal(resolveIsPast(ended, { now: after }), true);
  assert.equal(resolveIsPast(ended, { now: before }), false);
  assert.equal(resolveIsPast(ended, { initialIsPast: true, now: before }), true);
  assert.equal(resolveIsPast(future, { finished: true, now: stillBefore }), true);
  assert.equal(resolveIsPast(future, { now: stillBefore }), false);
  // Clock cannot undo a generate-time or results latch.
  assert.equal(resolveIsPast(future, { initialIsPast: true, now: stillBefore }), true);
});

const SCORE_PATHS = [
  ["app/api/scorekeeper/games/[id]/score/route.js", "{ gameId: id }", 2],
  ["app/api/scorekeeper/pool-games/[id]/score/route.js", "{ poolGameId: id }", 2],
  ["app/api/scorekeeper/games/[id]/route.js", "{ gameId: id }", 1],
  ["app/api/scorekeeper/placements/route.js", "{ divisionId }", 1],
  ["lib/sync-quickscores.js", "divisionIds:", 1],
];

test("every score, clear, placement, and QuickScores path revalidates tournament pages", () => {
  for (const [file, needle, times] of SCORE_PATHS) {
    const src = read(file);
    assert.match(src, /revalidateTournamentPages/, file);
    const count = src.split("revalidateTournamentPages(").length - 1;
    assert.equal(count, times, `${file} should call revalidateTournamentPages ${times} time(s)`);
    assert.match(src, needle instanceof RegExp ? needle : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), file);
  }
  const helper = read("lib/tournament-isr.js");
  // Literal paths omit type — "layout" on a concrete slug was a no-op
  // because app/tournaments/[slug] has no layout.js.
  assert.match(helper, /revalidatePath\(`\/tournaments\/\$\{s\}`\)/);
  assert.match(helper, /revalidatePath\(`\/tournaments\/\$\{s\}\/schedule`\)/);
  assert.match(helper, /revalidatePath\(`\/tournaments\/\$\{s\}\/division\/\$\{id\}`\)/);
  assert.doesNotMatch(helper, /revalidatePath\(`\/tournaments\/\$\{s\}`, "layout"\)/);
  assert.match(helper, /revalidatePath\("\/tournaments\/\[slug\]", "layout"\)/);
  assert.match(helper, /revalidatePath\("\/tournaments\/\[slug\]", "page"\)/);
  assert.match(helper, /revalidatePath\("\/tournaments\/\[slug\]\/schedule", "page"\)/);
  assert.match(helper, /revalidatePath\("\/tournaments\/\[slug\]\/division\/\[divisionId\]", "page"\)/);
  assert.match(helper, /revalidatePath\("\/tournaments"\)/);
  assert.match(helper, /revalidatePath\("\/"\)/);
  assert.match(helper, /revalidatePath\("\/teams\/\[slug\]", "page"\)/);
  assert.match(helper, /revalidateTag\("team-pages"\)/);
});

const WRITE_PATHS = [
  ...SCORE_PATHS,
  ["app/api/scorekeeper/bracket/generate/route.js", "{ divisionId }", 3],
  ["app/api/scorekeeper/seed/route.js", "{ slug: tournamentSlug }", 2],
  ["app/api/register/route.js", "{ tournamentId, divisionId }", 1],
  ["app/api/scorekeeper/registrations/[id]/route.js", "tournamentId: before.tournament_id", 1],
];

test("every public-page write path besides scores also revalidates", () => {
  for (const [file, needle, times] of WRITE_PATHS) {
    const src = read(file);
    assert.match(src, /revalidateTournamentPages/, file);
    const count = src.split("revalidateTournamentPages(").length - 1;
    assert.equal(count, times, `${file} should call revalidateTournamentPages ${times} time(s)`);
    assert.match(
      src,
      needle instanceof RegExp ? needle : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      file
    );
  }
  const patch = read("app/api/scorekeeper/games/[id]/route.js");
  assert.match(patch, /revalidateTournamentPages\(\{ gameId: id \}\)/);
  assert.doesNotMatch(patch, /if \("team1_score" in patch/);

  const helper = read("lib/tournament-isr.js");
  assert.match(helper, /if \(tournamentId\)/);
});

const DIRECTORY_PUBLIC_ACTIONS = [
  "moveRegistration",
  "createTournament",
  "updateTournament",
  "applyDivisionSetup",
  "deleteTournament",
  "setPoster",
  "addDivision",
  "createRegistration",
  "addTeams",
  "setDivisionPlayDay",
  "setTournamentPlayDays",
  "setDivisionMinimums",
  "renameTeam",
  "setDivisionSeedOrder",
  "createPoolRoundRobin",
  "removePoolPlay",
  "addHandGame",
  "applySheetDraft",
  "deleteHandGame",
  "setHandGameNumber",
];

test("directory actions that change public tournament pages revalidate before they return ok", () => {
  const src = read("app/api/scorekeeper/directory/route.js");
  for (const action of DIRECTORY_PUBLIC_ACTIONS) {
    const re = new RegExp(String.raw`case "${action}":(?:(?!case ")[\s\S])*revalidateTournamentPages`);
    assert.match(src, re, `${action} should call revalidateTournamentPages in its case`);
  }
  // Two poster writes (clear + set); every other listed action once.
  assert.equal(src.split("revalidateTournamentPages(").length - 1, 21);
});

test("getTournamentBySlug and getDivisionById are wrapped in React cache", () => {
  const src = read("lib/data.js");
  assert.match(src, /export const getTournamentBySlug = cache\(async function getTournamentBySlug/);
  assert.match(src, /export const getDivisionById = cache\(async function getDivisionById/);
  assert.match(src, /export const getRecentCompletedTournaments = cache\(/);
  assert.match(src, /export const getRecentResultTournaments = cache\(/);
  assert.match(src, /export const getSeasonListByRegion = cache\(/);
});

test("team-page data does not nest tournaments(*) on every game row", () => {
  const src = read("lib/team-page-data.js");
  assert.doesNotMatch(src, /tournaments \( \* \)/);
  assert.match(src, /attachTournamentsToGames/);
  assert.match(src, /unstable_cache\(loadRaw/);
  assert.match(src, /tags: \["team-pages"\]/);
  assert.match(src, /export async function teamPageParams/);
});
