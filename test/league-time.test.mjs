import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatLeagueInputValue,
  parseLeagueInputValue,
  formatLeagueShortTime,
  parseLeagueDateOnly,
  formatLeagueDateOnly,
  formatLeagueDateTime,
  formatLeagueSignedAt,
  formatLeagueTimeInputValue,
  formatGameWhenInput,
  parseGameWhenInput,
  defaultGameWhenInput,
  knownPlayDay,
} from "@/lib/league-time";

// W14: five of thirteen date-render sites read the BROWSER's zone, so one
// screen showed one 7 PM game five ways. Every expectation below is a literal,
// and the suite runs under whatever TZ the machine has — a helper that leaked
// the ambient zone back in would fail here rather than only on a manager's
// phone in another state. `npm test` on a laptop set to Tokyo must be green.

test("a summer evening game reads 7 PM, MDT", () => {
  assert.equal(formatLeagueInputValue("2026-07-15T01:00:00Z"), "2026-07-14T19:00");
  assert.equal(formatLeagueShortTime("2026-07-15T01:00:00Z"), "Tue 7p");
});

test("a winter evening game reads 7 PM, MST", () => {
  assert.equal(formatLeagueInputValue("2026-01-15T02:00:00Z"), "2026-01-14T19:00");
  assert.equal(formatLeagueShortTime("2026-01-15T02:00:00Z"), "Wed 7p");
});

test("midnight is 00:00 in an input and 12a in a chip, never 24", () => {
  assert.equal(formatLeagueInputValue("2026-07-14T06:00:00Z"), "2026-07-14T00:00");
  assert.equal(formatLeagueShortTime("2026-07-14T06:00:00Z"), "Tue 12a");
});

// The director's time field renders through format and saves through parse.
// If the two ever disagree, they see one time on screen and write another.
test("the datetime-local round trip is lossless in both offsets", () => {
  for (const iso of ["2026-07-15T01:00:00.000Z", "2026-01-15T02:00:00.000Z"]) {
    const shown = formatLeagueInputValue(iso);
    assert.equal(parseLeagueInputValue(shown).toISOString(), iso, `round trip for ${iso}`);
  }
});

test("a typed league wall time saves as the instant it names", () => {
  assert.equal(parseLeagueInputValue("2026-07-14T19:00").toISOString(), "2026-07-15T01:00:00.000Z");
  assert.equal(parseLeagueInputValue("2026-01-14T19:00").toISOString(), "2026-01-15T02:00:00.000Z");
});

// The offset at the naive guess and the offset at the answer are different
// numbers across a changeover. A one-pass conversion lands an hour out here.
test("the spring-forward morning converts on the offset it lands in, not the one it started in", () => {
  assert.equal(parseLeagueInputValue("2026-03-08T03:00").toISOString(), "2026-03-08T09:00:00.000Z");
});

test("the repeated fall-back hour resolves to the earlier reading, and stably", () => {
  const t = parseLeagueInputValue("2026-11-01T01:00");
  assert.equal(t.toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(formatLeagueInputValue(t.toISOString()), "2026-11-01T01:00");
});

// tournaments.start_date is a `date`: a calendar day with no instant in it.
// Anchoring it to midnight and then formatting in a zone is what turns July 1
// into June 30 for a viewer east of Denver, so nothing here builds a Date.
test("a calendar date is the day it says, with no zone applied", () => {
  assert.deepEqual(parseLeagueDateOnly("2026-07-01"), { year: 2026, month: 6, day: 1 });
  assert.equal(formatLeagueDateOnly("2026-07-01"), "July 1, 2026");
  assert.equal(formatLeagueDateOnly("2026-01-31"), "January 31, 2026");
  assert.equal(formatLeagueDateOnly("2026-12-25"), "December 25, 2026");
});

test("a signed instant reads as a Mountain wall clock, not the browser zone", () => {
  assert.equal(formatLeagueDateTime("2026-08-11T01:14:00Z"), "Aug 10, 2026, 7:14 PM MT");
  assert.equal(formatLeagueSignedAt("2026-08-11T01:14:00Z"), "Aug 10, 7:14p");
  assert.equal(formatLeagueDateTime("2026-01-15T02:14:00Z"), "Jan 14, 2026, 7:14 PM MT");
});

test("a known play day only asks for time", () => {
  assert.equal(formatLeagueTimeInputValue("2026-07-15T01:00:00Z"), "19:00");
  assert.equal(formatGameWhenInput("2026-07-15T01:00:00Z", "2026-07-14"), "19:00");
  assert.equal(formatGameWhenInput("2026-07-15T01:00:00Z", null), "2026-07-14T19:00");
  assert.equal(
    parseGameWhenInput("19:00", "2026-07-14").toISOString(),
    "2026-07-15T01:00:00.000Z"
  );
  assert.equal(knownPlayDay({ day_date: "2026-08-22" }), "2026-08-22");
  assert.equal(
    knownPlayDay({ tournaments: { start_date: "2026-08-22", end_date: "2026-08-22" } }),
    "2026-08-22"
  );
  assert.equal(
    knownPlayDay({ tournaments: { start_date: "2026-08-22", end_date: "2026-08-23" } }),
    null
  );
});

test("an empty game clock starts on the hour", () => {
  assert.equal(defaultGameWhenInput("2026-08-22"), "08:00");
  assert.match(defaultGameWhenInput(null), /^\d{4}-\d{2}-\d{2}T08:00$/);
  assert.equal(
    parseGameWhenInput(defaultGameWhenInput("2026-08-22"), "2026-08-22").toISOString(),
    parseGameWhenInput("08:00", "2026-08-22").toISOString()
  );
});

test("missing and malformed values render as blanks, not Invalid Date", () => {
  assert.equal(formatLeagueInputValue(null), "");
  assert.equal(formatLeagueInputValue("not a date"), "");
  assert.equal(formatLeagueShortTime(null), "TBD");
  assert.equal(formatLeagueShortTime(undefined), "TBD");
  assert.equal(parseLeagueInputValue(""), null);
  assert.equal(parseLeagueInputValue(null), null);
  assert.equal(parseLeagueDateOnly(""), null);
  assert.equal(formatLeagueDateOnly(null), "");
  assert.equal(formatLeagueDateTime(null), "");
  assert.equal(formatLeagueSignedAt(undefined), "");
});
