// The field grid of every game, shared by the MCP team view (ui://afa/team,
// lib/mcp/team-view.js) and the site's Path view (components/PathView.js;
// JD 2026-11-10: "a different view like the claude view"). One source for
// both: plain DOM script in a string, so the MCP view can inline it in its
// self-contained HTML and the site can run the same code in a shadow root.
//
// GRID_JS needs, from the page around it: el, add, tone (lib/mcp/views.js
// CARD_JS), siteLink(url, text, cls) and size(). It defines gridEl(t,
// picked, host) and keyEl(grid), where t = { grid, picker } as built by
// fieldGrid / gridTrack (lib/mcp/field-grid.js).

export const GRID_CSS = String.raw`
.fg-key { display: flex; flex-wrap: nowrap; gap: 0.25rem 0.45rem; font-size: 0.75rem; color: var(--label); flex: 0 0 auto; width: max-content; margin-left: auto; }
.fg-key span { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; flex: none; }
.fg-key svg { flex: none; }
.fg-head { position: sticky; top: 0; z-index: 8; background: var(--card); border-radius: 0.875rem 0.875rem 0 0; box-shadow: 0 1px 0 var(--hair); padding: 0.375rem 0 0.25rem; }
.fg-head:not(.v) { padding: 0.5rem 0.75rem; }
.fg-top { display: flex; align-items: center; gap: 0.5rem; min-width: 0; padding: 0 0.5rem 0.25rem; }
.fg-who { display: flex; align-items: baseline; gap: 0.25rem 0.4rem; padding: 0; font-size: 0.75rem; color: var(--label); min-width: 0; flex: 1 1 auto; overflow: hidden; }
.fg-who .nm { font-size: 0.8125rem; font-weight: 700; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fg-who .dv, .fg-who .rc { flex: none; white-space: nowrap; }
.fg-fields { display: flex; }
.fg-fname { text-align: center; font-size: 0.75rem; font-weight: 600; line-height: 1.15; color: var(--ink); }
.fg-head.v .fg-fname { font-size: 0.6875rem; }
/* Very slight alternating field-column tints (JD: "barely there just
   enough"). Even columns only; the time column is left alone. Sits
   behind lines and boxes (z-index 0). */
.fg-coltint { position: absolute; z-index: 0; pointer-events: none; background: rgba(0, 0, 0, 0.025); }
:root.dark .fg-coltint { background: rgba(255, 255, 255, 0.045); }
.fg-fname.tint { background: rgba(0, 0, 0, 0.025); }
:root.dark .fg-fname.tint { background: rgba(255, 255, 255, 0.045); }
.fg-head + .fg-scroll { border-radius: 0 0 0.875rem 0.875rem; }
/* The grid box is thousands of px wide (hour columns). Keep the scroll
   pane at the host's width so the page itself doesn't grow sideways
   (JD 2026-11-10: schedule "running off the side" on desktop). Grid/flex
   min-width:auto would otherwise size .fg-outer to the content width,
   and overflow-x:auto would never kick in. */
.fg-outer { min-width: 0; max-width: 100%; }
.fg-scroll.v { overflow: visible; }
.fg-scroll { overflow-x: auto; overscroll-behavior-x: contain; min-width: 0; max-width: 100%; border-radius: 0.875rem; background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 20 60 / 0.06); }
.fg { position: relative; }
.fg-lab { position: absolute; font-size: 0.6875rem; color: var(--label); white-space: nowrap; line-height: 1; }
.fg-lab.field { font-size: 0.75rem; font-weight: 600; color: var(--ink); }
.fg-lab.day { font-size: 0.8125rem; font-weight: 700; color: var(--ink); z-index: 4; background: transparent; padding: 0 0.25rem; border-radius: 0.25rem; word-spacing: 0.2em; }
.fg-side { position: sticky; left: 0; z-index: 4; background: var(--card); }
.fg-line { position: absolute; background: var(--hair); }
.fg-fold {
  position: absolute; z-index: 1; display: flex; align-items: center; justify-content: center; border: 0; cursor: pointer;
  background: repeating-linear-gradient(135deg, var(--chip) 0 6px, transparent 6px 12px); color: var(--label);
  font: inherit; font-size: 0.625rem; font-weight: 600; border-radius: 0.375rem;
}
.fg-fold span { background: var(--card); padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
.fg-fold.v span { writing-mode: vertical-rl; transform: rotate(180deg); }
.fg-now { position: absolute; z-index: 3; background: #ef4444; pointer-events: none; }
.fg-nowtag { position: absolute; z-index: 5; font-size: 0.625rem; font-weight: 700; color: #fff; background: #ef4444; border-radius: 999px; padding: 0.0625rem 0.375rem; white-space: nowrap; pointer-events: none; }
svg.fg-arrows { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; overflow: visible; }
button.pill {
  position: absolute; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 1px solid var(--tone-solid); border-radius: 0.625rem; background: var(--tone-bg); color: var(--tone-ink);
  font: inherit; font-size: 0.8125rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1;
  cursor: pointer; padding: 0; overflow: visible; transition: opacity 200ms ease, box-shadow 120ms ease;
}
button.pill.losers, button.pill.if { background: #fff; font-weight: 450; }
:root.dark button.pill.losers, :root.dark button.pill.if { background: var(--card); }
button.pill.if { border-style: dashed; }
button.pill.final { border-color: #c99a1e; }
button.pill.done { background: var(--tone-solid); color: #fff; }
button.pill.done.losers { box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.75); }
/* Single-team Path view: a game this team won is green, a loss is red
   (JD: "wins should just become green … when on the single team view"). */
button.pill.done.won-box, button.pill.won-box {
  background: var(--win); color: #fff; border-color: var(--win); box-shadow: none;
}
button.pill.done.lost-box, button.pill.lost-box {
  background: var(--lose); color: #fff; border-color: var(--lose); box-shadow: none;
}
button.pill .gno { font-size: 0.625rem; font-weight: 600; opacity: 0.9; }
button.pill.chip { z-index: 3; border-radius: 0.375rem; }
button.pill.chip .gno { font-size: 0.5625rem; }
button.pill.chip.cv .gno { writing-mode: vertical-rl; transform: rotate(180deg); }
button.pill .scr { font-size: 0.8125rem; font-weight: 700; margin-top: 0.125rem; white-space: nowrap; }
button.pill .div { position: absolute; top: 0.1875rem; left: 0.3rem; font-size: 0.5rem; font-weight: 600; opacity: 0.75; }
button.pill.dim { opacity: 0.22; }
button.pill .fin { position: absolute; top: 0.1875rem; left: 0.3125rem; font-size: 0.625rem; font-weight: 400; font-style: italic; color: var(--lose); line-height: 1; padding-right: 2px; overflow: visible; }
/* Single-team Path view: shorter, narrower boxes (JD: field time boxes
   smaller too). Game number stays centered; place is a tiny italic
   corner label, even smaller than the original 9th (JD follow-up).
   Scored boxes put the score under the number ("G5" over "12-5"). */
button.pill.compact {
  box-sizing: border-box; flex-direction: column; gap: 0.05rem; font-size: 0.6875rem;
  padding: 1px 2px 2px;
}
button.pill.compact .gno { font-size: 0.6875rem; font-weight: inherit; opacity: 1; line-height: 1; }
button.pill.compact .scr { font-size: 0.5625rem; font-weight: 700; margin-top: 0; line-height: 1; }
/* Tiny italic place labels ("2nd", "3rd", …): 2px right padding so the
   italic 'd' overhang is not clipped by a tight shrink-to-fit box or by
   WebKit overflow clipping on the rounded pill (JD: "The right side of
   the d is cut off in 2nd and 3rd"). */
button.pill.compact .fin { position: absolute; top: 1px; left: 2px; font-size: 0.5rem; font-weight: 400; font-style: italic; line-height: 1; opacity: 0.85; padding-right: 2px; overflow: visible; }
button.pill .fin.cup { font-style: normal; color: #c99a1e; }
/* Faint gold star watermark on championship and if-necessary boxes.
   Exact SVG path and color from the Timeline mark (components/ScheduleTimeline.js
   Star + .tl-bgstar; JD 2026-11-09: "star can be faint in the background
   behind all the numbers"). Same color #d4a72c at opacity 0.2. Compact
   pills are 32px tall, so the star is 1.75rem to stay inside the box;
   un-compact pills keep the Timeline's 2.375rem. */
button.pill .bgstar {
  position: absolute; left: 50%; top: 50%; width: 2.375rem; height: 2.375rem;
  transform: translate(-50%, -50%); color: #d4a72c; opacity: 0.2;
  pointer-events: none; z-index: 0;
}
button.pill.compact .bgstar { width: 1.75rem; height: 1.75rem; }
button.pill .gno, button.pill .scr, button.pill .div { position: relative; z-index: 1; }
button.pill .fin, button.pill .dot { z-index: 1; }
button.pill.lit { z-index: 3; }
/* Unplayed win-path boxes (championship included): green text, a thin
   green border, and no fill. Only the current next game keeps the light
   green fill plus the glow (JD: "Make the win games font green and no
   background except in the current game"). Played wins stay .won-box
   (solid green, white text). Loss boxes are unchanged. */
button.pill.route {
  background: transparent; color: var(--win);
  border: 1px solid var(--win); font-weight: 450; box-shadow: none;
}
button.pill.route.final {
  background: transparent; color: var(--win);
  border-color: var(--win);
}
:root.dark button.pill.route, :root.dark button.pill.route.final {
  background: transparent; color: var(--win);
  border-color: var(--win);
}
button.pill.route.next {
  background: color-mix(in srgb, var(--win) 18%, #fff);
}
:root.dark button.pill.route.next {
  background: color-mix(in srgb, var(--win) 22%, var(--card));
}
button.pill.branch { opacity: 0.6; }
button.pill.next { box-shadow: 0 0 0 2px var(--card), 0 0 0 3.5px #22c55e, 0 0 12px 3px rgb(34 197 94 / 0.55); }
button.pill.open { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--tone-solid); }
button.pill:focus-visible { outline: 2px solid var(--tone-solid); outline-offset: 2px; }
button.pill .dot { position: absolute; top: 0.25rem; right: 0.25rem; width: 0.4375rem; height: 0.4375rem; border-radius: 50%; }
button.pill .dot.live { background: #22c55e; box-shadow: 0 0 0 2px rgb(34 197 94 / 0.3); }
button.pill .dot.awaiting { background: #f59e0b; }
.fg-under { position: absolute; z-index: 3; text-align: center; font-size: 0.625rem; line-height: 1.15; pointer-events: none; }
.fg-under .st { color: #b45309; font-weight: 600; }
.fg-under .st.live { color: #15803d; }
.fg-under .stub { font-weight: 600; }
.fg-under.over { font-size: 0.5625rem; line-height: 1; white-space: nowrap; }
.fg-under .stub.in::before { display: none; }
.fg-under .stub.w { color: var(--win); }
.fg-under .stub.l { color: var(--lose); }
.fg-under .stub.l::before { content: ""; display: inline-block; width: 0.625rem; margin-right: 0.1875rem; vertical-align: 0.2em; border-top: 1.5px dashed var(--lose); }
.fg-under .stub.w::before { content: ""; display: inline-block; width: 0.625rem; margin-right: 0.1875rem; vertical-align: 0.2em; border-top: 1.5px solid var(--win); }
.fg-pop {
  position: absolute; z-index: 6; width: 17rem; background: var(--card); border-radius: 0.875rem; padding: 0 0.875rem;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08), 0 10px 30px rgb(0 20 60 / 0.18);
}
.fg-pop .x { position: absolute; top: 0.375rem; right: 0.375rem; width: 1.75rem; height: 1.75rem; border: 0; border-radius: 50%; background: var(--chip); color: var(--label); font: inherit; font-size: 0.875rem; cursor: pointer; }
.fg-pop .st { font-size: 0.75rem; font-weight: 600; color: #b45309; }
.fg-pop .st.live { color: #15803d; }
`;

