import test from "node:test";
import assert from "node:assert/strict";
import { suggestClass, formatCounts, RATINGS, enteredClassName } from "@/lib/class.js";

const CLASSES = [
  { id: "rec", name: "Rec", sort_order: 10 },
  { id: "e", name: "E", sort_order: 20 },
  { id: "d", name: "D", sort_order: 30 },
  { id: "open", name: "Open", sort_order: 40 },
];

/** roster("C", "D", "D", null, null) */
const roster = (...ratings) => ratings.map((rating) => ({ rating }));
const rep = (rating, count) => Array(count).fill(rating);

// JD, 2026-07-27: "D can have up to 3 Cs. Open can be anyone. E can have up to
// three Ds or a C and one D. REC can have nobody letter-ranked."

test("nobody letter-ranked is Rec", () => {
  const s = suggestClass(roster(null, null, null), CLASSES);
  assert.equal(s.className, "Rec");
});

test("one E player is enough to bar Rec", () => {
  const s = suggestClass(roster("E", null, null), CLASSES);
  assert.equal(s.className, "E");
  assert.match(s.reason, /Rec takes nobody letter-ranked/);
});

test("E takes up to three D", () => {
  assert.equal(suggestClass(roster(...rep("D", 3), "E"), CLASSES).className, "E");
});

test("a fourth D pushes the team to D", () => {
  const s = suggestClass(roster(...rep("D", 4)), CLASSES);
  assert.equal(s.className, "D");
  assert.match(s.reason, /E takes up to three D, and this roster has 4/);
});

test("E takes one C and one D", () => {
  assert.equal(suggestClass(roster("C", "D", "E", "E"), CLASSES).className, "E");
});

test("one C and two D is too much for E", () => {
  const s = suggestClass(roster("C", "D", "D"), CLASSES);
  assert.equal(s.className, "D");
  assert.match(s.reason, /With a C on the roster, E takes only one D/);
});

test("two C is too much for E, but fine for D", () => {
  const s = suggestClass(roster("C", "C"), CLASSES);
  assert.equal(s.className, "D");
  assert.match(s.reason, /E takes at most one C/);
});

test("D takes up to three C", () => {
  assert.equal(suggestClass(roster(...rep("C", 3), ...rep("D", 8)), CLASSES).className, "D");
});

test("a fourth C pushes the team to Open", () => {
  const s = suggestClass(roster(...rep("C", 4)), CLASSES);
  assert.equal(s.className, "Open");
  assert.match(s.reason, /D takes up to three C, and this roster has 4/);
});

test("Open takes anyone", () => {
  const s = suggestClass(roster(...rep("A", 5), ...rep("C", 9)), CLASSES);
  assert.equal(s.className, "Open");
});

// A and B are not covered by the stated rules. Treated as Open-only, which is
// the conservative read — an A player must not quietly appear on a D team.
test("a single A bars everything below Open", () => {
  const s = suggestClass(roster("A", ...rep("E", 10)), CLASSES);
  assert.equal(s.className, "Open");
  assert.match(s.reason, /1 A on the roster — only Open takes those/);
});

test("a single B does the same", () => {
  assert.equal(suggestClass(roster("B", "E"), CLASSES).className, "Open");
});

test("unranked players never bar a class, but are flagged", () => {
  const s = suggestClass(roster("D", null, null, null), CLASSES);
  assert.equal(s.className, "E");
  assert.equal(s.unranked, 3);
  assert.equal(s.ratedCount, 1);
  assert.match(s.reason, /3 players have no rating yet/);
});

test("an unknown rating string is treated as unranked, not as a bar", () => {
  const s = suggestClass(roster("Z", null), CLASSES);
  assert.equal(s.className, "Rec");
  assert.equal(s.unranked, 2);
});

test("an empty roster gets no suggestion", () => {
  const s = suggestClass([], CLASSES);
  assert.equal(s.classId, null);
  assert.match(s.reason, /no players on the roster/i);
});

test("the tournament caps a class it does not run", () => {
  // Eligible for D, but the event only runs Rec and E.
  const s = suggestClass(roster("C", "C"), CLASSES, ["rec", "e"]);
  assert.equal(s.className, "E");
  assert.equal(s.cappedFrom, "D");
  assert.match(s.reason, /does not run D/);
});

test("a Rec team at a D/Open event is lifted to D", () => {
  const s = suggestClass(roster(null, null), CLASSES, ["d", "open"]);
  assert.equal(s.className, "D");
  assert.equal(s.cappedFrom, "Rec");
});

