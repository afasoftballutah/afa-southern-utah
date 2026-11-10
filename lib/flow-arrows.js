// Where the open game's two arrows (winner, loser) start and end on the
// timeline so they never cross each other (JD, 2026-11-09: "can we make it
// so the lines dont cross") and, as far as the layout allows, never run
// through a pill. Pure geometry, no DOM: rects are { left, top, right, bottom }.
//
// Each arrow gets its own anchor on the open pill and on its destination,
// picked from a small set of edge points; every pair is scored (crossing,
// pills in the way, leaving the panel, length) and the cheapest pair wins.

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

function curveCandidates(from, to, obstacles, box, strong) {
  const fc = center(from);
  const tc = center(to);
  const out = [];
  for (const [sName, s] of Object.entries(SIDES)) {
    const sFacing = s.n.x * (tc.x - fc.x) + s.n.y * (tc.y - fc.y) > 0;
    for (const sf of START_F[sName]) {
      const start = off(s.at(from, sf), s.n, 3);
      for (const [eName, e] of Object.entries(SIDES)) {
        const eFacing = e.n.x * (fc.x - tc.x) + e.n.y * (fc.y - tc.y) > 0;
        for (const ef of END_F[eName]) {
          const end = off(e.at(to, ef), e.n, 4);
          const dist = Math.hypot(end.x - start.x, end.y - start.y);
          const k = Math.max(14, Math.min(70, dist * 0.45));
          const c1 = off(start, s.n, k);
          const c2 = off(end, e.n, k);
          const pts = cubicPoints(start, c1, c2, end);
          let cost = length(pts);
          if (!sFacing) cost += 400;
          if (!eFacing) cost += 400;
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

function stubCandidates(from, toward, reach, obstacles, box, strong) {
  const fc = center(from);
  const out = [];
  for (const [sName, s] of Object.entries(SIDES)) {
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

/**
 * Plan the open game's arrows.
 *   from:      the open pill's rect
 *   arrows:    [{ role, to: rect }]                 a destination in view, or
 *              [{ role, toward: {x,y}, reach, alt? }] a short stub pointing at one
 *                                                  out of view (reach: px, or
 *                                                  (start, u) => px; alt: where
 *                                                  to point when there is no room)
 *   obstacles: other pill rects to keep clear of (the other destination is
 *              added automatically)
 *   box:       the area the arrows should stay inside
 * Returns [{ role, kind, d, start, end, pts, tip?, u? }] in the input order.
 */
export function planArrows({ from, arrows, obstacles = [], box = null }) {
  const lists = arrows.map((a, i) => {
    // The other destination is never crossed; other pills only lightly.
    const others = arrows.filter((b, j) => j !== i && b.to).map((b) => b.to);
    let list = a.to ? curveCandidates(from, a.to, obstacles, box, others) : stubCandidates(from, a.toward, a.reach, obstacles, box, others);
    // No room to point that way (e.g. the bottom row, next game on another
    // day): point at the fallback instead (later in the day).
    if (!list.length && !a.to && a.alt) list = stubCandidates(from, a.alt, a.reach, obstacles, box, others);
    return list.slice(0, 14);
  });
  if (lists.length === 1) return lists[0].length ? [{ role: arrows[0].role, ...lists[0][0] }] : [];
  if (lists.length !== 2) return [];
  const [A, B] = lists;
  let best = null;
  for (const a of A) {
    for (const b of B) {
      let cost = a.cost + b.cost;
      if (polylinesCross(a.pts, b.pts)) cost += CROSS;
      if (Math.hypot(a.start.x - b.start.x, a.start.y - b.start.y) < 10) cost += 500;
      if (Math.hypot(a.end.x - b.end.x, a.end.y - b.end.y) < 10) cost += 500;
      if (!best || cost < best.cost) best = { cost, a, b };
    }
  }
  if (!best) return [A[0], B[0]].map((c, i) => (c ? { role: arrows[i].role, ...c } : null)).filter(Boolean);
  return [
    { role: arrows[0].role, ...best.a },
    { role: arrows[1].role, ...best.b },
  ];
}

/** Pill rect on the timeline grid (matches the CSS: 92px hours, 52px rows, 44px pills). */
export function gridPillRect({ row, offset, length = 60 }, { hourPx = 92, rowPx = 52, gap = 4 } = {}) {
  const left = (offset / 60) * hourPx + gap;
  const top = row * rowPx + 4;
  return { left, top, right: left + (length / 60) * hourPx - gap * 2, bottom: top + 44 };
}
