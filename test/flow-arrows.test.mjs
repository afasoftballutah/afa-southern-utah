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

test("partly visible destination gets the real curve to the part that shows; fully off gets an aimed stub", async () => {
  const { visiblePart, aimAt, placeLabel } = await import("@/lib/flow-arrows");
  // phone: lane shows only ~2.6 hours; Game 11 is half in view at the right edge, Game 15 fully off
  const view = { left: 0, top: 0, right: 92 * 2.6, bottom: 52 * 6 };
  const from = pill(1, 0);
  const g11 = pill(1, 2);
  const g15 = pill(2, 3);
  const seen = visiblePart(g11, view);
  assert.ok(seen && seen.right === view.right && seen.left === g11.left);
  assert.equal(visiblePart(g15, view), null);
  const aim = aimAt(g15, view);
  assert.ok(aim.x === view.right && aim.y === (g15.top + g15.bottom) / 2, "aims at the right edge, on Game 15's row");
  const out = planArrows({ from, arrows: [{ role: "loser", to: seen }, { role: "winner", toward: aim, reach: 46 }], obstacles: [pill(0, 0), pill(0, 1), pill(1, 1), pill(2, 0), pill(2, 1)], box: view });
  assert.equal(out[0].kind, "curve");
  assert.equal(out[1].kind, "stub");
  assert.ok(out[1].u.x > 0.6 && out[1].u.y > 0, "stub points right and down, toward Game 15");
  assert.ok(out[1].start.y > out[0].start.y, "the lower destination's arrow leaves lower");
  noCross(out);
  // the stub's name never sits on a pill's number
  const pills = [pill(0, 0), pill(0, 1), pill(1, 1), pill(2, 0), pill(2, 1), from, seen];
  const at = placeLabel("Game 15", out[1], { pills, avoid: [out[0].pts], box: view });
  const w = 7 * 6.5;
  const left = at.anchor === "end" ? at.x - w : at.x;
  for (const p of pills) {
    const cx = (p.left + p.right) / 2, cy = (p.top + p.bottom) / 2;
    const ov = Math.min(left + w, cx + 14) > Math.max(left, cx - 14) && Math.min(at.y + 2, cy + 9) > Math.max(at.y - 9, cy - 9);
    assert.ok(!ov, "label covers a pill number");
  }
});

test("next-door destination on the same row: a low hop, no loop", () => {
  const from = pill(5, 1);
  const out = planArrows({ from, arrows: [{ role: "winner", to: pill(5, 2) }], obstacles: [pill(4, 1), pill(4, 2), pill(4, 3)], box });
  const ys = out[0].pts.map((p) => p.y);
  const xs = out[0].pts.map((p) => p.x);
  assert.ok(Math.min(...ys) > from.top - 24, "stays low");
  assert.ok(Math.max(...xs) < pill(5, 2).right - 8, "doesn't wrap round to the far side");
});

// Where the teams came from (JD, 2026-11-09: "show in dotted same colors
// (green wins red losses) where the teams came from"): up to four arrows.
const L = () => JSON.parse(readFileSync(new URL("./fixtures/worlds-2026-timeline-layout.json", import.meta.url), "utf8"));
function feedersIn(layout, id) {
  const out = [];
  for (const [src, d] of Object.entries(layout.dest)) {
    if (d.winner === id) out.push({ id: src, role: "winner" });
    if (d.loser === id) out.push({ id: src, role: "loser" });
  }
  return out;
}
const onLeftOrTop = (p, r) => (Math.abs(p.x - r.left) <= 6 && p.y >= r.top - 6 && p.y <= r.bottom + 6) || (Math.abs(p.y - r.top) <= 6 && p.x >= r.left - 6 && p.x <= r.right + 6);

function planAll(layout, g) {
  const byId = new Map(layout.games.map((x) => [x.id, x]));
  const sameDay = layout.games.filter((x) => x.day === g.day);
  const panel = { left: 0, top: 0, right: Math.max(...sameDay.map((x) => gridPillRect(x).right)) + 8, bottom: 6 * 52 };
  const arrows = [];
  const d = layout.dest[g.id] ?? {};
  for (const role of ["winner", "loser"]) {
    const t = byId.get(d[role]);
    if (!t) continue;
    const r = gridPillRect(t);
    arrows.push(t.day === g.day ? { role, to: r, id: t.id } : { role, toward: { x: (r.left + r.right) / 2, y: panel.bottom + 200 + r.top }, reach: 46 });
  }
  for (const f of feedersIn(layout, g.id)) {
    const t = byId.get(f.id);
    const r = gridPillRect(t);
    // An earlier day sits above this panel.
    arrows.push(t.day === g.day ? { role: f.role, dir: "in", to: r, id: t.id } : { role: f.role, dir: "in", toward: { x: (r.left + r.right) / 2, y: -200 - (6 * 52 - r.top) }, reach: 46 });
  }
  const obstacles = sameDay.filter((x) => x.id !== g.id && !arrows.some((a) => a.id === x.id)).map((x) => gridPillRect(x));
  return { arrows, out: planArrows({ from: gridPillRect(g), arrows, obstacles, box: panel }) };
}

