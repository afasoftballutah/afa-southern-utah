// Schedule Timeline view, the refresh rule, and the score ticker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildTimeline, fieldDisplayName, fieldNameParts, compareFields, hourLabel, clockLabel,
  divisionTone, divisionLegend, divisionLegendGroups, sideLabel, spelledSide, statusLabel, GAME_MINUTES,
} from "@/lib/schedule-timeline";
import { gameTitle, bracketPill, matchupSide, nextStep, pillScore, gameNumberIndex, gameIdByTitle, flowTargets, compactTime, whereWhen } from "@/lib/schedule-timeline";
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
  assert.equal(clockLabel(14 * 60), "2 PM");
  assert.equal(clockLabel(14 * 60 + 30), "2:30 PM");
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
  // Finished reads the same in both brackets: solid fill; losers keep a white inner ring.
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.tl-pill\.tl-side-losers\.is-final,\s*\.tl-pill\.tl-side-if\.is-final \{ background: var\(--tone-solid\); color: #fff; \}/);
  assert.match(css, /\.tl-pill\.tl-side-losers\.is-final \{ box-shadow: inset 0 0 0 2px/);
  assert.ok(!/\.tl-pill\.tl-side-losers\.is-final \{ background: var\(--tone-bg\)/.test(css), "finished losers are not pale");
});

test("card game links: \"Game 17\" resolves to that game in the same division only", () => {
  const rows = [
    { id: "d5", divisionId: "D", label: "G5" },
    { id: "d17", divisionId: "D", label: "G17" },
    { id: "e17", divisionId: "E", label: "G17" },
    { id: "p", divisionId: "D", label: "Pool A" },
  ];
  const idx = gameNumberIndex(rows);
  assert.equal(gameIdByTitle(idx, "D", "Game 17"), "d17");
  assert.equal(gameIdByTitle(idx, "E", "Game 17"), "e17");
  assert.equal(gameIdByTitle(idx, "D", "Game 99"), null);
  assert.equal(gameIdByTitle(idx, "D", "TBD"), null);
  // flowTargets still reads through the same index
  const t = flowTargets([{ ...rows[0], flow: { winner: { next: 17 }, loser: null } }, rows[1]]);
  assert.equal(t.get("d5").winner, "d17");
});

test("card game links: feeders, destinations and If Game are links; team names are not", () => {
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  assert.match(src, /aria-label=\{`Open \$\{title\}`\}/);
  assert.match(src, /<span className="tl-board__from">\{r\.from\}<\/span> <GameLink title=\{r\.game\}/);
  assert.match(src, /<GameLink title=\{step\.next\}/);
  assert.match(src, /If <GameLink title=\{`Game \$\{ifGame\}`\}/);
  assert.match(src, /<span className="tl-board__team">\{r\.team\}<\/span>/, "real team names stay plain text");
  // opening a linked game goes through the same reveal as tapping its pill
  const open = src.slice(src.indexOf("const openGame = (id) =>"), src.indexOf("const openGame = (id) =>") + 400);
  assert.match(open, /scrollIntoView/);
  assert.match(open, /setOpenId\(id\)/);
  assert.match(open, /reveal\(el, targets\.get\(id\), feedersOf\(id\)\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.tl-link \{[^}]*cursor: pointer/);
  assert.match(css, /\.tl-link:focus-visible/);
});

test("times drop :00 on the hour, keep other minutes", () => {
  assert.equal(compactTime("Thu 4:00 PM PST"), "Thu 4 PM PST");
  assert.equal(compactTime("Fri 10:00 AM"), "Fri 10 AM");
  assert.equal(compactTime("Thu 4:30 PM PST"), "Thu 4:30 PM PST");
  assert.equal(compactTime("Sat 12:05 PM"), "Sat 12:05 PM");
  assert.equal(compactTime(null), null);
});

test("next-game line: day, time without zone, full field name; nothing without both", () => {
  assert.equal(whereWhen({ timeLabel: "Thu 4:00 PM PST", field: "H3" }), "Thu 4 PM \u00b7 Hunter F3");
  assert.equal(whereWhen({ timeLabel: "Fri 9:30 AM PST", field: "P-F1" }), "Fri 9:30 AM \u00b7 Pioneer F1");
  assert.equal(whereWhen({ timeLabel: "Sat 1:00 PM", field: "P2" }), "Sat 1 PM \u00b7 Pioneer F2");
  assert.equal(whereWhen({ timeLabel: null, field: "H1" }), null);
  assert.equal(whereWhen({ timeLabel: "Thu 4:00 PM PST", field: null }), null);
  assert.equal(whereWhen(undefined), null);
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  assert.match(src, /loserStep\?\.next && where\?\.loser/, "loser line only for a real next game (not Out)");
  assert.match(src, /winnerStep\?\.next && where\?\.winner/);
  assert.match(src, /where\?\.ifGame/);
  // in brackets, red under the loser and green under the winner, like the arrows
  assert.match(src, /tl-next__where--loser">\{`\(\$\{where\.loser\}\)`\}/);
  assert.match(src, /tl-next__where--winner">\{`\(\$\{where\.winner\}\)`\}/);
  assert.match(src, /\{` \(\$\{where\.ifGame\}\)`\}/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.tl-next dd\.tl-next__where--loser \{ color: #dc2626; \}/);
  assert.match(css, /\.tl-next dd\.tl-next__where--winner \{ color: #15803d; \}/);
  assert.match(src, /<dd>\{compactTime\(game\.timeLabel\)\}<\/dd>/, "card Time row drops :00");
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
    { divisionName: "Men's D" }, { divisionName: "Women's E" }, { divisionName: "Coed Rec" },
    { divisionName: "Coed D" }, { divisionName: "Gold" },
  ]);
  assert.deepEqual(groups.map((g) => [g.group, g.short, g.items.map((d) => d.short)]), [
    ["Men's", "Men", ["D", "E"]],
    ["Women's", "Women", ["D", "E", "Rec"]],
    ["Coed", "Coed", ["D", "Rec"]],
    [null, null, ["Gold"]],
  ]);
  assert.equal(groups[1].items[2].tone, "womens-rec");
  assert.equal(groups[1].items[2].name, "Women's Rec");
});

test("timeline header: two-row Men/Women/Coed key, explainers behind a help button", () => {
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(src, /g\.short \?\? g\.group/, "chips show Men, Women, Coed");
  assert.match(src, /function TimelineHelp/);
  assert.match(src, /aria-label="How to read the timeline"/);
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /pointerdown/);
  assert.match(src, /id="tl-help"/);
  assert.match(src, /createPortal\(/);
  assert.match(src, /W5 = winner of game 5/);
  assert.ok(!src.includes("tl-key__winners"), "no Winners/Losers legend row");
  assert.ok(!src.includes("Games {team.name} could still play"), "no could-still-play annotation");
  assert.ok(!src.includes("Corners:"), "no Corners explainer on the header");
  assert.ok(!/tl-key/.test(css), "old key styles are gone");
  const nameRule = /\.tl-legend__group-name \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(css, /--tl-legend-label-h: 0\.625rem/, "labels smaller than the chips");
  assert.match(nameRule, /font-size: var\(--tl-legend-label-h\)/);
  assert.match(nameRule, /font-weight: 500/, "labels lighter than the chips");
  assert.match(nameRule, /color: var\(--tl-label\)/, "labels are gray, not chip-colored");
  assert.match(nameRule, /text-align: center/, "label centered over its chips");
  assert.match(css, /\.tl-legend__group \{[^}]*flex-direction: column/, "a column per group: label over chips");
  assert.match(css, /\.tl-legend__group \{[^}]*align-items: center/, "label and chips centered in the column");
  assert.match(css, /\.tl-legend__group \{[^}]*flex: 0 0 auto/, "groups are content-width, not equal columns");
  assert.match(css, /\.tl-legend__gap \{[^}]*flex: 1 1 0/, "equal flex gaps put each ball at the midpoint");
  assert.match(css, /\.tl-legend \{[^}]*justify-content: space-between/, "spread with equal gaps across the row");
  assert.match(css, /\.tl-head \{[^}]*justify-content: space-between/, "? at the end of the row");
  assert.match(css, /\.tl-head \{[^}]*align-items: center/, "? vertically centered on the two-row block");
  assert.match(css, /\.tl-head \{[^}]*width: 100%/, "spreads across the row, not clumped left");
  assert.match(src, /document\.querySelector\("\.sched-seg"\)/, "key width matches the tabs bar");
  const groups = divisionLegendGroups([
    { divisionName: "Men's D" }, { divisionName: "Women's D" }, { divisionName: "Coed D" },
  ]);
  assert.deepEqual(groups.map((g) => g.short), ["Men", "Women", "Coed"]);
  assert.match(css, /\.tl-help\.is-sheet \{[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.tl-help \{[^}]*position: fixed/);
  assert.match(css, /button\.tl-help__btn:not\(\.pill\) \{[^}]*width: 1\.5rem; height: 1\.5rem; min-height: 0/, "help button is a 24px circle");
  assert.match(src, /function SoftballMark/);
  assert.match(src, /className="tl-legend__gutter"[^>]*>\s*<SoftballMark \/>/, "a ball in the gutter between groups, not at the ends");
  assert.match(src, /className="tl-legend__ball"[^>]*aria-hidden="true"/);
  assert.match(css, /\.tl-legend__ball \{[^}]*width: 9px/);

  assert.match(css, /\.tl-legend__chip \{[^}]*font-size: 0\.6875rem/, "chip text stays 11px");
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

test("Coed D and Women's Rec never share a color (they share Saturday's fields)", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const solid = (k) => new RegExp(`\\.tl-tone-${k} \\{[^}]*--tone-solid: (#[0-9a-f]{6})`).exec(css)?.[1];
  const worlds = ["mens-d", "mens-e", "womens-d", "womens-e", "womens-rec", "coed-d"].map(solid);
  assert.equal(new Set(worlds).size, 6);
  assert.equal(solid("coed-d"), "#7c3aed");
  assert.equal(solid("womens-rec"), "#db2777");
});

test("open game: dotted arrows and dotted rings for where the teams came from, green won / red lost", () => {
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(src, /if \(t\.winner === id\) out\.push\(\{ id: src, role: "winner" \}\)/);
  assert.match(src, /if \(t\.loser === id\) out\.push\(\{ id: src, role: "loser" \}\)/);
  assert.match(src, /tl-arrow--dotted/);
  assert.match(src, /`from \$\{say\(f\.id\)\}`/);
  assert.match(src, /"is-src-win" : "is-src-lose"/);
  assert.match(css, /\.tl-arrow--dotted \{[^}]*stroke-dasharray/);
  assert.match(css, /\.tl-pill\.is-src-win \{[^}]*dotted rgb\(34 197 94/);
  assert.match(css, /\.tl-pill\.is-src-lose \{[^}]*dotted rgb\(239 68 68/);
  // sleek: thin fine-dotted line, one fixed-size swept arrowhead family
  assert.match(css, /\.tl-arrow--dotted \{ stroke-width: 1\.5; stroke-dasharray: 2 3; \}/);
  assert.match(src, /markerUnits="userSpaceOnUse"/);
  assert.match(src, /tl-head-\$\{role\}-dotted/);
  // phone: room under the page so a last-day game can be lifted clear of the sheet
  assert.match(src, /classList\.add\("tl-sheet-open"\)/);
  assert.match(css, /body\.tl-sheet-open \{ padding-bottom: 70vh; \}/);
});

test("field headers split the park and the field number onto two lines", () => {
  assert.deepEqual(fieldNameParts("Hunter F1"), { park: "Hunter", field: "F1" });
  assert.deepEqual(fieldNameParts("Pioneer F3"), { park: "Pioneer", field: "F3" });
  assert.deepEqual(fieldNameParts("Hunter F10"), { park: "Hunter", field: "F10" });
  assert.deepEqual(fieldNameParts("Field 4"), { park: "Field 4", field: null });
});

test("timeline is vertical on phones only; desktop keeps the horizontal lanes", () => {
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(src, /PHONE_VERTICAL_QUERY = "\(max-width: 639px\)"/);
  assert.match(src, /matchMedia\(PHONE_VERTICAL_QUERY\)/);
  assert.match(src, /className="tl-vboard"/);
  assert.match(src, /className="tl-vhead"/);
  assert.match(src, /fieldNameParts/);
  assert.match(src, /tl-vfield\$\{i % 2 === 0 \? " tint" : ""\}/);
  assert.match(src, /className="tl-coltint"/);
  assert.match(src, /\{day\.title\} \{day\.date\} · \{day\.count\} game/);
  assert.match(src, /className="tl-vtime"/);
  assert.match(src, /top: \(game\.offset \/ 60\) \* ROW_PX/);
  assert.match(src, /"--tl-hour": `\$\{ROW_PX\}px`/, "phone rows use ROW_PX, not the desktop hour width");
  assert.match(src, /const HOUR_PX = 92/, "desktop hour columns stay 92px");
  assert.match(src, /const ROW_PX = 52/);
  // Desktop layout is unchanged.
  assert.match(src, /className="tl-row tl-row--axis"/);
  assert.match(src, /className="tl-grid"/);
  assert.match(src, /className="tl-field tl-field--corner"/);
  assert.match(src, /left: \(game\.offset \/ 60\) \* HOUR_PX/);
  assert.match(css, /\.tl-grid \{/);
  assert.match(css, /\.tl-row \{ display: flex; height: 3\.25rem/);
  assert.match(css, /button\.tl-pill \{[^}]*top: 0\.25rem; height: 2\.75rem/);
  assert.match(css, /\.tl-bgstar \{[^}]*width: 2\.375rem/);
  assert.match(css, /\.tl-vhead \{[^}]*position: sticky/);
  assert.match(css, /\.tl-vhead \{[^}]*padding: 0\.3rem 0 0/, "no gap under the field names");
  assert.match(css, /\.tl-coltint \{[^}]*background: rgba\(0, 0, 0, 0\.025\)/);
  assert.match(css, /\.tl-vfield\.tint \{[^}]*background: rgba\(0, 0, 0, 0\.025\)/);
  assert.match(css, /--tl-time-w: 40px/);
  assert.match(css, /grid-template-columns: var\(--tl-time-w\) repeat\(var\(--tl-fields\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tl-vtimes \{[^}]*position: sticky; left: 0/);
  // Compact typography is scoped to the phone board, so desktop pills stay as they were.
  assert.match(css, /\.tl-vboard button\.tl-pill \{/);
  // The "?" sheet explains a pill, not the grid's orientation, so it stays as it is.
  const help = src.slice(src.indexOf("function TimelineHelp"));
  assert.match(help, /How to read a game/);
  assert.ok(!/hours across/.test(help), "help sample does not depict the old horizontal grid");
});

test("tapping another pill must not close the open game first (JD: click 34 jumps to 26)", () => {
  const src = readFileSync(new URL("../components/ScheduleTimeline.js", import.meta.url), "utf8");
  // The document pointerdown closer lives in the open-game effect (tl-pop-${openId}).
  assert.match(
    src,
    /document\.getElementById\(`tl-pop-\$\{openId\}`\)[\s\S]{0,500}?e\.target\.closest\?\.\("\.tl-pill"\)/,
  );
});
