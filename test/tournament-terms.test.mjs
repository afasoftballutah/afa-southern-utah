import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  gamesShown,
  gamesStored,
  dollars,
  dateSpan,
  tournamentTermsLines,
  playDaysSummary,
} from "@/lib/tournament-terms.js";

test("3GG stores with the unit and shows without it", () => {
  assert.equal(gamesShown("3GG"), "3");
  assert.equal(gamesStored("3"), "3GG");
  assert.equal(gamesStored("3GG"), "3GG");
  assert.equal(gamesStored(""), null);
});

test("dollars drop trailing zeros", () => {
  assert.equal(dollars(30000), "$300");
  assert.equal(dollars(1050), "$10.50");
  assert.equal(dollars(null), "");
});

test("date span is one day or a range", () => {
  assert.equal(dateSpan("2026-08-22", "2026-08-22"), "Sat, Aug 22");
  assert.equal(dateSpan("2026-08-22", "2026-08-23"), "Sat, Aug 22 – Sun, Aug 23");
  assert.equal(dateSpan(null, null), "");
});

test("terms view is facts, not empty fields", () => {
  const lines = tournamentTermsLines({
    name: "Labor Day Classic",
    start_date: "2026-08-22",
    end_date: "2026-08-23",
    day_start_time: "08:00:00",
    venue_name: "The Canyons Sports Complex, St. George, UT",
    entry_fee_cents: 30000,
    deposit_cents: 10000,
    ump_fee_cents: 1000,
    game_guarantee: "3GG",
    registration_closes: "2026-08-15",
  });
  assert.equal(lines.name, "Labor Day Classic");
  assert.equal(lines.when, "Sat, Aug 22 – Sun, Aug 23 · first pitch 8:00 AM");
  assert.match(lines.venue, /Canyons/);
  assert.equal(lines.money, "$300 entry · $100 deposit · $10 ump · 3GG");
  assert.equal(lines.closes, "Closes August 15, 2026");
});

test("unset optional terms stay off the page", () => {
  const lines = tournamentTermsLines({ name: "Untitled Invite" });
  assert.equal(lines.name, "Untitled Invite");
  assert.equal(lines.when, "");
  assert.equal(lines.venue, "");
  assert.equal(lines.money, "");
  assert.equal(lines.closes, "");
});

test("play-days summary names the gender split", () => {
  assert.equal(
    playDaysSummary({
      startDate: "2026-08-22",
      endDate: "2026-08-23",
      divisions: [
        { gender: "mens", dayDate: "2026-08-22" },
        { gender: "coed", dayDate: "2026-08-23" },
      ],
    }),
    "Sat, Aug 22 Men's / Women's · Sun, Aug 23 Coed"
  );
  assert.equal(
    playDaysSummary({
      startDate: "2026-08-22",
      endDate: "2026-08-22",
      divisions: [{ gender: "mens", dayDate: "2026-08-22" }],
    }),
    "All divisions Sat, Aug 22"
  );
  assert.equal(playDaysSummary({ divisions: [] }), "Not set");
});

test("the Event door is facts until Edit", async () => {
  const src = await readFile(
    path.join(import.meta.dirname, "../components/scorekeeper/TournamentEditor.js"),
    "utf8"
  );
  assert.match(src, /if \(!editing\)/);
  assert.match(src, /TermsView/);
});

test("clicking a tournament opens the event sheet, not a team editor", async () => {
  const src = await readFile(
    path.join(import.meta.dirname, "../components/scorekeeper/TournamentDesk.js"),
    "utf8"
  );
  assert.match(src, /useState\("event"\)/);
  assert.match(src, /editClass=\{false\}/);
});
