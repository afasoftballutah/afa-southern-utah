// Schedule Timeline view, the refresh rule, and the score ticker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildTimeline, fieldDisplayName, compareFields, hourLabel, clockLabel,
  divisionTone, divisionLegend, divisionLegendGroups, sideLabel, spelledSide, statusLabel, GAME_MINUTES,
} from "@/lib/schedule-timeline";
import { shouldRefreshOnReturn, RETURN_REFRESH_AFTER_MS } from "@/lib/refresh-on-return";
import { tickerItem } from "@/lib/score-ticker";

const TZ = "America/Los_Angeles";
const row = (id, field, iso, extra = {}) => ({
  id, field, scheduledTime: iso, divisionName: "Men's D", divisionId: "md", label: `G${id}`,
  team1: null, team2: null, ...extra,
});

test("H is Hunter and P is Pioneer; spelled-out names stay as they are", () => {
  assert.equal(fieldDisplayName("H1"), "Hunter F1");
  assert.equal(fieldDisplayName("P 2"), "Pioneer F2");
  assert.equal(fieldDisplayName("pf3"), "Pioneer F3");
  assert.equal(fieldDisplayName("Hunter F1"), "Hunter F1");
  assert.equal(fieldDisplayName("Field 4"), "Field 4");
  const order = ["Pioneer F2", "Hunter F3", "Pioneer F1", "Hunter F1", "Hunter F2", "Pioneer F10"].sort(compareFields);
  assert.deepEqual(order, ["Hunter F1", "Hunter F2", "Hunter F3", "Pioneer F1", "Pioneer F2", "Pioneer F10"]);
});

test("one panel per day in PST, lanes per field, games placed by their local start", () => {
  const rows = [
    row(1, "Hunter F1", "2026-11-12T21:00:00Z"), // Thu 1 PM PST
    row(2, "Pioneer F2", "2026-11-13T03:00:00Z"), // Thu 7 PM PST
    row(3, "Hunter F1", "2026-11-13T16:00:00Z"), // Fri 8 AM PST
    row(4, "Hunter F1", "2026-11-13T17:00:00Z"), // Fri 9 AM PST
  ];
  const tl = buildTimeline(rows, TZ);
  assert.deepEqual(tl.days.map((d) => [d.title, d.date, d.startHour, d.endHour, d.count]), [
    ["Thursday", "Nov 12", 13, 20, 2],
    ["Friday", "Nov 13", 8, 10, 2],
  ]);
  assert.deepEqual(tl.fields, ["Hunter F1", "Pioneer F2"]);
  const thu = tl.days[0];
  assert.deepEqual(thu.lanes.map((l) => l.field), ["Hunter F1", "Pioneer F2"], "every field has a lane every day");
  assert.equal(thu.lanes[0].games[0].offset, 0);
  assert.equal(thu.lanes[1].games[0].offset, 6 * 60);
  assert.equal(thu.lanes[1].games[0].length, GAME_MINUTES);
  assert.deepEqual(tl.days[1].lanes[1].games, [], "Pioneer F2 is empty on Friday");
  assert.deepEqual(tl.overlaps, []);
});

test("every game appears exactly once; no time or field → listed, not dropped", () => {
  const rows = [
    row(1, "Hunter F1", "2026-11-12T21:00:00Z"),
    row(2, null, "2026-11-12T21:00:00Z"),
    row(3, "Hunter F2", null),
  ];
  const tl = buildTimeline(rows, TZ);
  const placed = tl.days.flatMap((d) => d.lanes.flatMap((l) => l.games.map((g) => g.id)));
  assert.deepEqual(placed, [1]);
  assert.deepEqual(tl.unplaced.map((r) => r.id), [2, 3]);
});

test("two games on one field less than an hour apart are reported", () => {
  const tl = buildTimeline([
    row(1, "Hunter F1", "2026-11-13T16:00:00Z"),
    row(2, "Hunter F1", "2026-11-13T16:30:00Z"),
  ], TZ);
  assert.equal(tl.overlaps.length, 1);
});

test("hour and clock labels", () => {
  assert.deepEqual([0, 8, 12, 13, 23].map(hourLabel), ["12 AM", "8 AM", "12 PM", "1 PM", "11 PM"]);
  assert.equal(clockLabel(14 * 60), "2:00 PM");
});

