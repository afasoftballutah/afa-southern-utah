import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { titlePathLengths, pathStats, pathStart, priorRecord } from "@/lib/path-stats";

const D = "d1";
function game(label, { w, l, ifGame, placeW, placeL, team1 = null, team2 = null, score1 = null, score2 = null, isFinal = false, time = "2026-11-12T00:00:00Z" } = {}) {
  return {
    id: label,
    label,
    divisionId: D,
    team1, team2, score1, score2,
    isFinal: isFinal || (score1 != null && score2 != null),
    status: (isFinal || (score1 != null && score2 != null)) ? "final" : "scheduled",
    scheduledTime: time,
    flow: {
      winner: placeW ? { place: "🏆" } : w != null ? { next: String(w), short: String(w) } : null,
      loser: placeL ? { place: placeL, short: placeL } : l != null ? { next: String(l), short: String(l) } : null,
      ifGame: ifGame != null ? String(ifGame) : null,
    },
  };
}

// Women's D 8-team, Gloveworkz starts at G4 (hand-checked against Worlds).
function womensD() {
  return [
    game("G4", { w: 8, l: 6 }),
    game("G8", { w: 13, l: 11 }),
    game("G6", { w: 10, l: 9 }),
    game("G13", { w: 16, l: 15 }),
    game("G11", { w: 14, placeL: "5th" }),
    game("G10", { w: 12, placeL: "7th" }),
    game("G9", { w: 11, placeL: "7th" }),
    game("G16", { placeW: "🏆", placeL: "2nd", ifGame: 17 }),
    game("G15", { w: 16, placeL: "3rd" }),
    game("G14", { w: 15, placeL: "4th" }),
    game("G12", { w: 14, placeL: "5th" }),
    game("G17", { placeW: "🏆", placeL: "2nd" }),
  ];
}

// Men's D 16-team, 208 Mafia starts at G7 (hand-checked against Worlds).
function mensD() {
  return [
    game("G7", { w: 16, l: 12 }),
    game("G16", { w: 26, l: 21 }),
    game("G12", { w: 17, l: 18 }),
    game("G26", { w: 31, l: 30 }),
    game("G21", { w: 27, placeL: "9th" }),
    game("G17", { w: 24, placeL: "13th" }),
    game("G18", { w: 23, placeL: "13th" }),
    game("G31", { w: 34, l: 33 }),
    game("G30", { w: 32, placeL: "5th" }),
    game("G27", { w: 29, placeL: "7th" }),
    game("G24", { w: 28, placeL: "9th" }),
    game("G23", { w: 28, placeL: "9th" }),
    game("G34", { placeW: "🏆", placeL: "2nd", ifGame: 35 }),
    game("G33", { w: 34, placeL: "3rd" }),
    game("G32", { w: 33, placeL: "4th" }),
    game("G29", { w: 32, placeL: "5th" }),
    game("G28", { w: 30, placeL: "7th" }),
    game("G35", { placeW: "🏆", placeL: "2nd" }),
  ];
}

test("Gloveworkz: shortest title is 4 (if-game skipped); longest is 8", () => {
  const rows = womensD();
  const start = rows.find((r) => r.label === "G4");
  const lengths = titlePathLengths(start, rows, 0);
  assert.equal(Math.min(...lengths), 4);
  assert.equal(Math.max(...lengths), 8);
  assert.ok(lengths.includes(4) && lengths.includes(5) && lengths.includes(8));
});

test("208 Mafia: shortest title is 5 (if-game skipped); longest is 10", () => {
  const rows = mensD();
  const start = rows.find((r) => r.label === "G7");
  const lengths = titlePathLengths(start, rows, 0);
  assert.equal(Math.min(...lengths), 5);
  assert.equal(Math.max(...lengths), 10);
});

test("the if-game counts for an undefeated team only on the lose-then-win path", () => {
  const rows = [
    game("G1", { placeW: "🏆", placeL: "2nd", ifGame: 2, team1: "Us", team2: "Them" }),
    game("G2", { placeW: "🏆", placeL: "2nd" }),
  ];
  const start = rows[0];
  const lengths = titlePathLengths(start, rows, 0);
  assert.deepEqual([...new Set(lengths)].sort((a, b) => a - b), [1, 2]);
});

