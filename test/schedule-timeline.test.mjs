// Schedule Timeline view, the refresh rule, and the score ticker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildTimeline, fieldDisplayName, compareFields, hourLabel, clockLabel,
  divisionTone, divisionLegend, divisionLegendGroups, sideLabel, spelledSide, statusLabel, GAME_MINUTES,
} from "@/lib/schedule-timeline";
import { gameTitle, bracketPill, matchupSide, nextStep, pillScore } from "@/lib/schedule-timeline";
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

test("iPhone: the game card is a sheet fixed to the screen, not inside the scrolling day card", () => {
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // The card must leave .tl-scroll: iOS Safari pins position:fixed children of an overflow scroller to it.
  const details = src.slice(src.indexOf("function Details("), src.indexOf("function FlowArrows("));
  assert.match(details, /return createPortal\(/, "Details renders through a portal");
  assert.match(details, /<\/div>,\s*document\.body,\s*\);/, "portal target is <body>");
  // Phones by width, and touch phones held sideways.
  const q = src.match(/PHONE_SHEET_QUERY = "([^"]+)"/)?.[1] ?? "";
  assert.match(q, /\(max-width: 639px\)/);
  assert.match(q, /\(pointer: coarse\)/);
  assert.match(src, /matchMedia\(PHONE_SHEET_QUERY\)/);
  // No legacy touch-scrolling layer on the day lane; sheet clears Safari's toolbar and scrolls itself.
  const lane = css.match(/\.tl-scroll \{[^}]*\}/)?.[0] ?? "";
  assert.ok(lane && !/-webkit-overflow-scrolling/.test(lane), ".tl-scroll has no -webkit-overflow-scrolling");
  const sheet = css.match(/\.tl-pop\.is-sheet \{[^}]*\}/)?.[0] ?? "";
  assert.match(sheet, /bottom: 0/);
  assert.match(sheet, /safe-area-inset-bottom/);
  assert.match(sheet, /max-height: 85dvh/);
  assert.match(css, /\.tl-pop \{[^}]*position: fixed/);
});

test("finished pill shows its score, winner's runs first; nothing until final with both scores", () => {
  assert.deepEqual(pillScore({ isFinal: true, score1: 12, score2: 8, winnerSlot: "team1" }), { text: "12\u20138", winner: "team1" });
  assert.deepEqual(pillScore({ status: "final", score1: 9, score2: 14, winnerSlot: "team2" }), { text: "14\u20139", winner: "team2" });
  // winner_slot missing: from the score
  assert.deepEqual(pillScore({ isFinal: true, score1: 3, score2: 10 }), { text: "10\u20133", winner: "team2" });
  assert.equal(pillScore({ isFinal: false, score1: 5, score2: 4 }), null);
  assert.equal(pillScore({ isFinal: true, score1: 5, score2: null }), null);
  assert.equal(pillScore({ isFinal: true, score1: 0, score2: 0 }), null);
  assert.deepEqual(pillScore({ isFinal: true, score1: 0, score2: 7, winnerSlot: "team2" }), { text: "7\u20130", winner: "team2" });
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  assert.match(src, /tl-pill__score/, "pill renders the score");
  assert.match(src, /tl-pill__gno/, "game number stays on the pill");
  const data = readFileSync(new URL("../lib/data.js", import.meta.url), "utf8");
  assert.match(data, /winnerSlot: g\.winner_slot/, "schedule rows carry winner_slot");
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
  // The trophy stays upright.
  assert.match(src, /x\.place === "🏆" \? " is-cup"/);
  assert.match(/\.tl-corner-place\.is-cup \{([^}]*)\}/.exec(css)?.[1] ?? "", /font-style: normal/);
});

test("opened pill: Game N and a short bracket pill, no status word", () => {
  assert.equal(gameTitle("G33"), "Game 33");
  assert.equal(gameTitle("Pool A"), "Pool A");
  assert.equal(bracketPill({ bracketSide: "losers" }).text, "L");
  assert.equal(bracketPill({ bracketSide: "winners" }).text, "W");
  assert.deepEqual(bracketPill({ bracketSide: "final" }), { text: "★ Final", label: "Championship", gold: true });
  assert.equal(bracketPill({ bracketSide: "if" }).text, "★ If nec.");
  assert.equal(bracketPill({}), null);
});

test("opened pill matchup: a known team, else the game it waits on as 'Loser of' + 'Game 31'", () => {
  assert.deepEqual(matchupSide({ team1: "Legacy" }, 1), { team: "Legacy" });
  const row = { team1: null, team2: null, flow: { from: [{ short: "L31", words: "Loser of Game 31" }, { short: "W32", words: "Winner of Game 32" }] } };
  assert.deepEqual(matchupSide(row, 1), { from: "Loser of", game: "Game 31" });
  assert.deepEqual(matchupSide(row, 2), { from: "Winner of", game: "Game 32" });
  assert.deepEqual(matchupSide({ team1: null, team1From: "Winner of Game 3" }, 1), { from: "Winner of", game: "Game 3" });
  assert.deepEqual(matchupSide({}, 2), { pending: "TBD" });
});

test("opened pill what's next: Game N, Out · place, 2nd, champion", () => {
  assert.deepEqual(nextStep({ short: "34", next: "34" }, "winner"), { next: "Game 34" });
  assert.deepEqual(nextStep({ short: "3rd", place: "3rd" }, "loser"), { out: true, place: "3rd" });
  assert.deepEqual(nextStep({ short: "2nd", place: "2nd" }, "loser"), { place: "2nd" });
  assert.deepEqual(nextStep({ short: "🏆", place: "🏆" }, "winner"), { champion: true });
  assert.deepEqual(nextStep({ short: "pool" }, "loser"), { text: "Survivor pool" });
  assert.equal(nextStep(null, "loser"), null);
});
