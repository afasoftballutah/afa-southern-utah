import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFieldTime, gameWhenShort, compactGameCaption } from "@/lib/bracket/tree";
import {
  formatLeagueShortTime,
  formatGameWhenInput,
  parseGameWhenInput,
} from "@/lib/league-time";
import { icsTimestamp } from "@/lib/ics-time";
import { tournamentTermsLines } from "@/lib/tournament-terms";
import {
  LEAGUE_TZ,
  resolveTimeZone,
  tournamentTimeZone,
  zoneLabel,
  tournamentZoneLabel,
} from "@/lib/zone";

// tournaments.timezone (2026-11-08): the AFA World Series is in Mesquite, NV
// (Pacific). Its games are stored as true Pacific instants and every screen
// shows them in Pacific with the zone's name. Every other tournament has no
// timezone and must render exactly as before — no label, Denver clock.

const PACIFIC = "America/Los_Angeles";
// G1, Thu Nov 12 2026, 2 PM in Mesquite = 22:00Z = 3 PM in St. George.
const G1 = { scheduled_time: "2026-11-12T22:00:00Z", field: "Hunter F1", round: 1 };

test("a 2 PM Pacific game renders 2 PM PST", () => {
  assert.equal(formatFieldTime(G1, PACIFIC), "Thu 2 PM PST · Hunter F1");
  assert.deepEqual(gameWhenShort(G1.scheduled_time, PACIFIC), { day: "Thu", time: "2 PM PST" });
  assert.equal(compactGameCaption(G1, PACIFIC), "G1 · THU 2P PST · Hunter F1");
  assert.equal(formatLeagueShortTime(G1.scheduled_time, "", PACIFIC), "Thu 2p PST");
  assert.equal(zoneLabel(G1.scheduled_time, PACIFIC), "PST");
});

test("a Denver tournament renders exactly as before (no label)", () => {
  // Same instants the league has always shown; byte-for-byte the old strings.
  const july = { scheduled_time: "2026-07-15T01:00:00Z", field: "Field 2", round: 3 };
  assert.equal(formatFieldTime(july), "Tue 7 PM · Field 2");
  assert.equal(formatFieldTime(july, LEAGUE_TZ), "Tue 7 PM · Field 2");
  assert.equal(formatFieldTime(july, null), "Tue 7 PM · Field 2");
  assert.deepEqual(gameWhenShort(july.scheduled_time), { day: "Tue", time: "7 PM" });
  assert.equal(formatLeagueShortTime(july.scheduled_time), "Tue 7p");
  assert.equal(formatFieldTime(G1, tournamentTimeZone({ timezone: null })), "Thu 3 PM · Hunter F1");
  assert.equal(zoneLabel(july.scheduled_time, LEAGUE_TZ), "");
  assert.equal(tournamentZoneLabel({ start_date: "2026-07-10" }), "");
});

test("summer Pacific reads PDT; a bad zone name falls back to league time", () => {
  assert.equal(gameWhenShort("2026-07-15T02:00:00Z", PACIFIC).time, "7 PM PDT");
  assert.equal(resolveTimeZone("Not/AZone"), LEAGUE_TZ);
  assert.equal(resolveTimeZone(""), LEAGUE_TZ);
  assert.equal(tournamentTimeZone({ timezone: PACIFIC }), PACIFIC);
});

test("director time pickers read and write Pacific wall clock", () => {
  assert.equal(formatGameWhenInput(G1.scheduled_time, "2026-11-12", PACIFIC), "14:00");
  assert.equal(parseGameWhenInput("14:00", "2026-11-12", PACIFIC).toISOString(), "2026-11-12T22:00:00.000Z");
  assert.equal(parseGameWhenInput("2026-11-12T14:00", null, PACIFIC).toISOString(), "2026-11-12T22:00:00.000Z");
  // League time unchanged: 2 PM typed in a Denver tournament is 21:00Z.
  assert.equal(parseGameWhenInput("14:00", "2026-11-12").toISOString(), "2026-11-12T21:00:00.000Z");
});

test("calendar export carries the absolute instant (UTC), whatever the zone", () => {
  assert.equal(icsTimestamp(new Date(G1.scheduled_time)), "20261112T220000Z");
});

test("tournament page names the zone for Worlds only", () => {
  const worlds = { start_date: "2026-11-12", end_date: "2026-11-15", timezone: PACIFIC };
  assert.equal(tournamentZoneLabel(worlds), "PST");
  const lines = (t) => JSON.stringify(tournamentTermsLines(t));
  const base = { start_date: "2026-11-12", end_date: "2026-11-15", day_start_time: "08:00" };
  assert.match(lines({ ...base, timezone: PACIFIC }), /PST/);
  assert.doesNotMatch(lines(base), /PST|MST|MDT/);
});