test("no cap when the tournament runs the suggested class", () => {
  const s = suggestClass(roster("C", "C"), CLASSES, ["e", "d", "open"]);
  assert.equal(s.className, "D");
  assert.equal(s.cappedFrom, null);
});

test("an empty offer list means the tournament did not say", () => {
  assert.equal(suggestClass(roster("C", "C"), CLASSES, []).className, "D");
  assert.equal(suggestClass(roster("C", "C"), CLASSES, null).className, "D");
});

test("blocked classes are reported in order, so a director can see the whole ladder", () => {
  const s = suggestClass(roster("C", "C"), CLASSES);
  assert.deepEqual(
    s.blocked.map((b) => b.name),
    ["Rec", "E"]
  );
});

test("the breakdown reads strongest first", () => {
  const s = suggestClass(roster("E", "E", "D", "C"), CLASSES);
  assert.equal(formatCounts(s.counts), "1 C · 1 D · 2 E");
});

test("formatCounts survives nothing", () => {
  assert.equal(formatCounts([]), "nobody rated");
  assert.equal(formatCounts(null), "nobody rated");
});

test("RATINGS is strongest first, which everything else assumes", () => {
  assert.deepEqual(RATINGS, ["A", "B", "C", "D", "E"]);
});

// --- Coed minimums ---------------------------------------------------------
// JD, 2026-07-27: "5 and 5 should be default for Coed (sometimes it will be
// 7/3 or 6/4)... more than the required is fine, but less than is a flag."

import { checkRoster } from "@/lib/class.js";

const people = (m, f, unknown = 0) => [
  ...Array(m).fill({ gender: "M" }),
  ...Array(f).fill({ gender: "F" }),
  ...Array(unknown).fill({ gender: null }),
];

test("a 5/5 division is happy with exactly 5 and 5", () => {
  const r = checkRoster(people(5, 5), { minMen: 5, minWomen: 5 });
  assert.equal(r.ok, true);
});

test("more than the minimum is fine", () => {
  assert.equal(checkRoster(people(9, 6), { minMen: 5, minWomen: 5 }).ok, true);
});

test("one short of the women is flagged, and says which", () => {
  const r = checkRoster(people(7, 4), { minMen: 5, minWomen: 5 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.short, [{ what: "women", have: 4, need: 5 }]);
});

test("short on both is reported as both", () => {
  const r = checkRoster(people(2, 2), { minMen: 5, minWomen: 5 });
  assert.deepEqual(r.short.map((s) => s.what), ["men", "women"]);
});

test("a 7/3 split is honoured, not assumed to be 5/5", () => {
  assert.equal(checkRoster(people(7, 3), { minMen: 7, minWomen: 3 }).ok, true);
  assert.equal(checkRoster(people(5, 5), { minMen: 7, minWomen: 3 }).ok, false);
});

test("unrecorded gender is counted apart from a real shortfall", () => {
  const r = checkRoster(people(5, 3, 4), { minMen: 5, minWomen: 5 });
  assert.equal(r.unknown, 4);
  assert.equal(r.ok, false, "4 unknown could cover it, but on what is recorded they are short");
});

test("a division with no minimums never flags", () => {
  assert.equal(checkRoster(people(1, 0), {}).ok, true);
  assert.equal(checkRoster(people(1, 0), { minMen: null, minWomen: null }).ok, true);
});

test("an empty roster against a 5/5 division is short, not silently fine", () => {
  assert.equal(checkRoster([], { minMen: 5, minWomen: 5 }).ok, false);
});

test("entered class comes from class_id, then the division, never 'Men's D'", () => {
  assert.equal(
    enteredClassName({ class_id: "d", class: "Men's D" }, CLASSES),
    "D"
  );
  assert.equal(
    enteredClassName(
      { class: "Men's D", divisions: { class_id: "d", display_name: "Men's D" } },
      CLASSES
    ),
    "D"
  );
  assert.equal(
    enteredClassName({ class: "Men's D", divisions: { display_name: "Men's D" } }, CLASSES),
    "D"
  );
  assert.equal(enteredClassName({ class: "Open" }, CLASSES), "Open");
  assert.equal(enteredClassName({ class: "Men's D" }, CLASSES), "D");
  assert.equal(enteredClassName({ class: "not a class" }, CLASSES), null);
});
