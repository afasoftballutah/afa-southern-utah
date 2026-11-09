import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRuleLine } from "../lib/rule-line.js";

test("old one-line rules stay plain", () => {
  for (const l of ["BYOB.", "HR bands.", "No equalizers."]) {
    assert.deepEqual(parseRuleLine(l), { kind: "plain", text: l });
  }
});
test("label + one statement", () => {
  assert.deepEqual(parseRuleLine("Stealing: In all divisions except Women's Rec and Coed Rec."), {
    kind: "labeled", label: "Stealing", text: "In all divisions except Women's Rec and Coed Rec.",
  });
});
test("label + items becomes a list (HR by division)", () => {
  assert.deepEqual(
    parseRuleLine("Home runs by division: D Division: 3 HRs, then regular out; E Division: 1 HR, then inning ending out; Women's divisions are unlimited."),
    { kind: "list", label: "Home runs by division", items: ["D Division: 3 HRs, then regular out", "E Division: 1 HR, then inning ending out", "Women's divisions are unlimited"] }
  );
});
test("labels with & and parentheses", () => {
  assert.equal(parseRuleLine("Walk rule (Coed): a; b.").label, "Walk rule (Coed)");
  assert.equal(parseRuleLine("Count & strike zone: a; b.").label, "Count & strike zone");
});
test("PDF link line stays a link", () => {
  assert.deepEqual(parseRuleLine("Full rules (PDF): /docs/2026-afa-world-series-rules.pdf"), {
    kind: "link", label: "Full rules (PDF)", href: "/docs/2026-afa-world-series-rules.pdf",
  });
});
test("a sentence with a colon late in it stays plain", () => {
  const l = "If the batter walks, intentionally or not, then: free HR.";
  assert.equal(parseRuleLine(l).kind, "plain");
});