export const GRID_JS = String.raw`
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  // Same championship star as the Timeline (ScheduleTimeline Star / .tl-bgstar).
  function champStar() {
    var s = svg("svg", { class: "bgstar", viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" });
    s.appendChild(svg("path", { d: "M10 1.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L10 15l-5.38 2.85 1.03-6L1.3 7.6l6-.9z", fill: "currentColor" }));
    return s;
  }
  var STATE = { live: "In progress", awaiting: "Awaiting score", final: "Final", upcoming: "", cancelled: "Cancelled" };

  // Geometry: phone (narrow) runs time down the page with the fields
  // across; desktop runs time across with the fields down the side.
  // With a team picked (show = its games), only those games are drawn: a
  // field with none of them drops out, and a run of hours with none of them
  // shrinks to a thin gap (JD 2026-11-10: hide what the team can't play,
  // keep it compact).
  function geometry(grid, width, show) {
    var vertical = width < 640;
    // Single-team phone: 32x48 boxes in hour rows a little taller than
    // the box (~48px) so the gutters have breathing room for drops and
    // arrowheads (JD: "increase the height of the hour rows"). Every
    // hour from the day's first game to its last (no skipped empty hours).
    // dayPad: clear space under the day header so the first box and its
    // glow don't run into the title or the divider (JD review of PR #51).
    var G = vertical
      ? { vertical: true, side: 40, head: 4, hour: show ? 48 : 86, dayHead: 26, fold: 24, gap: 0, skip: 14, dayPad: show ? 10 : 0 }
      : { vertical: false, side: 86, head: 46, hour: 104, dayHead: 0, fold: 26, gap: 18, skip: 18, dayPad: 0 };
    var used = {};
    grid.days.forEach(function (d) { d.games.forEach(function (g) { if (!show || show[g.i]) used[g.f] = true; }); });
    G.cols = grid.fields.map(function (f, i) { return i; }).filter(function (i) { return !show || used[i]; });
    G.col = {};
    G.cols.forEach(function (f, c) { G.col[f] = c; });
    var nf = G.cols.length || 1;
    if (vertical) {
      // Boxes stay 48x32 when a team is picked; columns spread evenly
      // across the full card so the grid fills the width, and each box
      // sits centered in its (wider) column (JD review of a6c375c).
      // If too many fields to fit, keep a 54px min lane and let the
      // grid run wider than the card.
      var minLane = show ? 54 : 46;
      // A few px after the last box so a side lane on the rightmost
      // column stays inside the card (JD: take them from column spacing
      // rather than clipping).
      var edge = show ? 8 : 0;
      var fit = Math.floor((width - G.side - edge) / nf);
      G.lane = Math.max(minLane, fit);
      G.pw = show ? 48 : G.lane - 8;
      G.ph = show ? 32 : 44;
      G.pad = Math.max(0, Math.floor((G.lane - G.pw) / 2));
      G.edge = edge;
    } else {
      G.lane = 84; G.pw = 64; G.ph = 40; G.pad = 5;
    }
    // Along the time axis: each day is its head, its folded band (an
    // opening run of all-final hours) and then every hour from the first
    // game hour to the last, empty ones included, each a full row.
    var at = G.vertical ? G.head : G.side + 8;
    G.days = grid.days.map(function (d) {
      var x = { d: d, start: at + G.dayHead + (G.dayPad || 0), fold: d.fold && !expanded[d.key] ? d.fold : 0, off: [], size: [] };
      var busy = {};
      d.games.forEach(function (g) { if (!show || show[g.i]) busy[Math.floor(g.m / 60)] = true; });
      if (d.now != null && !show) busy[Math.floor(d.now / 60)] = true;
      var first = x.fold, last = d.hours - 1;
      if (show) {
        while (first < d.hours && !busy[first]) first++;
        while (last >= first && !busy[last]) last--;
      }
      var u = x.fold ? G.fold : 0;
      for (var h = 0; h < d.hours; h++) {
        x.off[h] = u;
        var n = h < x.fold || h < first || h > last ? 0 : G.hour;
        x.size[h] = n;
        u += n;
      }
      x.len = u;
      at = x.start + x.len + G.gap;
      return x;
    });
    G.length = at;
    G.across = G.side + nf * G.lane + (G.edge || 0);
    if (vertical && G.across < width) G.across = width;
    G.pos = function (day, m) {
      if (day.fold && m < day.fold * 60) return day.start + (m / (day.fold * 60)) * G.fold;
      var h = Math.max(0, Math.min(day.d.hours - 1, Math.floor(m / 60)));
      var sz = day.size[h];
      return day.start + day.off[h] + (sz === G.hour ? ((m - h * 60) / 60) * G.hour : sz / 2);
    };
    return G;
  }
  // A game's box: x/y/w/h in the grid's own pixels, or null when folded away.
  function boxOf(G, day, g, keep) {
    var f = G.col[g.f];
    if (f == null) return null;
    if (day.fold && g.m < day.fold * 60) {
      // A game of the picked team inside a folded run: a chip on the band,
      // so its solid arrow still has somewhere to start.
      if (!keep) return null;
      var c = G.fold - 6;
      if (G.vertical) return { x: G.side + f * G.lane + G.pad, y: day.start + 3, w: G.pw, h: c, chip: true };
      return { x: day.start + 3, y: G.head + f * G.lane + 4 + (G.ph - 2 * c) / 2, w: c, h: 2 * c, chip: true };
    }
    var t = G.pos(day, g.m);
    if (G.vertical) return { x: G.side + f * G.lane + G.pad, y: t + Math.floor((G.hour - G.ph) / 2), w: G.pw, h: G.ph };
    return { x: t + 4, y: G.head + f * G.lane + 4, w: G.pw, h: G.ph };
  }

  // Connectors: one deterministic shape for every edge (JD: "the lines
    // could be drawn more algorithmically consistently"). Exit the
    // bottom-center of the source, enter the top-center of the target,
    // arrowhead pointing along the time axis (down on a phone). Same
    // column: a straight line. Different column: drop to the gutter just
    // above the target's row, one horizontal to the target column, then
    // drop in (V-H-V on a phone, H-V-H on desktop). If a vertical would
    // cross a box in its column, it jogs into a side lane just outside
    // the boxes' right edge (the gap between columns), then re-enters
    // the target from the top through the gutter above it. Shared
    // gutters, shared-column verticals, and shared side lanes get a
    // few px of deterministic offset.
  function routeLines(G, list, boxes) {
    var V = G.vertical;
    function midV(b) { return V ? b.x + b.w / 2 : b.y + b.h / 2; }
    function exitU(b) { return V ? b.y + b.h : b.x + b.w; }
    function enterU(b) { return V ? b.y - 1 : b.x - 1; }
    function uOf(b) { return V ? b.y : b.x; }
    function minV(b) { return V ? b.x : b.y; }
    function maxV(b) { return V ? b.x + b.w : b.y + b.h; }
    function P(u, v) { return V ? [v, u] : [u, v]; }
    function key(it) { return it.e[0] + ">" + it.e[1]; }
    var items = [];
    list.forEach(function (it) { if (boxes[it.e[0]] && boxes[it.e[1]]) items.push(it); });
    var outs = {}, ins = {};
    items.forEach(function (it) {
      (outs[it.e[0]] = outs[it.e[0]] || []).push(it);
      (ins[it.e[1]] = ins[it.e[1]] || []).push(it);
    });
    function offFor(group, it, box, other) {
      var g = group.slice().sort(function (x, y) {
        var bx = boxes[x.e[other]], by = boxes[y.e[other]];
        return midV(bx) - midV(by) || uOf(bx) - uOf(by) || (x.e[2] === "w" ? 0 : 1) - (y.e[2] === "w" ? 0 : 1);
      });
      var n = g.length;
      if (n < 2) return 0;
      var room = ((V ? box.w : box.h) - 12) / 2;
      var step = Math.min(6, room / Math.max(1, (n - 1) / 2));
      return (g.indexOf(it) - (n - 1) / 2) * step;
    }
    var exitV = {}, enterV = {};
    items.forEach(function (it) {
      var a = boxes[it.e[0]];
      exitV[key(it)] = midV(a) + offFor(outs[it.e[0]], it, a, 1);
    });
    items.forEach(function (it) {
      var a = boxes[it.e[0]], b = boxes[it.e[1]];
      if (Math.abs(midV(a) - midV(b)) < 1) enterV[key(it)] = exitV[key(it)];
      else enterV[key(it)] = midV(b) + offFor(ins[it.e[1]], it, b, 0);
    });
    function hitsBox(v, u0, u1, skipA, skipB) {
      var lo = Math.min(u0, u1), hi = Math.max(u0, u1);
      var ids = Object.keys(boxes);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i], b = boxes[id];
        if (id == skipA || id == skipB) continue;
        if (v <= minV(b) + 0.5 || v >= maxV(b) - 0.5) continue;
        if (lo < uOf(b) + (V ? b.h : b.w) - 0.5 && hi > uOf(b) + 0.5) return true;
      }
      return false;
    }
    function needsHy(it) {
      var a = boxes[it.e[0]], b = boxes[it.e[1]], k = key(it);
      if (Math.abs(exitV[k] - enterV[k]) >= 0.5) return true;
      return hitsBox(exitV[k], exitU(a), enterU(b), it.e[0], it.e[1]);
    }
    var groups = {};
    items.forEach(function (it) {
      if (!needsHy(it)) return;
      var k = String(Math.round(uOf(boxes[it.e[1]])));
      (groups[k] = groups[k] || []).push(it);
    });
    var hyOf = {};
    Object.keys(groups).forEach(function (rk) {
      var g = groups[rk].slice().sort(function (x, y) {
        var ax = boxes[x.e[0]], ay = boxes[y.e[0]], bx = boxes[x.e[1]], by = boxes[y.e[1]];
        return midV(ax) - midV(ay) || midV(bx) - midV(by) || uOf(ax) - uOf(ay);
      });
      var b0 = boxes[g[0].e[1]];
      // Use the inter-row gutter for the last drop and the arrowhead,
      // leaving a few px of shaft above the head.
      var bandTop = enterU(b0) - 12, bandBot = enterU(b0) - 4;
      var n = g.length, span = Math.max(0, bandBot - bandTop);
      var step = n < 2 ? 0 : Math.min(2, span / Math.max(1, n - 1));
      g.forEach(function (it, i) {
        var a = boxes[it.e[0]], b = boxes[it.e[1]];
        var hy = n < 2 ? bandTop : bandTop + i * step;
        var lo = exitU(a) + 1, hi = enterU(b) - 1;
        if (hi < lo) hy = (exitU(a) + enterU(b)) / 2;
        else hy = Math.max(lo, Math.min(hi, hy));
        hyOf[key(it)] = hy;
      });
    });
    var detour = {};
    items.forEach(function (it) {
      var a = boxes[it.e[0]], b = boxes[it.e[1]], k = key(it);
      var uEnd = hyOf[k] != null ? hyOf[k] : enterU(b);
      if (hitsBox(exitV[k], exitU(a), uEnd, it.e[0], it.e[1])) detour[k] = true;
    });
    var laneGroups = {};
    items.forEach(function (it) {
      if (!detour[key(it)]) return;
      var ck = String(Math.round(maxV(boxes[it.e[0]])));
      (laneGroups[ck] = laneGroups[ck] || []).push(it);
    });
    var laneV = {};
    Object.keys(laneGroups).forEach(function (ck) {
      var g = laneGroups[ck].slice().sort(function (x, y) {
        var ax = boxes[x.e[0]], ay = boxes[y.e[0]], bx = boxes[x.e[1]], by = boxes[y.e[1]];
        return uOf(ax) - uOf(ay) || midV(bx) - midV(by) || (x.e[2] === "w" ? 0 : 1) - (y.e[2] === "w" ? 0 : 1);
      });
      var a0 = boxes[g[0].e[0]];
      var base = maxV(a0) + 3;
      var cap = (G.across || 0) - 2;
      var ids = Object.keys(boxes);
      for (var i = 0; i < ids.length; i++) {
        var b = boxes[ids[i]];
        if (minV(b) > maxV(a0) + 0.5) cap = Math.min(cap, minV(b) - 3);
      }
      if (cap < base) base = cap;
      var n = g.length, room = Math.max(0, cap - base);
      var step = n < 2 ? 0 : Math.min(2, room / Math.max(1, n - 1));
      g.forEach(function (it, i) { laneV[key(it)] = base + i * step; });
    });
    var paths = [];
    items.forEach(function (it) {
      var a = boxes[it.e[0]], b = boxes[it.e[1]], k = key(it);
      var v1 = exitV[k], v2 = enterV[k], u1 = exitU(a), u2 = enterU(b);
      var pts;
      if (detour[k]) {
        var ju = u1 + 4, hy = hyOf[k], vl = laneV[k];
        if (ju >= hy) ju = (u1 + hy) / 2;
        pts = [P(u1, v1), P(ju, v1), P(ju, vl), P(hy, vl), P(hy, v2), P(u2, v2)];
      } else if (Math.abs(v1 - v2) < 0.5) {
        pts = [P(u1, v1), P(u2, v1)];
      } else {
        pts = [P(u1, v1), P(hyOf[k], v1), P(hyOf[k], v2), P(u2, v2)];
      }
      paths.push({ it: it, pts: pts });
    });
    return paths;
  }


  function popEl(grid, g, close) {
    var dv = grid.divs[g.d];
    var c = el("div", "fg-pop");
    tone(c, { tone: dv });
    var x = el("button", "x", "\u00d7");
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    var head = el("div", "head");
    add(head, el("span", "tag", dv.name));
    var sideText = { winners: "W", losers: "L", final: "\u2605 Final", if: "\u2605 If nec.", pool: "Pool" }[g.bs];
    if (sideText) add(head, el("span", "tag side" + (g.bs === "final" || g.bs === "if" ? " gold" : ""), sideText));
    add(head, el("span", "tag game", /^G\d+$/.test(g.n) ? "Game " + g.n.slice(1) : g.n));
    if (g.st !== "upcoming") add(head, el("span", "st" + (g.st === "live" ? " live" : ""), STATE[g.st]));
    var b = el("div", "sec");
    var ul = el("ul", "board");
    [[g.t1, g.s1, g.won === 1], [g.t2, g.s2, g.won === 2]].forEach(function (r, i) {
      var won = g.s1 != null && (i === 0 ? g.s1 > g.s2 : g.s2 > g.s1);
      var li = el("li", "row" + (won ? " won" : ""));
      add(li, el("span", "team", r[0]));
      if (r[1] != null) add(li, el("span", "score", r[1]));
      ul.appendChild(li);
    });
    b.appendChild(ul);
    var go = el("div", "go");
    if (g.l) add(go, el("span", "lose", "Loser \u2192 " + g.l));
    if (g.w) add(go, el("span", "win", "Winner \u2192 " + g.w));
    var when = el("div", "sec tight");
    add(when, el("span", "meta", g.tm + " \u00b7 " + grid.fields[g.f]));
    var n = /^G(\d+)$/.exec(g.n);
    add(c, x, head, b, go.childNodes.length ? go : null, when, siteLink(dv.url + (n && g.bs !== "pool" ? "?game=" + n[1] : ""), "View on site \u203a", "foot"));
    return c;
  }

  function gridEl(t, picked, host) {
    var grid = t.grid;
    var track = t.picker.filter(function (p) { return p.name === picked; })[0] || { played: [], went: [], reach: [], edges: [], out: {} };
    var lit = {}, played = {};
    track.reach.forEach(function (i) { lit[i] = true; });
    track.played.forEach(function (i) { played[i] = true; lit[i] = true; });
    var nextI = track.reach.length ? track.reach[0] : null;
    // A picked team: draw only its games (JD 2026-11-10: hide what it can't play).
    var show = picked && Object.keys(lit).length ? lit : null;
    // The remaining win-out route (every win from the next game to the
    // title). Used to mark those games; a leg goes bold only once the
    // game it leaves has a score, along the route actually taken.
    var onRoute = {}, routeEdge = {};
    if (nextI != null) {
      var cur = nextI, guard = 0;
      onRoute[cur] = true;
      while (guard++ < 40) {
        var nx = track.edges.filter(function (e) { return e[0] === cur && e[2] === "w"; })[0];
        if (!nx || onRoute[nx[1]]) break;
        routeEdge[nx[0] + ">" + nx[1]] = true;
        onRoute[nx[1]] = true;
        cur = nx[1];
      }
    }
    var width = host.clientWidth || window.innerWidth;
    var G = geometry(grid, width, show);
    var NF = G.cols.length;
    var W = G.vertical ? G.across : G.length + 12;
    var H = G.vertical ? G.length + 8 : G.across + 16;
    // The sticky head: the team (name, division, record once it has
    // played) and, on a phone, the field names over their columns, pinned
    // to the top of the page while the grid scrolls under it.
    var outer = el("div", "fg-outer");
    var headEl = el("div", "fg-head" + (G.vertical ? " v" : ""));
    // Team, division, record on the same row as Win / Loss / Times, so
    // the grid starts higher (JD: "Fallen men's d 2-0 can be on the same
    // row as win loss PST legend"). Long team names ellipsize.
    var top = el("div", "fg-top");
    if (picked) {
      var anyG = null;
      G.days.forEach(function (day) { day.d.games.forEach(function (g) { if (lit[g.i] && !anyG) anyG = g; }); });
      var who = el("div", "fg-who");
      add(who, el("span", "nm", picked));
      if (anyG) add(who, el("span", "dv", grid.divs[anyG.d].name));
      if (track.record && track.record !== "0-0") add(who, el("span", "rc", track.record));
      if (track.end) add(who, el("span", "rc", track.end));
      top.appendChild(who);
    }
    top.appendChild(keyEl(grid));
    headEl.appendChild(top);
    if (G.vertical) {
      var row = el("div", "fg-fields");
      row.style.paddingLeft = G.side + "px";
      G.cols.forEach(function (fi, i) {
        var p = grid.fields[fi].split(" ");
        var c = el("div", "fg-fname" + (i % 2 === 0 ? " tint" : ""));
        c.style.width = G.lane + "px";
        add(c, el("span", null, p[0]), el("br"), el("span", null, p.slice(1).join(" ")));
        row.appendChild(c);
      });
      headEl.appendChild(row);
    }
    if (headEl.childNodes.length) outer.appendChild(headEl);
    var wrap = el("div", "fg-scroll" + (G.vertical ? " v" : ""));
    if (G.vertical && W > width) wrap.style.overflowX = "auto";
    outer.appendChild(wrap);
    var box = el("div", "fg");
    box.style.width = W + "px"; box.style.height = H + "px";
    wrap.appendChild(box);
    // Alternating field-column (or, on desktop, field-row) tints, full
    // height of the grid, behind lines and boxes. Even index only.
    G.cols.forEach(function (fi, i) {
      if (i % 2 !== 0) return;
      var band = el("div", "fg-coltint");
      if (G.vertical) band.style.cssText = "left:" + (G.side + i * G.lane) + "px;top:0;width:" + G.lane + "px;height:" + H + "px";
      else band.style.cssText = "left:" + G.side + "px;top:" + (G.head + i * G.lane) + "px;width:" + (W - G.side) + "px;height:" + G.lane + "px";
      box.appendChild(band);
    });
    function lab(cls, text, x, y, w, align) {
      var e = el("div", "fg-lab " + cls, text);
      e.style.left = x + "px"; e.style.top = y + "px";
      if (w) { e.style.width = w + "px"; e.style.textAlign = align || "center"; }
      box.appendChild(e);
      return e;
    }
    function line(x, y, w, h) { var e = el("div", "fg-line"); e.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px"; box.appendChild(e); }
    // Fields
    if (!G.vertical) {
      var side = el("div", "fg-side");
      side.style.cssText = "position:sticky;left:0;top:0;width:" + G.side + "px;height:" + H + "px;margin-bottom:-" + H + "px;border-right:1px solid var(--hair)";
      box.appendChild(side);
      G.cols.forEach(function (fi, i) {
        var e = el("div", "fg-lab field", grid.fields[fi]);
        e.style.left = "12px"; e.style.top = G.head + i * G.lane + G.lane / 2 - 14 + "px";
        side.appendChild(e);
        line(G.side, G.head + i * G.lane, G.length - G.side + 12, 1);
      });
    }
    // Days, hours, folds, now
    G.days.forEach(function (day) {
      var d = day.d;
      if (G.vertical) {
        var pad = G.dayPad || 0;
        lab("day", d.title, 4, day.start - pad - G.dayHead + 5);
        line(0, day.start - pad - 1, W, 1);
      } else if (day.fold < d.hours) {
        lab("day", d.title, day.start + 2, 4);
      }
      if (day.fold) {
        var f = el("button", "fg-fold" + (G.vertical ? "" : " v"));
        add(f, el("span", null, G.vertical || day.fold === d.hours ? d.foldLabel : d.foldLabel.split(" \u00b7 ")[0]));
        f.title = d.foldLabel + " \u2014 show";
        if (G.vertical) f.style.cssText = "left:" + G.side + "px;top:" + (day.start + 2) + "px;width:" + (G.lane * NF - 4) + "px;height:" + (G.fold - 4) + "px";
        else f.style.cssText = "left:" + (day.start + 2) + "px;top:" + (G.head + 2) + "px;width:" + (G.fold - 4) + "px;height:" + (G.lane * NF - 4) + "px";
        f.addEventListener("click", function () { expanded[d.key] = true; draw(); });
        box.appendChild(f);
      }
      for (var h = day.fold; h < d.hours; h++) {
        if (day.size[h] !== G.hour) continue;
        var hh = (d.start + h) % 24, label = (hh % 12 || 12) + " " + (hh < 12 ? "AM" : "PM");
        var u = G.pos(day, h * 60);
        if (G.vertical) { lab("hour", label, 2, u + Math.floor((G.hour - 11) / 2), G.side - 6, "right"); line(G.side, u, W - G.side, 1); }
        else { lab("hour", label, u + 4, G.head - 18); line(u, G.head, 1, H - G.head); }
      }
      if (d.now != null && d.now >= 0 && d.now <= d.hours * 60) {
        var nu = G.pos(day, d.now);
        var n = el("div", "fg-now"), tag = el("div", "fg-nowtag", "Now " + grid.now.replace(/^\w+ /, ""));
        if (G.vertical) { n.style.cssText = "left:" + G.side + "px;top:" + nu + "px;width:" + (W - G.side) + "px;height:2px"; tag.style.cssText = "left:2px;top:" + (nu - 8) + "px"; }
        else { n.style.cssText = "left:" + nu + "px;top:" + (G.head - 4) + "px;width:2px;height:" + (H - G.head + 4) + "px"; tag.style.cssText = "left:" + (nu - 30) + "px;top:" + (G.head - 20) + "px"; }
        box.appendChild(n); box.appendChild(tag);
      }
    });
    // Games
    var boxes = {}, unders = {}, overs = {}, all = [];
    G.days.forEach(function (day) {
      day.d.games.forEach(function (g) {
        if (show && !show[g.i]) return;
        var b = boxOf(G, day, g, played[g.i]);
        if (!b) return;
        b.day = day.d.key;
        b.m = g.m;
        boxes[g.i] = b;
        var dv = grid.divs[g.d];
        var us = 0;
        if (picked) {
          var pn = String(picked).trim().toLowerCase();
          if (String(g.t1 || "").trim().toLowerCase() === pn) us = 1;
          else if (String(g.t2 || "").trim().toLowerCase() === pn) us = 2;
        }
        var result = "";
        if (us && g.st === "final" && g.s1 != null && g.s2 != null) result = (us === 1 ? g.s1 > g.s2 : g.s2 > g.s1) ? " won-box" : " lost-box";
        var cls = "pill " + (g.bs || "pool") + (g.st === "final" ? " done" : "") + result + (lit[g.i] ? " lit" : picked ? " dim" : "") + (g.i === nextI && !played[g.i] ? " next" : "") + (show && onRoute[g.i] ? " route" : show && !played[g.i] ? " branch" : "");
        var p = el("button", cls);
        tone(p, { tone: dv });
        p.style.cssText += ";left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px";
        var short = dv.name.replace(/^Men's /, "M ").replace(/^Women's /, "W ").replace(/^Coed /, "C ");
        if (show) p.classList.add("compact");
        if ((g.bs === "final" || g.bs === "if") && !b.chip) add(p, champStar());
        if (b.chip) { p.classList.add("chip"); if (!G.vertical) p.classList.add("cv"); add(p, el("span", "gno", g.n)); }
        else if (g.st === "final" && g.sc) {
          // Compact: number over the score, e.g. "G5" over "12-5".
          add(p, el("span", "gno", g.n), el("span", "scr", g.sc));
        } else {
          // Number stays centered. Place is a tiny italic label in the
          // top-left corner, like the original 9th, just smaller.
          add(p, el("span", "gno", g.n));
          if (show && lit[g.i] && !played[g.i] && track.out[g.i]) add(p, el("span", "fin" + (track.out[g.i] === "\uD83C\uDFC6" ? " cup" : ""), track.out[g.i]));
          if (!show) add(p, el("span", "div", short));
        }
        if (g.st === "live" || g.st === "awaiting") add(p, el("span", "dot " + g.st));
        p.setAttribute("aria-label", g.n + ", " + dv.name + ", " + g.t1 + " vs " + g.t2 + ", " + g.tm + ", " + grid.fields[g.f] + (STATE[g.st] ? ", " + STATE[g.st] : ""));
        p.addEventListener("click", function (e) { e.stopPropagation(); open(g, p, b); });
        box.appendChild(p);
        all.push(b);
        var bits = [];
        if (b.chip) return;
        if ((g.st === "live" || g.st === "awaiting") && (lit[g.i] || !picked)) bits.push(["st" + (g.st === "live" ? " live" : ""), STATE[g.st]]);
        unders[g.i] = bits;
      });
    });
    // Arrows: the team's games so far (solid), then where it can go.
    var s = svg("svg", { class: "fg-arrows", width: W, height: H, viewBox: "0 0 " + W + " " + H });
    var list = track.went.map(function (e) { return { e: e, actual: true }; });
    var seen = {};
    list.forEach(function (it) { seen[it.e[0] + ">" + it.e[1]] = true; });
    track.edges.forEach(function (e) { var k = e[0] + ">" + e[1]; if (!seen[k]) { seen[k] = true; list.push({ e: e, actual: false }); } });
    function strokeOf(it) { return it.actual ? 4 : show ? 1.25 : 1.5; }
    function arrowOf(it) { var w = strokeOf(it); return { w: w, hl: Math.max(6.5, w * 2.6), hw: Math.max(3.5, w * 1.6) }; }
    var paths = routeLines(G, list, boxes);
    // Paint order: undecided legs first (thin, light), traveled legs on top (bold).
    function layer(p) { return p.it.actual ? 1 : 0; }
    paths.slice().sort(function (x, y) { return layer(x) - layer(y); }).forEach(function (p) {
      var it = p.it, k = it.e[2];
      var color = k === "w" ? "var(--win)" : k === "l" ? "var(--lose)" : "#c99a1e";
      // A traveled leg is bold (green if they won, red dashed if they
      // lost). Every undecided leg — including the rest of the win-out
      // route — stays thin and light, like the other connectors. The line
      // stops at the base of its head, so the two never overlap.
      var hd = arrowOf(it);
      var pts = p.pts.map(function (x) { return x.slice(); });
      var q = pts[pts.length - 1], r = pts[pts.length - 2];
      var len = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1, ux = (q[0] - r[0]) / len, uy = (q[1] - r[1]) / len;
      var hl = Math.min(hd.hl, Math.max(4, len - 1.5)), hw = hd.hw * (hl / hd.hl);
      pts[pts.length - 1] = [q[0] - ux * (hl - 0.5), q[1] - uy * (hl - 0.5)];
      var op = it.actual ? 1 : show ? 0.55 : 0.9;
      s.appendChild(svg("path", {
        d: "M" + pts.map(function (x) { return x[0].toFixed(1) + " " + x[1].toFixed(1); }).join(" L"),
        fill: "none", stroke: color, "stroke-width": hd.w,
        "stroke-dasharray": k === "l" ? "5 3" : k === "if" ? "2 3" : "",
        "stroke-linejoin": "miter", "stroke-linecap": "butt", opacity: op,
      }));
      // The head: one clean triangle, its base where the line ends, its tip on the box.
      s.appendChild(svg("path", {
        d: "M" + q[0].toFixed(1) + " " + q[1].toFixed(1) + " L" + (q[0] - ux * hl - uy * hw).toFixed(1) + " " + (q[1] - uy * hl + ux * hw).toFixed(1) + " L" + (q[0] - ux * hl + uy * hw).toFixed(1) + " " + (q[1] - uy * hl - ux * hw).toFixed(1) + " Z",
        fill: color, opacity: op, class: "head",
      }));
    });
    box.appendChild(s);
    Object.keys(overs).forEach(function (i) {
      var b = boxes[i];
      if (!b) return;
      var u = el("div", "fg-under over");
      overs[i].forEach(function (x, j) { if (j) u.appendChild(document.createTextNode(" ")); add(u, el("span", x[0], x[1])); });
      u.style.cssText = "left:" + (b.x - 14) + "px;top:" + (b.y - 12) + "px;width:" + (b.w + 28) + "px";
      box.appendChild(u);
    });
    Object.keys(unders).forEach(function (i) {
      var bits = unders[i], b = boxes[i];
      if (!bits.length || !b) return;
      var u = el("div", "fg-under");
      bits.forEach(function (x, j) { if (j) u.appendChild(el("br")); add(u, el("span", x[0], x[1])); });
      u.style.cssText = "left:" + (b.x - 10) + "px;top:" + (b.y + b.h + 2) + "px;width:" + (b.w + 20) + "px";
      box.appendChild(u);
    });
    // Tap a game: its card beside it.
    var pop = null, openPill = null;
    function close() { if (pop) { pop.remove(); pop = null; } if (openPill) openPill.classList.remove("open"); openPill = null; box.style.height = H + "px"; size(); }
    function open(g, p, b) {
      var same = openPill === p;
      close();
      if (same) return;
      openPill = p; p.classList.add("open");
      pop = popEl(grid, g, close);
      var pw = Math.min(272, W - 16);
      var x = Math.max(8, Math.min(b.x + b.w / 2 - pw / 2, W - pw - 8));
      if (!G.vertical) { var sl = wrap.scrollLeft, vw = wrap.clientWidth; x = Math.max(sl + G.side + 4, Math.min(b.x + b.w + 8, sl + vw - pw - 8)); }
      pop.style.left = x + "px"; pop.style.top = b.y + b.h + 8 + "px"; pop.style.width = pw + "px";
      box.appendChild(pop);
      var need = pop.offsetTop + pop.offsetHeight + 8;
      if (need > H) box.style.height = need + "px";
      size();
    }
    box.addEventListener("click", close);
    // Desktop: start the scroll at the team's next game (or now).
    setTimeout(function () {
      if (G.vertical) return;
      var target = nextI != null && boxes[nextI] ? boxes[nextI].x : null;
      if (target != null) wrap.scrollLeft = Math.max(0, target - G.side - G.hour);
    }, 0);
    function draw() { var fresh = gridEl(t, picked, host); outer.replaceWith(fresh); size(); }
    return outer;
  }
  var expanded = {};
  function keyEl(grid) {
    var k = el("div", "fg-key");
    function sw(color, dash, w) {
      var s = svg("svg", { width: 22, height: 8 });
      s.appendChild(svg("line", { x1: 1, y1: 4, x2: 21, y2: 4, stroke: color, "stroke-width": w || 1.5, "stroke-dasharray": dash || "" }));
      return s;
    }
    var a = el("span"); a.appendChild(sw("var(--win)", "", 3)); a.appendChild(document.createTextNode("Win"));
    var b = el("span"); b.appendChild(sw("var(--lose)", "5 3")); b.appendChild(document.createTextNode("Loss"));
    add(k, a, b);
    if (grid.zone) add(k, el("span", null, "Times " + grid.zone));
    return k;
  }
`;

// The site's page around GRID_JS (components/PathView.js): links open in
// place, "View on site" reads "Open in bracket" (this is the site), and
// there is no host to tell about size changes.
export const SITE_SHIM = String.raw`
  var size = function () {};
  function siteLink(url, text, cls) {
    var box = el(cls === "foot" ? "footer" : "div", cls);
    var link = el("a", cls === "foot" ? null : "site", text === "View on site \u203a" ? "Open in bracket \u203a" : text);
    link.href = url;
    add(box, link);
    return box;
  }
`;

/** gridEl / keyEl for the site, from the same source the MCP view inlines. */
export function siteGridRunner(cardJs) {
  return new Function(`${cardJs}\n${SITE_SHIM}\n${GRID_JS}\nreturn { gridEl: gridEl, keyEl: keyEl };`)();
}
