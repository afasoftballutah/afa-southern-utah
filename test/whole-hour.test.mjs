// JD's standing rule: whole-hour times never show ":00"; other minutes stay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { clockTime, dropWholeHour } from "../lib/zone.js";
import { formatFieldTime, gameWhenShort } from "../lib/bracket/tree.js";
import { formatTimeOfDayLabel, formatTimeWindowLabel } from "../lib/league-time.js";

const PST = "America/Los_Angeles";

test("clockTime: 9 AM, 9:30 AM, 12 PM, 11:05 PM", () => {
  assert.equal(clockTime("2026-11-15T17:00:00Z", PST), "9 AM");
  assert.equal(clockTime("2026-11-15T17:30:00Z", PST), "9:30 AM");
  assert.equal(clockTime("2026-11-15T20:00:00Z", PST), "12 PM");
  assert.equal(clockTime("2026-11-16T07:05:00Z", PST), "11:05 PM");
  assert.equal(clockTime("nope", PST), "");
});

test("By time / By field headers (formatFieldTime): 'Sun 9 AM PST', minutes kept", () => {
  assert.equal(formatFieldTime({ scheduled_time: "2026-11-15T17:00:00Z" }, PST), "Sun 9 AM PST");
  assert.equal(formatFieldTime({ scheduled_time: "2026-11-15T17:30:00Z", field: "Hunter F1" }, PST), "Sun 9:30 AM PST · Hunter F1");
  assert.deepEqual(gameWhenShort("2026-11-15T17:00:00Z", PST), { day: "Sun", time: "9 AM PST" });
  assert.deepEqual(gameWhenShort("2026-11-15T17:45:00Z", PST), { day: "Sun", time: "9:45 AM PST" });
});

test("first pitch and umpire windows", () => {
  assert.equal(formatTimeOfDayLabel("08:00"), "8 AM");
  assert.equal(formatTimeOfDayLabel("08:30"), "8:30 AM");
  assert.equal(formatTimeWindowLabel("08:00", "17:00"), "8 AM – 5 PM");
  assert.equal(dropWholeHour("Thu 4:00 PM PST"), "Thu 4 PM PST");
  assert.equal(dropWholeHour("Thu 4:30 PM"), "Thu 4:30 PM");
});

test("no hand-rolled hour+minute formatting left in site code; it all goes through clockTime", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== "node_modules" && f !== "mockups") walk(p); continue; }
      if (!/\.js$/.test(f)) continue;
      const s = readFileSync(p, "utf8");
      // hour + 2-digit minute in a toLocaleTimeString / DateTimeFormat call
      if (/hour:\s*"numeric",\s*minute:\s*"2-digit"/.test(s) && p !== join("lib", "zone.js")) offenders.push(p);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(d);
  // compactGameCaption ("SAT 9P") builds its own compact form and drops :00 itself
  assert.deepEqual(offenders.filter((p) => p !== join("lib", "bracket", "tree.js")), []);
  assert.doesNotMatch(readFileSync("lib/bracket/tree.js", "utf8").split("export function compactGameCaption")[0], /minute:\s*"2-digit"/);
});
