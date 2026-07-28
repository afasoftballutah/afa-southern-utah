import test from "node:test";
import assert from "node:assert/strict";
import { isRegistrationOpen, leagueToday } from "@/lib/tournament-state.js";

// The bug this file exists for: on 2026-07-27 the Coed Heat Stroker had been
// over for three days, still carried status='upcoming' (nothing writes that
// column), and /register offered it. These fix the date rule in place.

const JUL27 = new Date("2026-07-27T18:00:00Z"); // noon in America/Denver

const t = (over) => ({
  name: "Test Cup",
  is_placeholder: false,
  start_date: "2026-08-22",
  end_date: "2026-08-23",
  registration_closes: null,
  status: "upcoming",
  ...over,
});

test("a future tournament is open", () => {
  assert.equal(isRegistrationOpen(t(), JUL27), true);
});

test("the finished Heat Stroker is closed even though status says upcoming", () => {
  const heatStroker = t({
    name: "Coed Heat Stroker",
    start_date: "2026-07-24",
    end_date: "2026-07-26",
    status: "upcoming",
  });
  assert.equal(isRegistrationOpen(heatStroker, JUL27), false);
});

test("status is never consulted — 'complete' on a future event stays open", () => {
  assert.equal(isRegistrationOpen(t({ status: "complete" }), JUL27), true);
});

test("a tournament running today is still open on its last day", () => {
  const today = leagueToday(JUL27);
  assert.equal(isRegistrationOpen(t({ start_date: "2026-07-24", end_date: today }), JUL27), true);
});

test("end_date is what matters, not start_date", () => {
  // Started yesterday, ends tomorrow — still open.
  assert.equal(
    isRegistrationOpen(t({ start_date: "2026-07-26", end_date: "2026-07-28" }), JUL27),
    true
  );
});

test("start_date carries the event when end_date is missing", () => {
  assert.equal(isRegistrationOpen(t({ start_date: "2026-07-26", end_date: null }), JUL27), false);
  assert.equal(isRegistrationOpen(t({ start_date: "2026-07-28", end_date: null }), JUL27), true);
});

test("a passed registration_closes shuts a future tournament", () => {
  assert.equal(isRegistrationOpen(t({ registration_closes: "2026-07-20" }), JUL27), false);
});

test("registration_closes is inclusive on the day itself", () => {
  assert.equal(
    isRegistrationOpen(t({ registration_closes: leagueToday(JUL27) }), JUL27),
    true
  );
});

test("a timestamp in registration_closes is compared by date only", () => {
  assert.equal(
    isRegistrationOpen(t({ registration_closes: "2026-07-27T23:59:00+00:00" }), JUL27),
    true
  );
});

test("placeholders are never registerable", () => {
  assert.equal(isRegistrationOpen(t({ is_placeholder: true }), JUL27), false);
});

test("a tournament with no dates is closed, not open", () => {
  assert.equal(isRegistrationOpen(t({ start_date: null, end_date: null }), JUL27), false);
});

test("null and undefined are closed, not crashes", () => {
  assert.equal(isRegistrationOpen(null, JUL27), false);
  assert.equal(isRegistrationOpen(undefined, JUL27), false);
});

test("survives being passed straight to Array.filter", () => {
  // filter hands (element, index, array). If the index reached `now`, the
  // clock would read 1970 and every finished tournament would reopen.
  const list = [
    t({ name: "future" }),
    t({ name: "past", start_date: "2020-01-01", end_date: "2020-01-02" }),
  ];
  assert.deepEqual(
    list.filter(isRegistrationOpen).map((x) => x.name),
    ["future"]
  );
});

test("leagueToday reads the league clock, not the server's", () => {
  // 03:00 UTC on the 28th is still the evening of the 27th in Denver. A
  // server-local Date would roll the day over early and close registration
  // for an event that is open.
  assert.equal(leagueToday(new Date("2026-07-28T03:00:00Z")), "2026-07-27");
  assert.equal(leagueToday(new Date("2026-07-28T07:00:00Z")), "2026-07-28");
});

// --- Age on a roster sheet -------------------------------------------------
import { ageFrom, bornWithAge } from "@/lib/names.js";

test("age is whole years, and a birthday later this year has not happened yet", () => {
  assert.equal(ageFrom("1985-01-20", "2026-07-27"), 41, "birthday passed");
  assert.equal(ageFrom("1985-12-20", "2026-07-27"), 40, "birthday still ahead");
});

test("age on the birthday itself counts", () => {
  assert.equal(ageFrom("2000-07-27", "2026-07-27"), 26);
  assert.equal(ageFrom("2000-07-28", "2026-07-27"), 25);
});

test("age survives a timestamp rather than a bare date", () => {
  assert.equal(ageFrom("1985-01-20T00:00:00+00:00", "2026-07-27"), 41);
});

test("no birth date means no age, not zero", () => {
  assert.equal(ageFrom(null, "2026-07-27"), null);
  assert.equal(ageFrom("not a date", "2026-07-27"), null);
});

test("bornWithAge reads the way a roster sheet does", () => {
  assert.equal(bornWithAge("1985-01-20", "2026-07-27"), "1985-01-20 [41]");
  assert.equal(bornWithAge(null, "2026-07-27"), "—");
});

// --- Venue names -----------------------------------------------------------
import { venueParts } from "@/lib/director.js";

test("a venue reads the way a director says it", () => {
  assert.deepEqual(venueParts("The Canyons Sports Complex", "St. George, UT"), {
    name: "Canyons",
    locality: "St. George, UT",
  });
});

test("the locality can be inside the name", () => {
  assert.deepEqual(venueParts("Lakeside Park, Orem, UT", null), {
    name: "Lakeside Park",
    locality: "Orem, UT",
  });
});

test("a venue that is only a town keeps its name", () => {
  assert.deepEqual(venueParts("Wendover, NV", null), { name: "Wendover", locality: "NV" });
});

test("no locality anywhere is null, not empty string", () => {
  assert.deepEqual(venueParts("Arroyo Grande", null), { name: "Arroyo Grande", locality: null });
});

test("venue_address wins over a comma in the name", () => {
  assert.equal(venueParts("Somewhere, XX", "Real City, UT").locality, "Real City, UT");
});

test("an empty venue does not crash", () => {
  assert.deepEqual(venueParts(null, null), { name: "", locality: null });
});