test("every World Series game: in and out arrows (up to 4) never cross, each has its own ends, incoming land on the left or top", () => {
  const layout = L();
  let fours = 0;
  let checked = 0;
  for (const g of layout.games) {
    const { arrows, out } = planAll(layout, g);
    const name = `${g.division} ${g.label}`;
    assert.equal(out.length, arrows.length, `${name}: every arrow drawn`);
    if (arrows.length === 4) fours++;
    const from = gridPillRect(g);
    for (let i = 0; i < out.length; i++) {
      if (out[i].dir === "in") assert.ok(onLeftOrTop(out[i].end, from), `${name}: incoming arrow lands on the left or top`);
      for (let j = 0; j < i; j++) {
        checked++;
        assert.ok(!polylinesCross(out[i].pts, out[j].pts), `${name}: ${out[i].dir} ${out[i].role} crosses ${out[j].dir} ${out[j].role}`);
        for (const p of [out[i].start, out[i].end]) for (const q of [out[j].start, out[j].end]) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 10, `${name}: two arrows share an end`);
      }
    }
  }
  assert.ok(fours >= 40, `games with four arrows: ${fours}`);
  assert.ok(checked >= 400, `pairs checked: ${checked}`);
});

test("Coed D: G32 has two green feeders, G33 one red and one green, G21 red from G17 and green from G15; a seeded first-round game has none", () => {
  const layout = L();
  const coed = (n) => layout.games.find((g) => g.division === "Coed D" && g.label === `G${n}`);
  const roles = (n) => feedersIn(layout, coed(n).id).map((f) => `${f.role === "winner" ? "W" : "L"}${layout.games.find((g) => g.id === f.id).label.slice(1)}`).sort();
  assert.deepEqual(roles(32), ["W25", "W26"]);
  assert.deepEqual(roles(33), ["L32", "W31"]);
  assert.deepEqual(roles(21), ["L17", "W15"]);
  assert.deepEqual(roles(1), []);
  const { out } = planAll(layout, coed(32));
  assert.deepEqual(out.filter((a) => a.dir === "in").map((a) => a.role), ["winner", "winner"]);
});

test("an off-screen feeder gets a short stub pointing into the open game's left or top side", () => {
  const from = pill(2, 3);
  const out = planArrows({ from, arrows: [{ role: "winner", dir: "in", toward: { x: from.left + 20, y: -300 }, reach: 46 }, { role: "loser", dir: "in", to: pill(2, 1) }, { role: "winner", to: pill(3, 5) }], box });
  assert.equal(out.length, 3);
  const stub = out[0];
  assert.equal(stub.kind, "stub");
  assert.ok(stub.u.y < 0, "the stub reaches up toward the earlier day");
  assert.ok(onLeftOrTop(stub.end, from), "head on the open pill's left or top");
  assert.ok(Math.hypot(stub.end.x - stub.base.x, stub.end.y - stub.base.y) < 0.01, "drawn into the pill");
  for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) assert.ok(!polylinesCross(out[i].pts, out[j].pts));
});

test("open game at the lane's left edge: an off-screen feeder still gets a stub, slanting into the top", () => {
  const view = { left: 0, top: 0, right: 92 * 3, bottom: 52 * 6 };
  const from = { left: 4, top: 52 + 4, right: 88, bottom: 52 + 48 }; // no room on the left
  const out = planArrows({ from, arrows: [{ role: "winner", dir: "in", toward: { x: 0, y: 78 }, reach: (s, u) => Math.min(46, u.x < 0 ? (s.x - view.left) / -u.x : 46, u.y < 0 ? (s.y - view.top) / -u.y : 46) }], box: view });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "stub");
  assert.ok(Math.abs(out[0].end.y - (from.top - 3)) < 0.01, "lands on the top side");
  assert.ok(out[0].u.y < 0 && out[0].u.x < 0, "comes in from up and to the left, toward the feeder");
});
