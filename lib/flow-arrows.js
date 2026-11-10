// Where the open game's arrows start and end on the timeline so they never
// cross each other (JD, 2026-11-09: "can we make it so the lines dont cross")
// and, as far as the layout allows, never run through a pill. Up to four:
// two solid ones out (where the winner and loser go) and two dotted ones in
// (where the teams came from: JD, 2026-11-09, "show in dotted same colors
// (green wins red losses) where the teams came from"). Incoming arrows land
// on the open pill's left or top side. Pure geometry, no DOM: rects are
// { left, top, right, bottom }.
//
// Each arrow gets its own anchors, picked from a small set of edge points;
// every combination is scored (crossing, shared anchors, pills in the way,
// leaving the panel, length) and the cheapest one wins.

const SIDES = {
  right: { n: { x: 1, y: 0 }, at: (r, f) => ({ x: r.right, y: r.top + (r.bottom - r.top) * f }) },
  left: { n: { x: -1, y: 0 }, at: (r, f) => ({ x: r.left, y: r.top + (r.bottom - r.top) * f }) },
  top: { n: { x: 0, y: -1 }, at: (r, f) => ({ x: r.left + (r.right - r.left) * f, y: r.top }) },
  bottom: { n: { x: 0, y: 1 }, at: (r, f) => ({ x: r.left + (r.right - r.left) * f, y: r.bottom }) },
};
const START_F = { right: [0.3, 0.5, 0.7], left: [0.3, 0.5, 0.7], top: [0.25, 0.5, 0.75], bottom: [0.25, 0.5, 0.75] };
const END_F = { right: [0.35, 0.5, 0.65], left: [0.35, 0.5, 0.65], top: [0.3, 0.5, 0.7], bottom: [0.3, 0.5, 0.7] };
const SAMPLES = 20;
const CROSS = 100000;

const center = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
const off = (p, n, k) => ({ x: p.x + n.x * k, y: p.y + n.y * k });
const fmt = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

function cubicPoints(a, c1, c2, b, n = SAMPLES) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return pts;
}

function inside(p, r, shrink = 2) {
  return p.x > r.left + shrink && p.x < r.right - shrink && p.y > r.top + shrink && p.y < r.bottom - shrink;
}

function segCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when two polylines (arrays of points) cross or touch within `near` px. */
export function polylinesCross(a, b, near = 0) {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segCross(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  if (near > 0) {
    for (const p of a) for (const q of b) if (Math.hypot(p.x - q.x, p.y - q.y) < near) return true;
  }
  return false;
}

function length(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

function curveCandidates(from, to, obstacles, box, strong, endSides = null) {
  const fc = center(from);
  const tc = center(to);
  const out = [];
  for (const [sName, s] of Object.entries(SIDES)) {
    const sDot = s.n.x * (tc.x - fc.x) + s.n.y * (tc.y - fc.y);
    for (const sf of START_F[sName]) {
      const start = off(s.at(from, sf), s.n, 3);
      for (const [eName, e] of Object.entries(SIDES)) {
        if (endSides && !endSides.includes(eName)) continue;
        const eDot = e.n.x * (fc.x - tc.x) + e.n.y * (fc.y - tc.y);
        for (const ef of END_F[eName]) {
          const end = off(e.at(to, ef), e.n, 4);
          const dist = Math.hypot(end.x - start.x, end.y - start.y);
          let k = Math.max(14, Math.min(70, dist * 0.45));
          // Top to top (or bottom to bottom): a low hop over the gap, not a loop.
          if (sName === eName && (sName === "top" || sName === "bottom")) k = Math.min(k, 18);
          const c1 = off(start, s.n, k);
          const c2 = off(end, e.n, k);
          const pts = cubicPoints(start, c1, c2, end);
          let cost = length(pts);
          // Sides facing away cost a lot; sideways ones (a hop between
          // neighbours on one row) a little.
          cost += sDot > 1 ? 0 : sDot < -1 ? 400 : 150;
          cost += eDot > 1 ? 0 : eDot < -1 ? 400 : 150;
          if (sf !== 0.5) cost += 6;
          if (ef !== 0.5) cost += 6;
          cost += hits(pts, from, to, obstacles, box, strong);
          out.push({ cost, start, end, pts, d: `M${fmt(start)} C${fmt(c1)} ${fmt(c2)} ${fmt(end)}`, kind: "curve" });
        }
      }
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

function stubCandidates(from, toward, reach, obstacles, box, strong, startSides = null) {
  const fc = center(from);
  const out = [];
  for (const [sName, s] of Object.entries(SIDES)) {
    if (startSides && !startSides.includes(sName)) continue;
    const facing = s.n.x * (toward.x - fc.x) + s.n.y * (toward.y - fc.y) > 0;
    for (const sf of START_F[sName]) {
      const start = off(s.at(from, sf), s.n, 3);
      const dx = toward.x - start.x;
      const dy = toward.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const u = { x: dx / len, y: dy / len };
      // Leave the pill outward: never start into the pill itself.
      if (u.x * s.n.x + u.y * s.n.y <= 0.05) continue;
      const r = typeof reach === "function" ? reach(start, u) : reach;
      if (!(r >= 14)) continue;
      const tip = off(start, u, r);
      const pts = Array.from({ length: 9 }, (_, i) => off(start, u, (r * i) / 8));
      let cost = (facing ? 0 : 400) + (sf !== 0.5 ? 6 : 0);
      cost += hits(pts, from, null, obstacles, box, strong);
      // A stub must not end on top of another pill.
      for (const o of obstacles) if (inside(tip, o, 0)) cost += 150;
      out.push({ cost, start, end: tip, tip, u, pts, d: `M${fmt(start)} L${fmt(tip)}`, kind: "stub" });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

function hits(pts, from, to, obstacles, box, strong = []) {
  let cost = 0;
  const hull = to
    ? { left: Math.min(from.left, to.left) - 16, right: Math.max(from.right, to.right) + 16, top: Math.min(from.top, to.top) - 16, bottom: Math.max(from.bottom, to.bottom) + 16 }
    : null;
  const inner = pts.slice(2, -2);
  for (const p of inner) {
    if (inside(p, from, 0)) cost += 2000;
    if (to && inside(p, to, 0)) cost += 2000;
    for (const o of strong) if (inside(p, o, 0)) cost += 2000;
    // Faded pills in the way only break ties: a short, plain line reads
    // better than one that loops around them.
    for (const o of obstacles) if (inside(p, o)) cost += 12;
    // Stay near the two pills, so the card (placed clear of them) never
    // covers a line.
    if (hull && (p.x < hull.left || p.x > hull.right || p.y < hull.top || p.y > hull.bottom)) cost += 60;
    if (box && (p.x < box.left || p.x > box.right || p.y < box.top || p.y > box.bottom)) cost += 300;
  }
  return cost;
}

const IN_SIDES = ["left", "top"];
const PER_ARROW = { 1: 14, 2: 14, 3: 10, 4: 8 };

// A stub drawn into the open pill: the same geometry as an outgoing stub
// toward the feeder, reversed so the head lands on the pill. `base` is the
// end on the pill, `tip` the far end, `u` points from the pill outward.
function reverseStub(c) {
  return { ...c, base: c.start, start: c.tip, end: c.start, pts: [...c.pts].reverse(), d: `M${fmt(c.tip)} L${fmt(c.start)}` };
}

function candidatesFor(a, from, arrows, obstacles, box) {
  const inbound = a.dir === "in";
  // The other arrows' far pills are never crossed; other pills only lightly.
  const others = arrows.filter((b) => b !== a && b.to && b.to !== a.to).map((b) => b.to);
  if (a.to) {
    return inbound ? curveCandidates(a.to, from, obstacles, box, others, IN_SIDES) : curveCandidates(from, a.to, obstacles, box, others);
  }
  let list = stubCandidates(from, a.toward, a.reach, obstacles, box, others, inbound ? IN_SIDES : null);
  // No room to point that way (e.g. the bottom row, next game on another
  // day): point at the fallback instead (later in the day).
  if (!list.length && a.alt) list = stubCandidates(from, a.alt, a.reach, obstacles, box, others, inbound ? IN_SIDES : null);
  if (!list.length && inbound) list = stubCandidates(from, a.toward, a.reach, obstacles, box, others);
  return inbound ? list.map(reverseStub) : list;
}

// Ends of an arrow, and which one sits on the open pill.
const ends = (c, a) => (a.dir === "in" ? { own: c.end, far: c.start } : { own: c.start, far: c.end });

function pairCost(a, b, ca, cb) {
  let cost = 0;
  if (polylinesCross(ca.pts, cb.pts)) cost += CROSS;
  // Running alongside, almost touching, reads as one line.
  else if (polylinesCross(ca.pts.slice(3, -3), cb.pts.slice(3, -3), 5)) cost += 300;
  const ea = ends(ca, a);
  const eb = ends(cb, b);
  for (const p of [ea.own, ea.far]) for (const q of [eb.own, eb.far]) if (Math.hypot(p.x - q.x, p.y - q.y) < 10) cost += 3000;
  // Of the two outgoing arrows, the one to the lower destination leaves below.
  if (a.dir !== "in" && b.dir !== "in") {
    const aimA = a.to ? (a.to.top + a.to.bottom) / 2 : a.toward.y;
    const aimB = b.to ? (b.to.top + b.to.bottom) / 2 : b.toward.y;
    if ((aimA - aimB) * (ca.start.y - cb.start.y) < 0) cost += 40;
  }
  // Of the two incoming ones, the one from higher up lands higher / further left.
  if (a.dir === "in" && b.dir === "in") {
    const fa = a.to ? (a.to.top + a.to.bottom) / 2 : a.toward.y;
    const fb = b.to ? (b.to.top + b.to.bottom) / 2 : b.toward.y;
    if ((fa - fb) * (ca.end.y - cb.end.y + (cb.end.x - ca.end.x)) < 0) cost += 40;
  }
  return cost;
}

/**
 * Plan the open game's arrows.
 *   from:      the open pill's rect
 *   arrows:    [{ role, dir?, to: rect }]                 the other pill in view, or
 *              [{ role, dir?, toward: {x,y}, reach, alt? }] a short stub pointing at one
 *                                                        out of view (reach: px, or
 *                                                        (start, u) => px; alt: where
 *                                                        to point when there is no room)
 *              dir: "out" (default, open pill → next game) or "in" (feeder → open
 *              pill, landing on its left or top side)
 *   obstacles: other pill rects to keep clear of (the arrows' own pills are
 *              added automatically)
 *   box:       the area the arrows should stay inside
 * Returns [{ role, dir, kind, d, start, end, pts, tip?, u?, base? }] in the input
 * order; start → end is the drawing direction (the head is at end).
 */
export function planArrows({ from, arrows, obstacles = [], box = null }) {
  const n = arrows.length;
  if (!n || n > 4) return [];
  const k = PER_ARROW[n];
  const lists = arrows.map((a) => candidatesFor(a, from, arrows, obstacles, box).slice(0, k));
  const tag = (i, c) => ({ role: arrows[i].role, dir: arrows[i].dir === "in" ? "in" : "out", ...(arrows[i].key ? { key: arrows[i].key } : {}), ...c });
  if (n === 1) return lists[0].length ? [tag(0, lists[0][0])] : [];
  // Pair costs once, then try every combination.
  const pair = new Map();
  const pc = (i, j, x, y) => {
    const key = `${i}.${j}.${x}.${y}`;
    if (!pair.has(key)) pair.set(key, pairCost(arrows[i], arrows[j], lists[i][x], lists[j][y]));
    return pair.get(key);
  };
  const live = lists.map((l, i) => (l.length ? i : -1)).filter((i) => i >= 0);
  let best = null;
  const pick = new Array(n).fill(-1);
  const walk = (d, cost) => {
    if (best && cost >= best.cost) return;
    if (d === live.length) {
      best = { cost, pick: [...pick] };
      return;
    }
    const i = live[d];
    for (let x = 0; x < lists[i].length; x++) {
      let c = cost + lists[i][x].cost;
      for (let e = 0; e < d; e++) c += pc(live[e], i, pick[live[e]], x);
      pick[i] = x;
      walk(d + 1, c);
    }
    pick[i] = -1;
  };
  walk(0, 0);
  if (!best) return [];
  return live.map((i) => tag(i, lists[i][best.pick[i]]));
}

/** Pill rect on the timeline grid (matches the CSS: 92px hours, 52px rows, 44px pills). */
export function gridPillRect({ row, offset, length = 60 }, { hourPx = 92, rowPx = 52, gap = 4 } = {}) {
  const left = (offset / 60) * hourPx + gap;
  const top = row * rowPx + 4;
  return { left, top, right: left + (length / 60) * hourPx - gap * 2, bottom: top + 44 };
}

/** The part of rect r inside box, or null when less than `min` px of it shows. */
export function visiblePart(r, box, min = 18) {
  const v = { left: Math.max(r.left, box.left), top: Math.max(r.top, box.top), right: Math.min(r.right, box.right), bottom: Math.min(r.bottom, box.bottom) };
  return v.right - v.left >= min && v.bottom - v.top >= min ? v : null;
}

/** Where a fully off-screen destination lies, as a point on the box edge to aim at. */
export function aimAt(r, box) {
  const c = center(r);
  const x = Math.min(Math.max(c.x, box.left), box.right);
  const y = Math.min(Math.max(c.y, box.top), box.bottom);
  return { x, y };
}

/**
 * Where a stub's name goes: beside the stub, on whichever side covers no
 * pill's number and no other arrow. label: text; stub: { start, tip, u };
 * pills: rects; avoid: point lists. Returns { x, y, anchor }.
 */
export function placeLabel(label, stub, { pills = [], avoid = [], box = null } = {}) {
  const w = label.length * 6.5;
  const { start, tip, u } = stub;
  const across = Math.abs(u.x) >= Math.abs(u.y);
  const cands = across
    ? [
        { x: start.x + (u.x > 0 ? 2 : -2), y: tip.y + 15, anchor: u.x > 0 ? "start" : "end" },
        { x: start.x + (u.x > 0 ? 2 : -2), y: tip.y - 7, anchor: u.x > 0 ? "start" : "end" },
        { x: tip.x, y: tip.y + 15, anchor: u.x > 0 ? "end" : "start" },
        { x: tip.x, y: tip.y - 7, anchor: u.x > 0 ? "end" : "start" },
        // past the tip, along the row gap it points into
        { x: tip.x + (u.x > 0 ? 6 : -6), y: tip.y + 4, anchor: u.x > 0 ? "start" : "end" },
      ]
    : [
        { x: tip.x + 7, y: tip.y + 4, anchor: "start" },
        { x: tip.x - 7, y: tip.y + 4, anchor: "end" },
        { x: tip.x + 7, y: tip.y - (u.y > 0 ? 14 : -14), anchor: "start" },
        { x: tip.x - 7, y: tip.y - (u.y > 0 ? 14 : -14), anchor: "end" },
      ];
  const rectOf = (c) => {
    const left = c.anchor === "end" ? c.x - w : c.x;
    return { left, right: left + w, top: c.y - 9, bottom: c.y + 2 };
  };
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  let best = null;
  cands.forEach((c, i) => {
    const r = rectOf(c);
    let cost = i;
    for (const p of pills) {
      const pc = center(p);
      cost += overlap(r, { left: pc.x - 14, right: pc.x + 14, top: pc.y - 9, bottom: pc.y + 9 }) * 4; // the number
      cost += overlap(r, p) * 1.5; // its corners
    }
    for (const line of avoid) for (const q of line) if (q.x > r.left - 2 && q.x < r.right + 2 && q.y > r.top - 2 && q.y < r.bottom + 2) cost += 200;
    if (box && (r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom)) cost += 300;
    if (!best || cost < best.cost) best = { cost, c };
  });
  return best.c;
}
