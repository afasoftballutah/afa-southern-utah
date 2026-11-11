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
.fg-key { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; font-size: 0.6875rem; color: var(--label); }
.fg-key span { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
.fg-key svg { flex: none; }
.fg-head { position: sticky; top: 0; z-index: 8; background: var(--card); border-radius: 0.875rem 0.875rem 0 0; box-shadow: 0 1px 0 var(--hair); padding: 0.5rem 0 0.375rem; }
.fg-head:not(.v) { padding: 0.5rem 0.75rem; }
.fg-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem; padding: 0 0.75rem 0.25rem; font-size: 0.8125rem; color: var(--label); }
.fg-head:not(.v) .fg-who { padding: 0; }
.fg-who .nm { font-size: 0.9375rem; font-weight: 700; color: var(--ink); }
.fg-fields { display: flex; }
.fg-fname { text-align: center; font-size: 0.75rem; font-weight: 600; line-height: 1.15; color: var(--ink); }
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
.fg-lab { position: absolute; font-size: 0.6875rem; color: var(--label); white-space: nowrap; }
.fg-lab.field { font-size: 0.75rem; font-weight: 600; color: var(--ink); }
.fg-lab.day { font-size: 0.8125rem; font-weight: 700; color: var(--ink); z-index: 4; background: var(--card); padding: 0 0.25rem; border-radius: 0.25rem; }
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
  cursor: pointer; padding: 0; transition: opacity 200ms ease, box-shadow 120ms ease;
}
button.pill.losers, button.pill.if { background: #fff; font-weight: 450; }
:root.dark button.pill.losers, :root.dark button.pill.if { background: var(--card); }
button.pill.if { border-style: dashed; }
button.pill.final { border-color: #c99a1e; }
button.pill.done { background: var(--tone-solid); color: #fff; }
button.pill.done.losers { box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.75); }
button.pill .gno { font-size: 0.625rem; font-weight: 600; opacity: 0.9; }
button.pill.chip { z-index: 3; border-radius: 0.375rem; }
button.pill.chip .gno { font-size: 0.5625rem; }
button.pill.chip.cv .gno { writing-mode: vertical-rl; transform: rotate(180deg); }
button.pill .scr { font-size: 0.8125rem; font-weight: 700; margin-top: 0.125rem; white-space: nowrap; }
button.pill .div { position: absolute; top: 0.1875rem; left: 0.3rem; font-size: 0.5rem; font-weight: 600; opacity: 0.75; }
button.pill.dim { opacity: 0.22; }
button.pill .fin { position: absolute; top: 0.1875rem; left: 0.3125rem; font-size: 0.625rem; font-weight: 400; font-style: italic; color: var(--lose); line-height: 1; }
button.pill .fin.cup { font-style: normal; color: #c99a1e; }
button.pill.lit { z-index: 3; }
button.pill.route { border: 2.5px solid var(--win); font-weight: 800; box-shadow: 0 1px 6px rgb(21 128 61 / 0.25); }
button.pill.route.final { border-color: #c99a1e; }
button.pill.branch { opacity: 0.6; }
button.pill.next { box-shadow: 0 0 0 2px var(--card), 0 0 0 3.5px #a3e635, 0 0 12px 3px rgb(190 242 100 / 0.75); }
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
  var STATE = { live: "In progress", awaiting: "Awaiting score", final: "Final", upcoming: "", cancelled: "Cancelled" };

  // Geometry: phone (narrow) runs time down the page with the fields
  // across; desktop runs time across with the fields down the side.
  // With a team picked (show = its games), only those games are drawn: a
  // field with none of them drops out, and a run of hours with none of them
  // shrinks to a thin gap (JD 2026-11-10: hide what the team can't play,
  // keep it compact).
  function geometry(grid, width, show) {
    var vertical = width < 640;
    var G = vertical
      ? { vertical: true, side: 40, head: 4, hour: 86, dayHead: 26, fold: 24, gap: 0, skip: 14 }
      : { vertical: false, side: 86, head: 46, hour: 104, dayHead: 0, fold: 26, gap: 18, skip: 18 };
    var used = {};
    grid.days.forEach(function (d) { d.games.forEach(function (g) { if (!show || show[g.i]) used[g.f] = true; }); });
    G.cols = grid.fields.map(function (f, i) { return i; }).filter(function (i) { return !show || used[i]; });
    G.col = {};
    G.cols.forEach(function (f, c) { G.col[f] = c; });
    var nf = G.cols.length || 1;
    if (vertical) {
      G.lane = Math.min(show ? 96 : 999, Math.max(46, Math.floor((width - G.side - 6) / nf)));
      G.pw = G.lane - 8; G.ph = 44; G.pad = 4;
    } else {
      G.lane = 84; G.pw = 64; G.ph = 40; G.pad = 5;
    }
    // Along the time axis: each day is its head, its folded band (an
    // opening run of all-final hours) and then its hours: a full step for
    // an hour with a game to draw, a thin gap for a run of empty ones.
    var at = G.vertical ? G.head : G.side + 8;
    G.days = grid.days.map(function (d) {
      var x = { d: d, start: at + G.dayHead, fold: d.fold && !expanded[d.key] ? d.fold : 0, off: [], size: [] };
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
        var n = h < x.fold || h < first || h > last ? 0 : !show || busy[h] ? G.hour : busy[h - 1] || h === first ? G.skip : 0;
        x.size[h] = n;
        u += n;
      }
      x.len = u;
      at = x.start + x.len + G.gap;
      return x;
    });
    G.length = at;
    G.across = G.side + nf * G.lane + (vertical ? 4 : 0);
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
    if (G.vertical) return { x: G.side + f * G.lane + G.pad, y: t + 3, w: G.pw, h: G.ph };
    return { x: t + 4, y: G.head + f * G.lane + 4, w: G.pw, h: G.ph };
  }

  // Arrows: try shapes in order and keep the first that crosses no drawn
  // arrow and runs through no lit game but its own two ends.
  function sample(pts) {
    var out = [];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (var j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function inBox(p, b, m) { return p[0] > b.x - m && p[0] < b.x + b.w + m && p[1] > b.y - m && p[1] < b.y + b.h + m; }
  // Candidate shapes from a to b ([x, y] on the boxes' facing edges); "u"
  // is the time axis (x on desktop, y on phone), "v" the field axis.
  // Orthogonal shapes only (JD 2026-11-10 on his iPhone: "why is this
  // line not straight?"): straight when both ends share a line, else a
  // dog-leg bending in the gap just after the first game or just before
  // the second, else out along a channel between fields and back in.
  // "minEnd" keeps the last straight stretch long enough for the head.
  function shapes(G, a, b, gutters, minEnd) {
    var V = G.vertical;
    function P(u, v) { return V ? [v, u] : [u, v]; }
    var au = V ? a[1] : a[0], av = V ? a[0] : a[1], bu = V ? b[1] : b[0], bv = V ? b[0] : b[1];
    var out = [];
    function push(pts) { out.push({ pts: pts }); }
    if (Math.abs(av - bv) < 0.5) push([P(au, av), P(bu, av)]);
    var gap = G.hour - (V ? G.ph : G.pw);
    var offs = [0.5, 0.3, 0.7, 0.15, 0.85].map(function (f) { return Math.round(gap * f); });
    if (Math.abs(av - bv) >= 0.5) {
      var bends = [];
      offs.forEach(function (o) { bends.push(au + o); bends.push(bu - o); });
      bends.forEach(function (g) {
        if (g - au < 4 || bu - g < minEnd) return;
        push([P(au, av), P(g, av), P(g, bv), P(bu, bv)]);
      });
    }
    gutters.slice().sort(function (x, y) { return Math.abs(x - av) + Math.abs(x - bv) - Math.abs(y - av) - Math.abs(y - bv); }).forEach(function (gv) {
      if (Math.abs(gv - av) < 4 || Math.abs(gv - bv) < 4) return;
      offs.forEach(function (o1) {
        offs.forEach(function (o2) {
          var g1 = au + o1, g2 = bu - o2;
          if (g2 < g1 || o2 < minEnd) return;
          push([P(au, av), P(g1, av), P(g1, gv), P(g2, gv), P(g2, bv), P(bu, bv)]);
        });
      });
    });
    return out;
  }
  // How many sample points of a path run through a lit game (other than
  // its two ends) or onto an arrow already drawn: 0 is a clear way.
  function conflicts(path, a, b, lit, from, to, drawn, stop) {
    var s = path.s || (path.s = sample(path.pts)), n = 0;
    for (var i = 2; i < s.length - 2; i++) {
      var p = s[i];
      for (var j = 0; j < lit.length; j++) if (lit[j] !== from && lit[j] !== to && inBox(p, lit[j], 3)) { n += 4; break; }
      if (inBox(p, from, -1) || inBox(p, to, -1)) n += 4;
      for (var k = 0; k < drawn.length; k++) {
        var q = drawn[k], hit = false;
        var shareA = q.from === from, shareB = q.to === to;
        for (var m = 0; m < q.s.length && !hit; m++) {
          var r = q.s[m];
          if (Math.abs(r[0] - p[0]) > 3 || Math.abs(r[1] - p[1]) > 3) continue;
          // Arrows from the same game may leave together, into the same game arrive together.
          if (shareA && Math.hypot(p[0] - a[0], p[1] - a[1]) < 14) continue;
          if (shareB && Math.hypot(p[0] - b[0], p[1] - b[1]) < 14) continue;
          hit = true;
        }
        if (hit) n++;
      }
      if (n > stop) return n;
    }
    return n;
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
    // The win-out route: every win from the next game to the title, drawn
    // strongest (JD: "highlight the undefeated path better").
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
    if (picked) {
      var anyG = null;
      G.days.forEach(function (day) { day.d.games.forEach(function (g) { if (lit[g.i] && !anyG) anyG = g; }); });
      var who = el("div", "fg-who");
      add(who, el("span", "nm", picked));
      if (anyG) add(who, el("span", "dv", grid.divs[anyG.d].name));
      if (track.record && track.record !== "0-0") add(who, el("span", "rc", track.record));
      if (track.end) add(who, el("span", "rc", track.end));
      headEl.appendChild(who);
    }
    if (G.vertical) {
      var row = el("div", "fg-fields");
      row.style.paddingLeft = G.side + "px";
      G.cols.forEach(function (fi) {
        var p = grid.fields[fi].split(" ");
        var c = el("div", "fg-fname");
        c.style.width = G.lane + "px";
        add(c, el("span", null, p[0]), el("br"), el("span", null, p.slice(1).join(" ")));
        row.appendChild(c);
      });
      headEl.appendChild(row);
    }
    if (headEl.childNodes.length) outer.appendChild(headEl);
    var wrap = el("div", "fg-scroll" + (G.vertical ? " v" : ""));
    outer.appendChild(wrap);
    var box = el("div", "fg");
    box.style.width = W + "px"; box.style.height = H + "px";
    wrap.appendChild(box);
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
        lab("day", d.title, 4, day.start - G.dayHead + 5);
        line(0, day.start - 1, W, 1);
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
        if (G.vertical) { lab("hour", label, 2, u + 2, G.side - 6, "right"); line(G.side, u, W - G.side, 1); }
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
        var cls = "pill " + (g.bs || "pool") + (g.st === "final" ? " done" : "") + (lit[g.i] ? " lit" : picked ? " dim" : "") + (g.i === nextI && !played[g.i] ? " next" : "") + (show && onRoute[g.i] ? " route" : show && !played[g.i] ? " branch" : "");
        var p = el("button", cls);
        tone(p, { tone: dv });
        p.style.cssText += ";left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px";
        var short = dv.name.replace(/^Men's /, "M ").replace(/^Women's /, "W ").replace(/^Coed /, "C ");
        if (b.chip) { p.classList.add("chip"); if (!G.vertical) p.classList.add("cv"); add(p, el("span", "gno", g.n)); }
        else {
          if (g.st === "final" && g.sc) add(p, el("span", "gno", g.n), el("span", "scr", g.sc));
          else add(p, el("span", null, g.n));
          if (!show) add(p, el("span", "div", short));
          // Its finish if a loss there ends the run, in the box's corner
          // (clear of the lines leaving it): just "9th", plain.
          else if (lit[g.i] && !played[g.i] && track.out[g.i]) add(p, el("span", "fin" + (track.out[g.i] === "\uD83C\uDFC6" ? " cup" : ""), track.out[g.i]));
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
    var litBoxes = Object.keys(lit).map(function (i) { return boxes[i]; }).filter(Boolean);
    var gutters = [];
    // Channels between two fields: just before the next field's games,
    // clear of the labels under the games of the field before.
    for (var gi = 1; gi < NF; gi++) gutters.push((G.vertical ? G.side + G.pad : G.head + 4) + gi * G.lane - 4);
    if (!G.vertical) gutters.push(G.head + NF * G.lane + 8);
    gutters.push(G.vertical ? G.side + NF * G.lane + 2 : G.head - 6);
    if (G.vertical) gutters.push(G.side + 1);
    function vOf(b) { return G.vertical ? b.x + b.w / 2 : b.y + b.h / 2; }
    function uOf(b) { return G.vertical ? b.y : b.x; }
    var list = track.went.map(function (e) { return { e: e, actual: true }; });
    var seen = {};
    list.forEach(function (it) { seen[it.e[0] + ">" + it.e[1]] = true; });
    // Shortest first (the hour-to-hour steps read best drawn), wins before
    // losses; a long jump that finds no clear way is the one left as a label.
    function span(e) { var a = boxes[e[0]], b = boxes[e[1]]; return a && b ? uOf(b) - uOf(a) : 0; }
    function isRoute(e) { return routeEdge[e[0] + ">" + e[1]] ? 0 : 1; }
    var possible = track.edges.slice().sort(function (x, y) {
      var r = { w: 0, l: 1, if: 2 };
      return isRoute(x) - isRoute(y) || span(x) - span(y) || r[x[2]] - r[y[2]];
    });
    // One line per pair of games (no stacked heads).
    possible.forEach(function (e) { var k = e[0] + ">" + e[1]; if (!seen[k]) { seen[k] = true; list.push({ e: e, actual: false }); } });
    // Line width and a head sized to it.
    function strokeOf(it) { return !it.actual && show && isRoute(it.e) === 0 ? 4 : it.actual ? 2.5 : show ? 1.25 : 1.5; }
    function arrowOf(it) { var w = strokeOf(it); return { w: w, hl: Math.max(6.5, w * 2.6), hw: Math.max(3.5, w * 1.6) }; }
    // Ports: a game's arrows leave (and arrive) side by side, ordered by
    // where the other end is, so two arrows from one game never cross.
    var outs = {}, ins = {};
    list.forEach(function (it) {
      if (!boxes[it.e[0]] || !boxes[it.e[1]]) return;
      (outs[it.e[0]] = outs[it.e[0]] || []).push(it);
      (ins[it.e[1]] = ins[it.e[1]] || []).push(it);
    });
    // Two games in one field: the edge between them runs straight.
    function sameLine(it) { return Math.abs(vOf(boxes[it.e[0]]) - vOf(boxes[it.e[1]])) < 1; }
    function port(group, it, other) {
      var g = group.slice().sort(function (x, y) {
        var bx = boxes[x.e[other]], by = boxes[y.e[other]];
        return vOf(bx) - vOf(by) || (other ? uOf(by) - uOf(bx) : uOf(bx) - uOf(by));
      });
      var n = g.length;
      if (n < 2) return 0;
      // The nearest same-field edge takes the centre; the rest spread
      // evenly to either side of it, in the order of where they go.
      var straight = g.filter(sameLine).sort(function (x, y) { return Math.abs(span(x.e)) - Math.abs(span(y.e)); })[0];
      var k = straight ? g.indexOf(straight) : (n - 1) / 2;
      var room = ((G.vertical ? G.pw : G.ph) - 12) / 2;
      var step = Math.min(9, room / Math.max(1, k, n - 1 - k));
      return (g.indexOf(it) - k) * step;
    }
    // Route every arrow in one order; try a few orders, keep the one that
    // leaves the fewest arrows as labels.
    function route(order) {
      var drawn = [], paths = [], stubs = [], cost = 0;
      order.forEach(function (it) {
        var a = boxes[it.e[0]], b = boxes[it.e[1]];
        if (!a || !b) return;
        var outOff = port(outs[it.e[0]], it, 1), inOff = port(ins[it.e[1]], it, 0);
        var p1 = G.vertical ? [a.x + a.w / 2 + outOff, a.y + a.h] : [a.x + a.w, a.y + a.h / 2 + outOff];
        var p2 = G.vertical ? [b.x + b.w / 2 + inOff, b.y - 1] : [b.x - 1, b.y + b.h / 2 + inOff];
        // Same field: arrive on the line it left on, so it is straight.
        if (sameLine(it)) { if (G.vertical) p2[0] = p1[0]; else p2[1] = p1[1]; }
        // Every edge is a line (JD 2026-11-10: "if we have lines, we don't
        // need the annotations"): the shortest clear shape, else the one
        // that touches the least.
        var cands = shapes(G, p1, p2, gutters, arrowOf(it).hl + 4).map(function (c) {
          var L = 0;
          for (var j = 1; j < c.pts.length; j++) L += Math.hypot(c.pts[j][0] - c.pts[j - 1][0], c.pts[j][1] - c.pts[j - 1][1]);
          c.L = L;
          return c;
        }).sort(function (x, y) { return x.L - y.L; });
        var direct = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        var ok = null, bestN = Infinity;
        for (var c = 0; c < cands.length; c++) {
          // The win-out route stays short and direct (it may pass over a
          // faint branch); a branch may detour further to stay clear.
          if (cands[c].L > (isRoute(it.e) === 0 && !it.actual ? direct * 1.35 + 40 : direct * 3 + 140) && ok) break;
          var n = conflicts(cands[c], p1, p2, litBoxes, a, b, drawn, bestN);
          if (n < bestN) { bestN = n; ok = cands[c]; }
          if (n === 0) break;
        }
        if (!ok) return stubs.push(it);
        cost += bestN;
        drawn.push({ s: ok.s, from: a, to: b });
        paths.push({ it: it, pts: ok.pts });
      });
      return { paths: paths, stubs: stubs, cost: cost };
    }
    var head = list.filter(function (it) { return it.actual; });
    var rest = list.filter(function (it) { return !it.actual; });
    var main = rest.filter(function (it) { return isRoute(it.e) === 0; });
    var side2 = rest.filter(function (it) { return isRoute(it.e) === 1; });
    var winsFirst = side2.slice().sort(function (x, y) { return (x.e[2] === "w" ? 0 : 1) - (y.e[2] === "w" ? 0 : 1); });
    var orders = [main.concat(side2), main.concat(side2.slice().reverse()), main.concat(winsFirst), side2.concat(main), winsFirst.concat(main)];
    var best = null;
    orders.forEach(function (o) {
      var r = route(head.concat(o));
      if (!best || r.stubs.length < best.stubs.length || (r.stubs.length === best.stubs.length && r.cost < best.cost)) best = r;
    });
    // Paint order: faint branches, then the games so far, the win-out route on top.
    function layer(p) { return p.it.actual ? 1 : show && isRoute(p.it.e) === 0 ? 2 : 0; }
    best.paths.slice().sort(function (x, y) { return layer(x) - layer(y); }).forEach(function (p) {
      var it = p.it, k = it.e[2];
      var color = k === "w" ? "var(--win)" : k === "l" ? "var(--lose)" : "#c99a1e";
      // The win-out route thick and solid; the team's games so far solid;
      // every other branch thin and light. The line stops at the base of
      // its head, so the two never overlap.
      var main = !it.actual && show && isRoute(it.e) === 0;
      var hd = arrowOf(it);
      var pts = p.pts.map(function (x) { return x.slice(); });
      var q = pts[pts.length - 1], r = pts[pts.length - 2];
      var len = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1, ux = (q[0] - r[0]) / len, uy = (q[1] - r[1]) / len;
      pts[pts.length - 1] = [q[0] - ux * (hd.hl - 0.5), q[1] - uy * (hd.hl - 0.5)];
      var op = it.actual || main ? 1 : show ? 0.55 : 0.9;
      s.appendChild(svg("path", {
        d: "M" + pts.map(function (x) { return x[0].toFixed(1) + " " + x[1].toFixed(1); }).join(" L"),
        fill: "none", stroke: color, "stroke-width": hd.w,
        "stroke-dasharray": it.actual || main ? "" : k === "l" ? "5 3" : k === "if" ? "2 3" : "",
        "stroke-linejoin": "miter", "stroke-linecap": "butt", opacity: op,
      }));
      // The head: one clean triangle, its base where the line ends, its tip on the box.
      s.appendChild(svg("path", {
        d: "M" + q[0].toFixed(1) + " " + q[1].toFixed(1) + " L" + (q[0] - ux * hd.hl - uy * hd.hw).toFixed(1) + " " + (q[1] - uy * hd.hl + ux * hd.hw).toFixed(1) + " L" + (q[0] - ux * hd.hl + uy * hd.hw).toFixed(1) + " " + (q[1] - uy * hd.hl - ux * hd.hw).toFixed(1) + " Z",
        fill: color, opacity: op, class: "head",
      }));
    });
    // A connector with no short clear way: named at both ends, in its
    // colour (red for a loss, with the dashed mark), "Lose → G17" under the
    // game it leaves and "from L G11" under the game it reaches.
    best.stubs.forEach(function (it) {
      var k = it.e[2], cls = "stub " + (k === "w" ? "w" : "l");
      var word = G.vertical ? (k === "w" ? "W" : k === "l" ? "L" : "If") + "\u2192" : (k === "w" ? "Win" : k === "l" ? "Lose" : "If") + " \u2192 ";
      (unders[it.e[0]] = unders[it.e[0]] || []).push([cls, word + labelOf(it.e[1])]);
      (overs[it.e[1]] = overs[it.e[1]] || []).push([cls + " in", (G.vertical ? "" : "from ") + (k === "w" ? "W " : k === "l" ? "L " : "If ") + labelOf(it.e[0])]);
    });
    box.appendChild(s);
    function labelOf(i) { var r = null; G.days.forEach(function (d) { d.d.games.forEach(function (g) { if (g.i === i) r = g.n; }); }); return r; }
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
    add(k, a, b, el("span", null, "Times " + (grid.zone || "MT")));
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
