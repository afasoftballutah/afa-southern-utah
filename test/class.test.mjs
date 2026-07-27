import test from "node:test";
import assert from "node:assert/strict";
import { suggestClass, formatCounts } from "@/lib/class.js";

const CLASSES = [
  { id: "rec", name: "Rec", sort_order: 10 },
  { id: "e", name: "E", sort_order: 20 },
  { id: "d", name: "D", sort_order: 30 },
  { id: "open", name: "Open", sort_order: 40 },
];
const p = (...ids) => ids.map((class_id) => ({ class_id }));

test("a team plays at the level of its best player", () => {
  const s = suggestClass(p("rec", "rec", "e", "d"), CLASSES);
  assert.equal(s.className, "D");
});

test("one strong player lifts the whole team — the anti-sandbagging read", () => {
  const s = suggestClass(p("rec", "rec", "rec", "rec", "open"), CLASSES);
  assert.equal(s.className, "Open");
});

test("an all-Rec roster stays Rec", () => {
  assert.equal(suggestClass(p("rec", "rec", "rec"), CLASSES).className, "Rec");
});

test("nobody rated means no suggestion, and it says why", () => {
  const s = suggestClass(p(null, null), CLASSES);
  assert.equal(s.classId, null);
  assert.match(s.reason, /no player on this roster has a class/i);
});

test("an empty roster is not the same as an unrated one", () => {
  assert.match(suggestClass([], CLASSES).reason, /no players on the roster/i);
});

test("unrated players are counted and flagged, not ignored", () => {
  const s = suggestClass(p("e", null, null), CLASSES);
  assert.equal(s.className, "E");
  assert.equal(s.rated, 1);
  assert.equal(s.unrated, 2);
  assert.match(s.reason, /2 players have no class yet/);
});

test("the tournament caps a suggestion it does not offer", () => {
  // A D team at an event running only Rec and E has to play E.
  const s = suggestClass(p("d", "e"), CLASSES, ["rec", "e"]);
  assert.equal(s.className, "E");
  assert.equal(s.cappedFrom, "D");
  assert.match(s.reason, /does not run D/);
});

test("a team below everything offered is lifted to the lowest offered", () => {
  const s = suggestClass(p("rec", "rec"), CLASSES, ["d", "open"]);
  assert.equal(s.className, "D");
  assert.equal(s.cappedFrom, "Rec");
});

test("no cap when the tournament offers the suggested class", () => {
  const s = suggestClass(p("d"), CLASSES, ["e", "d", "open"]);
  assert.equal(s.className, "D");
  assert.equal(s.cappedFrom, null);
});

test("an empty offer list is treated as 'the tournament did not say'", () => {
  assert.equal(suggestClass(p("d"), CLASSES, []).className, "D");
  assert.equal(suggestClass(p("d"), CLASSES, null).className, "D");
});

test("a class the roster references but the league does not have is ignored", () => {
  const s = suggestClass(p("ghost", "e"), CLASSES);
  assert.equal(s.className, "E");
  assert.equal(s.rated, 1);
});

test("the breakdown reads strongest first", () => {
  const s = suggestClass(p("rec", "rec", "e", "d"), CLASSES);
  assert.equal(formatCounts(s.counts), "1 D · 1 E · 2 Rec");
});

test("formatCounts survives nothing", () => {
  assert.equal(formatCounts([]), "nobody rated");
  assert.equal(formatCounts(null), "nobody rated");
});