test("division colours by gender and level; legend Men's, Women's, Coed", () => {
  assert.equal(divisionTone("Men's D"), "mens-d");
  assert.equal(divisionTone("Men's E"), "mens-e");
  assert.equal(divisionTone("Women's D"), "womens-d");
  assert.equal(divisionTone("Women's E"), "womens-e");
  assert.equal(divisionTone("Women's Rec"), "womens-rec");
  assert.equal(divisionTone("Coed E"), "coed-e");
  assert.equal(divisionTone("Gold"), "other");
  const legend = divisionLegend([
    { divisionName: "Women's Rec" }, { divisionName: "Men's E" }, { divisionName: "Women's D" },
    { divisionName: "Men's D" }, { divisionName: "Women's E" }, { divisionName: "Men's D" },
  ]);
  assert.deepEqual(legend.map((d) => d.name), ["Men's D", "Men's E", "Women's D", "Women's E", "Women's Rec"]);
});

test("a side shows the team, or the game it waits on (W-G3), never null", () => {
  assert.deepEqual(sideLabel({ team1: "Legacy" }, 1), { text: "Legacy", known: true });
  assert.deepEqual(sideLabel({ team1: null, team1From: "Winner of Game 3" }, 1), { text: "W-G3", known: false });
  assert.deepEqual(sideLabel({ team2: "Loser of Game 12" }, 2), { text: "L-G12", known: false });
  assert.deepEqual(sideLabel({}, 2), { text: "TBD", known: false });
  assert.equal(statusLabel({ isFinal: true }), "Final");
  assert.equal(statusLabel({ status: "pending" }), "Scheduled");
});

test("refresh rule: only on coming back after more than a minute hidden", () => {
  const t = 1_000_000;
  assert.equal(RETURN_REFRESH_AFTER_MS, 60_000);
  assert.equal(shouldRefreshOnReturn(t, t + 60_001), true);
  assert.equal(shouldRefreshOnReturn(t, t + 60_000), false, "exactly a minute is not more than a minute");
  assert.equal(shouldRefreshOnReturn(t, t + 5_000), false, "a quick app switch does nothing");
  assert.equal(shouldRefreshOnReturn(null, t), false, "never hidden → nothing");
});

test("nothing in the app polls: no timers or subscriptions in the timeline, ticker, or refresh", async () => {

  for (const f of ["components/ScheduleTimeline.js", "components/ScoreTicker.js", "components/RefreshOnReturn.js", "components/TournamentTicker.js"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/setInterval|setTimeout|\.channel\(|subscribe\(/.test(src), `${f} must not poll or subscribe`);
  }
});

test("ticker item: division + game, both sides with scores, winner marked", () => {
  const it = tickerItem({ id: "x", divisionName: "Women's D", label: "G1", team1: "Legacy", team2: "Laced Up", score1: 12, score2: 9 });
  assert.equal(it.head, "Women's D G1");
  assert.deepEqual(it.sides, [
    { name: "Legacy", score: 12, won: true },
    { name: "Laced Up", score: 9, won: false },
  ]);
});

test("details spell out the game a side waits on", () => {
  assert.equal(spelledSide("W-G3"), "Winner of G3");
  assert.equal(spelledSide("L-G12"), "Loser of G12");
  assert.equal(spelledSide("Legacy"), "Legacy");
  assert.equal(spelledSide("TBD"), "TBD");
});

test("legend groups by gender so Men's / Women's is written once", () => {
  const groups = divisionLegendGroups([
    { divisionName: "Women's Rec" }, { divisionName: "Men's E" }, { divisionName: "Women's D" },
    { divisionName: "Men's D" }, { divisionName: "Women's E" }, { divisionName: "Gold" },
  ]);
  assert.deepEqual(groups.map((g) => [g.group, g.items.map((d) => d.short)]), [
    ["Men's", ["D", "E"]],
    ["Women's", ["D", "E", "Rec"]],
    [null, ["Gold"]],
  ]);
  assert.equal(groups[1].items[2].tone, "womens-rec");
  assert.equal(groups[1].items[2].name, "Women's Rec");
});

test("finishing places in the corners are bold italic text, not boxed; next games stay plain", () => {
  const src = readFileSync(path.join(import.meta.dirname, "..", "components", "ScheduleTimeline.js"), "utf8");
  const css = readFileSync(path.join(import.meta.dirname, "..", "app", "globals.css"), "utf8");
  assert.ok(!src.includes("tl-place-chip") && !css.includes("tl-place-chip"));
  const rule = /\.tl-corner-place \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /font-weight: 700/);
  assert.match(rule, /font-style: italic/);
  assert.doesNotMatch(rule, /border/);
});
