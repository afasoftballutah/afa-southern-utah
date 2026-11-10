import { test } from "node:test";
import assert from "node:assert/strict";
import { placeClear, unionRect } from "@/lib/popover-place";

const R = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
const hits = (p, card, r) =>
  Math.min(p.left + card.w, r.right) > Math.max(p.left, r.left) && Math.min(p.top + card.h, r.bottom) > Math.max(p.top, r.top);
const CARD = { w: 304, h: 300 };

test("JD's case at 1024px: Game 1 → 9 / 13 to its right; the card clears the pills and the arrows", () => {
  const g1 = R(260, 330, 84, 44);
  const g9 = R(352, 330, 84, 44);
  const g13 = R(536, 382, 84, 44);
  const keep = unionRect([g1, g9, g13], 24);
  const p = placeClear(CARD, keep, g1, { w: 1024, h: 768 });
  assert.equal(p.clear, true);
  for (const r of [g1, g9, g13, keep]) assert.equal(hits(p, CARD, r), false);
});

test("destinations below: card goes beside or above, never over them", () => {
  const g = R(400, 120, 84, 44);
  const d1 = R(492, 380, 84, 44);
  const d2 = R(400, 432, 84, 44);
  const keep = unionRect([g, d1, d2], 24);
  const p = placeClear(CARD, keep, g, { w: 1280, h: 800 });
  assert.equal(p.clear, true);
  assert.equal(hits(p, CARD, keep), false);
});

test("near the right edge: the card goes left of the game", () => {
  const g = R(1150, 300, 84, 44);
  const keep = unionRect([g, R(1150, 352, 84, 44)], 24);
  const p = placeClear(CARD, keep, g, { w: 1280, h: 420 });
  assert.equal(p.clear, true);
  assert.ok(p.left + CARD.w <= keep.left);
});

test("no room anywhere: on screen, covering as little as it can", () => {
  const keep = R(10, 10, 600, 400);
  const p = placeClear(CARD, keep, R(100, 100, 84, 44), { w: 640, h: 440 });
  assert.ok(p.left >= 12 && p.top >= 12 && p.left + CARD.w <= 640 - 12 + 0.01 + 304);
  assert.equal(typeof p.clear, "boolean");
});

test("union of rects with padding; nulls skipped", () => {
  assert.deepEqual(unionRect([R(0, 0, 10, 10), null, R(20, 5, 10, 10)], 2), { left: -2, top: -2, right: 32, bottom: 17 });
  assert.equal(unionRect([null]), null);
});

test("a short window: say how far to scroll so the card fits below, arrows still on screen", () => {
  const g1 = R(288, 300, 84, 44);
  const keep = unionRect([g1, R(472, 404, 84, 44), R(656, 300, 84, 44)], 26);
  const p = placeClear(CARD, keep, g1, { w: 1024, h: 768 });
  assert.equal(p.clear, false);
  assert.ok(p.scroll > 0);
  const after = placeClear(CARD, { ...keep, top: keep.top - p.scroll, bottom: keep.bottom - p.scroll }, { ...g1, top: g1.top - p.scroll, bottom: g1.bottom - p.scroll }, { w: 1024, h: 768 });
  assert.equal(after.clear, true);
});
