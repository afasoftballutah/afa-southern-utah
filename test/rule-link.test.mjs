import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRuleLink } from "../lib/rule-link.js";

test("site path link line", () => {
  assert.deepEqual(parseRuleLink("Full rules (PDF): /docs/2026-afa-world-series-rules.pdf"), {
    label: "Full rules (PDF)",
    href: "/docs/2026-afa-world-series-rules.pdf",
  });
});
test("trailing period added by the sentence split is dropped", () => {
  assert.equal(parseRuleLink("Full rules: https://example.com/r.pdf.").href, "https://example.com/r.pdf");
});
test("ordinary rule lines stay text", () => {
  assert.equal(parseRuleLink("Bats: all bats with 1.20 BPF are legal; no senior bats."), null);
  assert.equal(parseRuleLink("Pitching: 5' from ground to 12', rubber plus 6' back."), null);
  assert.equal(parseRuleLink("Run rules: 20 after 3, 15 after 4, and 10 after 5; flip flop rule in effect."), null);
});
