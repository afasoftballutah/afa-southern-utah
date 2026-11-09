import test from "node:test";
import assert from "node:assert/strict";
import {
  tournamentPhase,
  isPastTournament,
  tournamentToday,
  isRegistrationOpen,
} from "@/lib/tournament-state.js";
import { isUpcomingEvent } from "@/lib/poster-deck.js";

// JD, 2026-11-08: "make it so the tournaments that have already happened are
// not showing like they are in the future throughout the site". Every page
// asks tournamentPhase; status is never trusted to say "upcoming".

const NOV8_NOON = new Date("2026-11-08T19:00:00Z"); // noon Denver, 11 AM Pacific
const t = (over) => ({
  name: "Cup",
  status: "upcoming",
  start_date: "2026-08-22",
  end_date: "2026-08-23",
  ...over,
});

test("a tournament whose last day has passed is past, whatever status says", () => {
  assert.equal(tournamentPhase(t(), NOV8_NOON), "past");
  assert.equal(isPastTournament(t(), NOV8_NOON), true);
});

test("before its first day it is upcoming; during it, live", () => {
  assert.equal(tournamentPhase(t({ start_date: "2026-11-12", end_date: "2026-11-15" }), NOV8_NOON), "upcoming");
  assert.equal(tournamentPhase(t({ start_date: "2026-11-07", end_date: "2026-11-08" }), NOV8_NOON), "live");
  assert.equal(tournamentPhase(t({ start_date: "2026-11-08", end_date: "2026-11-08" }), NOV8_NOON), "live");
});

test("no end date falls back to the start date", () => {
  assert.equal(tournamentPhase(t({ start_date: "2026-11-07", end_date: null }), NOV8_NOON), "past");
  assert.equal(tournamentPhase(t({ start_date: "2026-11-09", end_date: null }), NOV8_NOON), "upcoming");
});

test("no dates at all is not called past", () => {
  assert.equal(tournamentPhase(t({ start_date: null, end_date: null }), NOV8_NOON), "upcoming");
});

test("every game final, or status complete, is past even before the last day", () => {
  const future = { start_date: "2026-11-12", end_date: "2026-11-15" };
  assert.equal(tournamentPhase(t({ ...future, finished: true }), NOV8_NOON), "past");
  assert.equal(tournamentPhase(t({ ...future, status: "complete" }), NOV8_NOON), "past");
});

test("today is read in the tournament's own zone", () => {
  // 11:30 PM Denver on Nov 15 is 10:30 PM Pacific, still Nov 15 in both...
  const late = new Date("2026-11-16T06:30:00Z");
  // ...but 12:30 AM Denver Nov 16 is 11:30 PM Pacific Nov 15.
  const pastMidnightDenver = new Date("2026-11-16T07:30:00Z");
  const worlds = t({ start_date: "2026-11-12", end_date: "2026-11-15", timezone: "America/Los_Angeles" });
  const denver = t({ start_date: "2026-11-12", end_date: "2026-11-15" });
  assert.equal(tournamentToday(worlds, pastMidnightDenver), "2026-11-15");
  assert.equal(tournamentToday(denver, pastMidnightDenver), "2026-11-16");
  assert.equal(tournamentPhase(worlds, pastMidnightDenver), "live");
  assert.equal(tournamentPhase(denver, pastMidnightDenver), "past");
  assert.equal(tournamentPhase(worlds, late), "live");
});

test("a YYYY-MM-DD today is taken as is", () => {
  assert.equal(tournamentPhase(t(), "2026-08-23"), "live");
  assert.equal(tournamentPhase(t(), "2026-08-24"), "past");
});

test("isPastTournament survives Array.filter (index is not a clock)", () => {
  const list = [t({ name: "old" }), t({ name: "later", start_date: "2099-01-01", end_date: "2099-01-02" })];
  assert.deepEqual(list.filter(isPastTournament).map((x) => x.name), ["old"]);
});

test("registration closes after the last day in the tournament's zone", () => {
  const worlds = t({ start_date: "2026-11-12", end_date: "2026-11-15", timezone: "America/Los_Angeles" });
  assert.equal(isRegistrationOpen(worlds, new Date("2026-11-16T07:30:00Z")), true);
  assert.equal(isRegistrationOpen(worlds, new Date("2026-11-16T08:30:00Z")), false);
  assert.equal(isRegistrationOpen(t(), NOV8_NOON), false);
});

test("home deck: a past event is never upcoming, a future one is", () => {
  assert.equal(isUpcomingEvent(t(), NOV8_NOON), false);
  assert.equal(isUpcomingEvent(t({ start_date: "2026-11-12", end_date: "2026-11-15" }), NOV8_NOON), true);
  assert.equal(isUpcomingEvent(t({ start_date: "2026-11-12", end_date: "2026-11-15", is_placeholder: true }), NOV8_NOON), false);
});
