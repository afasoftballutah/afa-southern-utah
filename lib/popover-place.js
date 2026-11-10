// Where the timeline's game card goes on a wide screen (JD, 2026-11-09:
// "dont want this to happen, where the line is blocked"). The card must not
// cover the open game, either destination, or the arrows between them, so
// it is placed OUTSIDE the box that holds all of them (`keep`): below it,
// else above, else right, else left — the first that fits on screen. If
// none fits whole, the page is scrolled once so one does (`scroll`), and
// meanwhile the spot covering the least of the box is used.

/** Union of rects ({left, top, right, bottom}), grown by `pad`. Nulls skipped. */
export function unionRect(rects, pad = 0) {
  const list = (rects ?? []).filter(Boolean);
  if (!list.length) return null;
  return {
    left: Math.min(...list.map((r) => r.left)) - pad,
    top: Math.min(...list.map((r) => r.top)) - pad,
    right: Math.max(...list.map((r) => r.right)) + pad,
    bottom: Math.max(...list.map((r) => r.bottom)) + pad,
  };
}

function overlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * @param card    { w, h } the card's size
 * @param keep    rect to keep clear (open game + destinations + arrows)
 * @param anchor  the open game's rect (the card prefers to sit near it)
 * @param view    { w, h } the window
 * @returns { left, top, clear, scroll? } — clear is false when nothing fit
 *   whole; scroll is how far to scroll the page so it would
 */
export function placeClear(card, keep, anchor, view, { gap = 8, margin = 12 } = {}) {
  const clampX = (x) => Math.min(Math.max(margin, x), Math.max(margin, view.w - card.w - margin));
  const clampY = (y) => Math.min(Math.max(margin, y), Math.max(margin, view.h - card.h - margin));
  const ax = anchor.left + (anchor.right - anchor.left) / 2;
  const ay = anchor.top + (anchor.bottom - anchor.top) / 2;
  const spots = [
    { left: clampX(ax - card.w / 2), top: keep.bottom + gap }, // below
    { left: clampX(ax - card.w / 2), top: keep.top - card.h - gap }, // above
    { left: keep.right + gap, top: clampY(ay - card.h / 2) }, // right
    { left: keep.left - card.w - gap, top: clampY(ay - card.h / 2) }, // left
  ];
  const fits = (s) => s.left >= margin && s.top >= margin && s.left + card.w <= view.w - margin && s.top + card.h <= view.h - margin;
  const rect = (s) => ({ left: s.left, top: s.top, right: s.left + card.w, bottom: s.top + card.h });
  const dist = (s) => Math.hypot(s.left + card.w / 2 - ax, s.top + card.h / 2 - ay);
  // First that fits whole, in this order: below, above, right, left. Below
  // and above keep the field names and the hours in view; beside is for
  // when the window is too short.
  const whole = spots.filter((s) => fits(s) && overlap(rect(s), keep) === 0);
  if (whole.length) return { ...whole[0], clear: true };
  // Nothing fits whole: pull each spot on screen and take the one covering
  // the least of what has to stay visible.
  const onScreen = spots.map((s) => ({ left: clampX(s.left), top: clampY(s.top) }));
  onScreen.sort((a, b) => overlap(rect(a), keep) - overlap(rect(b), keep) || dist(a) - dist(b));
  const best = { ...onScreen[0], clear: overlap(rect(onScreen[0]), keep) === 0 };
  // The page can usually scroll: say how far to move it so the card fits
  // whole below (or above) the box with the box still on screen.
  const below = keep.bottom + gap + card.h - (view.h - margin);
  if (below > 0 && keep.top - below >= margin) best.scroll = below;
  else {
    const above = keep.top - card.h - gap - margin;
    if (above < 0 && keep.bottom - above <= view.h - margin) best.scroll = above;
  }
  return best;
}
