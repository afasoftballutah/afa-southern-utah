// The open game's two arrows never cross (JD, 2026-11-09: "can we make it so
// the lines dont cross"), checked on hand-made shapes and on every game of the
// 2026 World Series timeline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planArrows, polylinesCross, gridPillRect } from "@/lib/flow-arrows";

const pill = (row, hour) => gridPillRect({ row, offset: hour * 60 });
const box = { left: 0, top: 0, right: 92 * 8, bottom: 52 * 6 };
const noCross = (out) => assert.ok(!polylinesCross(out[0].pts, out[1].pts), "the two arrows cross");
const inPill = (p, r) => p.x > r.left + 2 && p.x < r.right - 2 && p.y > r.top + 2 && p.y < r.bottom - 2;

test("polylinesCross: an X crosses, parallel lines do not", () => {
  assert.equal(polylinesCross([{ x: 0, y: 0 }, { x: 10, y: 10 }], [{ x: 0, y: 10 }, { x: 10, y: 0 }]), true);
  assert.equal(polylinesCross([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }]), false);
});

test("J.D.'s case: loser on the same row, winner a row down and further right", () => {
  // Game 5 (Hunter F2, 3 PM) → loser Game 11 (Hunter F2, 5 PM), winner Game 15 (Hunter F3, 6 PM)
  const from = pill(1, 2);
  const out = planArrows({ from, arrows: [{ role: "winner", to: pill(2, 5) }, { role: "loser", to: pill(1, 4) }], box });
  assert.equal(out.length, 2);
  noCross(out);
  // separate starts on the open pill
  assert.ok(Math.hypot(out[0].start.x - out[1].start.x, out[0].start.y - out[1].start.y) >= 10);
  // the winner, going lower, leaves below the loser
  assert.ok(out[0].start.y > out[1].start.y || out[0].start.x !== out[1].start.x);
});

test("one up, one down; both down; both on the same row; one behind", () => {
  const from = pill(2, 2);
  const cases = [
    [pill(0, 4), pill(4, 4)], // up / down
    [pill(3, 3), pill(5, 4)], // both down
    [pill(2, 3), pill(2, 5)], // same row, near and far
    [pill(4, 1), pill(1, 4)], // one behind (earlier column)
    [pill(3, 2.5), pill(1, 2.5)], // overlapping columns, one above one below
  ];
  for (const [w, l] of cases) {
    const out = planArrows({ from, arrows: [{ role: "winner", to: w }, { role: "loser", to: l }], box });
    assert.equal(out.length, 2);
    noCross(out);
    // a same-row far arrow does not run through the near destination
    for (const [i, other] of [[0, l], [1, w]]) assert.ok(!out[i].pts.slice(2, -2).some((p) => inPill(p, other)));
  }
});

test("off-panel arrows are short stubs that do not cross the other arrow", () => {
  const from = pill(2, 6);
  const reach = 46;
  const mixed = planArrows({ from, arrows: [{ role: "winner", toward: { x: 600, y: 900 }, reach }, { role: "loser", to: pill(3, 7) }], box });
  assert.equal(mixed[0].kind, "stub");
  assert.equal(mixed[1].kind, "curve");
  noCross(mixed);
  const two = planArrows({ from, arrows: [{ role: "winner", toward: { x: 640, y: 900 }, reach }, { role: "loser", toward: { x: 560, y: 900 }, reach }], box });
  assert.equal(two.length, 2);
  noCross(two);
  // bottom row, next game on another day: no room below, so it points on (right)
  const low = gridPillRect({ row: 5, offset: 120 });
  const tight = { ...box, bottom: low.bottom + 6 };
  const edge = (start, u) => Math.min(46, u.y > 0 ? (tight.bottom - start.y) / u.y : 46);
  const fallback = planArrows({ from: low, arrows: [{ role: "winner", toward: { x: 300, y: 2000 }, alt: { x: 2000, y: (low.top + low.bottom) / 2 }, reach: edge }], box: tight });
  assert.equal(fallback.length, 1);
  assert.ok(fallback[0].u.x > 0.9);
});

test("every World Series game: the two drawn arrows never cross", () => {
  const L = JSON.parse(readFileSync(new URL("./fixtures/worlds-2026-timeline-layout.json", import.meta.url), "utf8"));
  const byId = new Map(L.games.map((g) => [g.id, g]));
  let pairs = 0;
  for (const g of L.games) {
    const d = L.dest[g.id];
    if (!d) continue;
    const sameDay = L.games.filter((x) => x.day === g.day);
    const panel = { left: 0, top: 0, right: Math.max(...sameDay.map((x) => gridPillRect(x).right)) + 8, bottom: 6 * 52 };
    const arrows = [];
    for (const role of ["winner", "loser"]) {
      const t = byId.get(d[role]);
      if (!t) continue;
      const r = gridPillRect(t);
      arrows.push(t.day === g.day ? { role, to: r, id: t.id } : { role, toward: { x: (r.left + r.right) / 2, y: panel.bottom + 200 + r.top }, reach: 46 });
    }
    const obstacles = sameDay.filter((x) => x.id !== g.id && !arrows.some((a) => a.id === x.id)).map((x) => gridPillRect(x));
    const out = planArrows({ from: gridPillRect(g), arrows, obstacles, box: panel });
    assert.equal(out.length, arrows.length, `${g.division} ${g.label}: every arrow drawn`);
    if (out.length === 2) {
      pairs++;
      assert.ok(!polylinesCross(out[0].pts, out[1].pts), `${g.division} ${g.label}: arrows cross`);
    }
  }
  assert.ok(pairs >= 60, `checked ${pairs} pairs`);
});