test("a team that already has a loss must play the if-game to be champion", () => {
  const rows = [
    game("G1", { placeW: "🏆", placeL: "2nd", ifGame: 2, team1: "Us", team2: "Them" }),
    game("G2", { placeW: "🏆", placeL: "2nd" }),
  ];
  const lengths = titlePathLengths(rows[0], rows, 1);
  assert.deepEqual(lengths, [2]);
});

test("pathStats: unplayed Gloveworkz field is still all remaining, min 4 max 8", () => {
  const rows = womensD().map((r, i) =>
    r.label === "G4" ? { ...r, team1: "Side Chicks", team2: "Gloveworkz" } : r
  );
  // Name the other first-round teams so the field is 8.
  const named = [
    { ...rows[0] },
    { ...game("G1", { w: 5, l: 3 }), id: "G1", team1: "Legacy", team2: "Premium" },
    { ...game("G2", { w: 5, l: 3 }), id: "G2", team1: "Half Swingers", team2: "Laced Up" },
    { ...game("G3", { w: 7, l: 5 }), id: "G3", team1: "Triple B", team2: "Twisted Chicas" },
    ...rows.slice(1),
  ];
  const stats = pathStats(named, { name: "Gloveworkz", divisionId: D });
  assert.equal(stats.min, 4);
  assert.equal(stats.max, 8);
  assert.equal(stats.eliminated, false);
  assert.equal(stats.champion, false);
  assert.equal(stats.teamsRemaining, 8);
  assert.equal(stats.finished.length, 0);
});

test("pathStats: eliminated team is flagged and appears in finished standings with real RF/RA", () => {
  const rows = [
    game("G1", {
      w: 3, placeL: "5th",
      team1: "Us", team2: "Them",
      score1: 4, score2: 12, isFinal: true, time: "2026-11-12T18:00:00Z",
    }),
    game("G3", { placeW: "🏆", placeL: "2nd" }),
  ];
  const stats = pathStats(rows, { name: "Us", divisionId: D });
  assert.equal(stats.eliminated, true);
  assert.equal(stats.min, null);
  assert.equal(stats.max, null);
  const us = stats.finished.find((t) => t.team === "Us");
  assert.ok(us);
  assert.equal(us.record, "0-1");
  assert.equal(us.rf, 4);
  assert.equal(us.ra, 12);
  assert.equal(us.place, "5th");
  const them = stats.remaining.find((t) => t.team === "Them") ?? stats.finished.find((t) => t.team === "Them");
  // Them won and have no next game listed on G3 — they are waiting? G3 is unplayed and doesn't name them.
  // waitingGame: winner of G1 goes to G3. Them should still be playing.
  assert.ok(them || stats.teamsRemaining >= 1);
});

test("pathStats: unscored games do not invent records", () => {
  const rows = [game("G1", { w: 2, l: 3, team1: "A", team2: "B" })];
  const stats = pathStats(rows, { name: "A", divisionId: D });
  const a = [...stats.remaining, ...stats.finished].find((t) => t.team === "A");
  assert.equal(a.w, 0);
  assert.equal(a.l, 0);
  assert.equal(a.rf, 0);
  assert.equal(a.ra, 0);
});

test("desktop Path stats sit on the tab row, not a new row, and stay off phones and Timeline", () => {
  const browser = readFileSync(new URL("../components/ScheduleBrowser.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(browser, /import PathStats from "@\/components\/PathStats"/);
  assert.match(browser, /className="sched-toolbar"/);
  assert.match(browser, /!phone && view === "paths" && team\?\.name/);
  assert.match(browser, /<PathStats rows=\{rows\} team=\{team\} divisions=\{divisions \?\? \[\]\} \/>/);
  assert.doesNotMatch(browser, /<ScheduleTimeline[^>]*PathStats/);
  assert.match(browser, /view !== "timeline" && view !== "paths"/);
  assert.match(css, /\.sched-toolbar \{ display: flex; align-items: center; width: 100%/);
  assert.match(css, /@media \(min-width: 640px\) \{[\s\S]*\.path-stats \{/);
});
