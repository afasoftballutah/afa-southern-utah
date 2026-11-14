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
  assert.match(helper, /revalidatePath\(`\/tournaments\/\$\{s\}`, "layout"\)/);
  assert.match(helper, /revalidatePath\("\/tournaments"\)/);
  assert.match(helper, /revalidatePath\("\/"\)/);
});
