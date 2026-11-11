// MCP Apps view for get_team_path: ui://afa/team (JD 2026-11-10: "i dont
// want to have to ask so specifically" — piece 2). "Next game for Fallen"
// or "paths Fallen could take to win" brings it up without naming a game:
//   - the team's next game as the site's game card;
//   - the field grid (lib/mcp/field-grid.js; JD: "all games on a huge grid
//     with the six fields on y and the times on x … the paths light up
//     depending on what team you choose"): every game on the team's days,
//     the site's timeline pills (division colour; winners tinted, losers
//     white, finished solid with the score), the games the team can still
//     play lit and the rest faded, green win arrows, red dashed loss
//     arrows, the finish under each game where a loss ends the run, the
//     team's played games joined by solid arrows, and a now line. A picker
//     lights up any other team in the division. Tap a game for its card.
//     Desktop: time across, fields down. Phone: fields across, time down.
// Arrows never cross each other or run through a lit game: each one tries
// a few shapes (a curve, or along the gaps between fields) and the first
// clear one is drawn; one that finds none becomes a label under its game
// ("Lose → G30"), the site timeline's rule for an arrow with no clear way.
// Arrows may pass over faded games. No polling: the grid is the tool
// result's moment; ask again for fresh scores. Text answer unchanged.

import { viewHtml } from "./views";

export const TEAM_VIEW_URI = "ui://afa/team";

const num = (label) => /^G(\d+)$/.exec(label ?? "")?.[1] ?? null;

/**
 * The game a team waits on when its name is not on the next slot yet: where
 * its last final sends it (Winner/Loser of that game).
 */
export function waitingGame(lastFinal, won, rows) {
  const x = won ? lastFinal?.flow?.winner : lastFinal?.flow?.loser;
  if (!x?.next) return null;
  const row = rows.find((r) => r.divisionId === lastFinal.divisionId && num(r.label) === String(x.next));
  return row ? { ...row, enter: { result: won ? "W" : "L", n: num(lastFinal.label) } } : null;
}

const TEAM_CSS = String.raw`
.teams { display: grid; gap: 1.5rem; }
.tm { display: grid; gap: 0.625rem; min-width: 0; }
.tm-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
.tm-name { font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em; }
.tm-rec { font-size: 0.8125rem; color: var(--label); }
.lbl { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--label); }
.end { font-size: 0.8125rem; color: var(--label); }
.fg-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.875rem; }
.fg-bar select {
  font: inherit; font-size: 0.875rem; font-weight: 600; color: var(--ink); background: var(--chip);
  border: 0; border-radius: 999px; min-height: 2.25rem; padding: 0 2rem 0 0.875rem; max-width: 100%;
  -webkit-appearance: none; appearance: none; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--label) 50%), linear-gradient(135deg, var(--label) 50%, transparent 50%);
  background-position: calc(100% - 15px) 55%, calc(100% - 10px) 55%; background-size: 5px 5px; background-repeat: no-repeat;
}
.fg-key { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; font-size: 0.6875rem; color: var(--label); }
.fg-key span { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
.fg-key svg { flex: none; }
.fg-sum { font-size: 0.75rem; color: var(--label); }
.fg-scroll { overflow-x: auto; overscroll-behavior-x: contain; border-radius: 0.875rem; background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 20 60 / 0.06); }
.fg { position: relative; }
.fg-lab { position: absolute; font-size: 0.6875rem; color: var(--label); white-space: nowrap; }
.fg-lab.field { font-size: 0.75rem; font-weight: 600; color: var(--ink); }
.fg-lab.day { font-size: 0.8125rem; font-weight: 700; color: var(--ink); }
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
button.pill.lit { z-index: 3; }
button.pill.next { box-shadow: 0 0 0 2px var(--card), 0 0 0 3.5px #a3e635, 0 0 12px 3px rgb(190 242 100 / 0.75); }
button.pill.open { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--tone-solid); }
button.pill:focus-visible { outline: 2px solid var(--tone-solid); outline-offset: 2px; }
button.pill .dot { position: absolute; top: 0.25rem; right: 0.25rem; width: 0.4375rem; height: 0.4375rem; border-radius: 50%; }
button.pill .dot.live { background: #22c55e; box-shadow: 0 0 0 2px rgb(34 197 94 / 0.3); }
button.pill .dot.awaiting { background: #f59e0b; }
.fg-under { position: absolute; z-index: 3; text-align: center; font-size: 0.625rem; line-height: 1.15; pointer-events: none; }
.fg-under .out { font-weight: 700; font-style: italic; color: var(--lose); }
.fg-under .cup { font-style: normal; color: #c99a1e; font-weight: 700; }
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
button.fg-more {
  justify-self: start; font: inherit; font-size: 0.8125rem; font-weight: 600; color: var(--link); background: var(--chip);
  border: 0; border-radius: 999px; min-height: 2.25rem; padding: 0 0.875rem; cursor: pointer;
}
.played { list-style: none; display: grid; gap: 0.25rem; font-size: 0.8125rem; }
.played .w { color: var(--win); font-weight: 600; }
.played .l { color: var(--lose); font-weight: 600; }
`;

const TEAM_JS = String.raw`
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var STATE = { live: "In progress", awaiting: "Awaiting score", final: "Final", upcoming: "", cancelled: "Cancelled" };

  // Geometry: phone (narrow) runs time down the page with the six fields
  // across; desktop runs time across with the fields down the side.
  function geometry(grid, width) {
    var vertical = width < 640;
    var G = vertical
      ? { vertical: true, side: 40, head: 34, hour: 86, dayHead: 26, fold: 24, gap: 0 }
      : { vertical: false, side: 86, head: 46, hour: 104, dayHead: 0, fold: 26, gap: 18 };
    var nf = grid.fields.length;
    if (vertical) {
      G.lane = Math.max(46, Math.floor((width - G.side - 6) / nf));
      G.pw = G.lane - 8; G.ph = 44; G.pad = 4;
    } else {
      G.lane = 84; G.pw = 64; G.ph = 40; G.pad = 5;
    }
    // Along the time axis: each day is its head, its folded band (an
    // opening run of all-final hours) and then an hour per step.
    var at = G.vertical ? G.head : G.side + 8;
    G.days = grid.days.map(function (d) {
      var x = { d: d, start: at + G.dayHead, fold: d.fold && !expanded[d.key] ? d.fold : 0 };
      x.len = (x.fold ? G.fold : 0) + (d.hours - x.fold) * G.hour;
      at = x.start + x.len + G.gap;
      return x;
    });
    G.length = at;
    G.across = G.side + nf * G.lane + (vertical ? 4 : 0);
    G.pos = function (day, m) {
      if (day.fold && m < day.fold * 60) return day.start + (m / (day.fold * 60)) * G.fold;
      return day.start + (day.fold ? G.fold : 0) + ((m - day.fold * 60) / 60) * G.hour;
    };
    return G;
  }
  // A game's box: x/y/w/h in the grid's own pixels, or null when folded away.
  function boxOf(G, day, g, keep) {
    if (day.fold && g.m < day.fold * 60) {
      // A game of the picked team inside a folded run: a chip on the band,
      // so its solid arrow still has somewhere to start.
      if (!keep) return null;
      var c = G.fold - 6;
      if (G.vertical) return { x: G.side + g.f * G.lane + G.pad, y: day.start + 3, w: G.pw, h: c, chip: true };
      return { x: day.start + 3, y: G.head + g.f * G.lane + 4 + (G.ph - 2 * c) / 2, w: c, h: 2 * c, chip: true };
    }
    var t = G.pos(day, g.m);
    if (G.vertical) return { x: G.side + g.f * G.lane + G.pad, y: t + 3, w: G.pw, h: G.ph };
    return { x: t + 4, y: G.head + g.f * G.lane + 4, w: G.pw, h: G.ph };
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
  function bez(p0, c1, c2, p3) {
    var pts = [];
    for (var i = 0; i <= 24; i++) {
      var t = i / 24, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]);
    }
    return pts;
  }
  function inBox(p, b, m) { return p[0] > b.x - m && p[0] < b.x + b.w + m && p[1] > b.y - m && p[1] < b.y + b.h + m; }
  // Candidate shapes from a to b ([x, y] on the boxes' facing edges); "u"
  // is the time axis (x on desktop, y on phone), "v" the field axis.
  function shapes(G, a, b, gutters) {
    var V = G.vertical;
    function P(u, v) { return V ? [v, u] : [u, v]; }
    var au = V ? a[1] : a[0], av = V ? a[0] : a[1], bu = V ? b[1] : b[0], bv = V ? b[0] : b[1];
    var d = bu - au, out = [];
    [0.5, 0.25, 0.8].forEach(function (k) {
      var pts = bez(P(au, av), P(au + d * k, av), P(bu - d * k, bv), P(bu, bv));
      out.push({ pts: pts, d: "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") });
    });
    // Along a gap between two fields: out into the time gap, across to the
    // gap beside the target's field, along it, and in.
    // Several offsets into each gap, so routes that share a gap nest
    // side by side instead of overlapping.
    var gap = G.hour - (V ? G.ph : G.pw);
    var offs = [0.25, 0.5, 0.75, 0.12, 0.88].map(function (f) { return Math.round(gap * f); });
    if (Math.abs(av - bv) < 2) return out;
    gutters.slice().sort(function (x, y) { return Math.abs(x - av) + Math.abs(x - bv) - Math.abs(y - av) - Math.abs(y - bv); }).forEach(function (gv) {
      offs.forEach(function (o1) {
        offs.forEach(function (o2) {
          var g1 = au + o1, g2 = bu - o2;
          if (g2 < g1) return;
          var pts = [P(au, av), P(g1, av), P(g1, gv), P(g2, gv), P(g2, bv), P(bu, bv)];
          out.push({ pts: pts, d: "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") });
        });
      });
    });
    // A direct dog-leg through one gap (no channel) when the two games are an hour apart.
    offs.forEach(function (o) {
      var g = au + o;
      if (g > bu - 3) return;
      var pts = [P(au, av), P(g, av), P(g, bv), P(bu, bv)];
      out.push({ pts: pts, d: "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") });
    });
    return out;
  }
  function clear(path, a, b, lit, from, to, drawn) {
    var s = sample(path.pts);
    for (var i = 2; i < s.length - 2; i++) {
      var p = s[i];
      for (var j = 0; j < lit.length; j++) if (lit[j] !== from && lit[j] !== to && inBox(p, lit[j], 3)) return false;
      if (inBox(p, from, -1) || inBox(p, to, -1)) return false;
      for (var k = 0; k < drawn.length; k++) {
        var q = drawn[k];
        var shareA = q.from === from, shareB = q.to === to;
        for (var m = 0; m < q.s.length; m++) {
          var r = q.s[m];
          if (Math.abs(r[0] - p[0]) > 3 || Math.abs(r[1] - p[1]) > 3) continue;
          // Arrows from the same game may leave together, into the same game arrive together.
          if (shareA && Math.hypot(p[0] - a[0], p[1] - a[1]) < 14) continue;
          if (shareB && Math.hypot(p[0] - b[0], p[1] - b[1]) < 14) continue;
          return false;
        }
      }
    }
    path.s = s;
    return true;
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
    var width = host.clientWidth || window.innerWidth;
    var G = geometry(grid, width);
    var W = G.vertical ? G.across : G.length + 12;
    var H = G.vertical ? G.length + 8 : G.across + 16;
    var wrap = el("div", "fg-scroll");
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
    if (G.vertical) {
      grid.fields.forEach(function (f, i) {
        var p = f.split(" ");
        var e = lab("field", p[0], G.side + i * G.lane, 3, G.lane);
        e.appendChild(document.createElement("br"));
        e.appendChild(document.createTextNode(p.slice(1).join(" ")));
        e.style.lineHeight = "1.15";
      });
    } else {
      var side = el("div", "fg-side");
      side.style.cssText = "position:sticky;left:0;top:0;width:" + G.side + "px;height:" + H + "px;margin-bottom:-" + H + "px;border-right:1px solid var(--hair)";
      box.appendChild(side);
      grid.fields.forEach(function (f, i) {
        var e = el("div", "fg-lab field", f);
        e.style.left = "12px"; e.style.top = G.head + i * G.lane + G.lane / 2 - 14 + "px";
        side.appendChild(e);
        line(G.side, G.head + i * G.lane, G.length - G.side + 12, 1);
      });
    }
    // Days, hours, folds, now
    G.days.forEach(function (day) {
      var d = day.d;
      if (G.vertical) {
        lab("day", d.title, 8, day.start - G.dayHead + 6, W - 16, "left");
        line(0, day.start - 1, W, 1);
      } else if (day.fold < d.hours) {
        lab("day", d.title, day.start + 2, 4);
      }
      if (day.fold) {
        var f = el("button", "fg-fold" + (G.vertical ? "" : " v"));
        add(f, el("span", null, G.vertical || day.fold === d.hours ? d.foldLabel : d.foldLabel.split(" \u00b7 ")[0]));
        f.title = d.foldLabel + " \u2014 show";
        if (G.vertical) f.style.cssText = "left:" + G.side + "px;top:" + (day.start + 2) + "px;width:" + (G.lane * grid.fields.length - 4) + "px;height:" + (G.fold - 4) + "px";
        else f.style.cssText = "left:" + (day.start + 2) + "px;top:" + (G.head + 2) + "px;width:" + (G.fold - 4) + "px;height:" + (G.lane * grid.fields.length - 4) + "px";
        f.addEventListener("click", function () { expanded[d.key] = true; draw(); });
        box.appendChild(f);
      }
      for (var h = day.fold; h < d.hours; h++) {
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
        var b = boxOf(G, day, g, played[g.i]);
        if (!b) return;
        b.day = day.d.key;
        b.m = g.m;
        boxes[g.i] = b;
        var dv = grid.divs[g.d];
        var cls = "pill " + (g.bs || "pool") + (g.st === "final" ? " done" : "") + (lit[g.i] ? " lit" : picked ? " dim" : "") + (g.i === nextI && !played[g.i] ? " next" : "");
        var p = el("button", cls);
        tone(p, { tone: dv });
        p.style.cssText += ";left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px";
        var short = dv.name.replace(/^Men's /, "M ").replace(/^Women's /, "W ").replace(/^Coed /, "C ");
        if (b.chip) { p.classList.add("chip"); if (!G.vertical) p.classList.add("cv"); add(p, el("span", "gno", g.n)); }
        else {
          if (g.st === "final" && g.sc) add(p, el("span", "gno", g.n), el("span", "scr", g.sc));
          else add(p, el("span", null, g.n));
          add(p, el("span", "div", short));
        }
        if (g.st === "live" || g.st === "awaiting") add(p, el("span", "dot " + g.st));
        p.setAttribute("aria-label", g.n + ", " + dv.name + ", " + g.t1 + " vs " + g.t2 + ", " + g.tm + ", " + grid.fields[g.f] + (STATE[g.st] ? ", " + STATE[g.st] : ""));
        p.addEventListener("click", function (e) { e.stopPropagation(); open(g, p, b); });
        box.appendChild(p);
        all.push(b);
        var bits = [];
        if (b.chip) return;
        if ((g.st === "live" || g.st === "awaiting") && (lit[g.i] || !picked)) bits.push(["st" + (g.st === "live" ? " live" : ""), STATE[g.st]]);
        if (lit[g.i] && !played[g.i] && track.out[g.i]) bits.push([track.out[g.i] === "\uD83C\uDFC6" ? "cup" : "out", (track.out[g.i] === "\uD83C\uDFC6" ? "" : "Out ") + track.out[g.i]]);
        unders[g.i] = bits;
      });
    });
    // Arrows: the team's games so far (solid), then where it can go.
    var s = svg("svg", { class: "fg-arrows", width: W, height: H, viewBox: "0 0 " + W + " " + H });
    var litBoxes = Object.keys(lit).map(function (i) { return boxes[i]; }).filter(Boolean);
    var gutters = [];
    // Channels between two fields: just before the next field's games,
    // clear of the labels under the games of the field before.
    for (var gi = 1; gi < grid.fields.length; gi++) gutters.push((G.vertical ? G.side + G.pad : G.head + 4) + gi * G.lane - 4);
    if (!G.vertical) gutters.push(G.head + grid.fields.length * G.lane + 8);
    function vOf(b) { return G.vertical ? b.x + b.w / 2 : b.y + b.h / 2; }
    function uOf(b) { return G.vertical ? b.y : b.x; }
    var list = track.went.map(function (e) { return { e: e, actual: true }; });
    // Shortest first (the hour-to-hour steps read best drawn), wins before
    // losses; a long jump that finds no clear way is the one left as a label.
    function span(e) { var a = boxes[e[0]], b = boxes[e[1]]; return a && b ? uOf(b) - uOf(a) : 0; }
    var possible = track.edges.slice().sort(function (x, y) {
      var r = { w: 0, l: 1, if: 2 };
      return span(x) - span(y) || r[x[2]] - r[y[2]];
    });
    possible.forEach(function (e) { list.push({ e: e, actual: false }); });
    // Ports: a game's arrows leave (and arrive) side by side, ordered by
    // where the other end is, so two arrows from one game never cross.
    var outs = {}, ins = {};
    list.forEach(function (it) {
      if (!boxes[it.e[0]] || !boxes[it.e[1]]) return;
      (outs[it.e[0]] = outs[it.e[0]] || []).push(it);
      (ins[it.e[1]] = ins[it.e[1]] || []).push(it);
    });
    function port(group, it, other) {
      var g = group.slice().sort(function (x, y) {
        var bx = boxes[x.e[other]], by = boxes[y.e[other]];
        return vOf(bx) - vOf(by) || (other ? uOf(by) - uOf(bx) : uOf(bx) - uOf(by));
      });
      var n = g.length, i = g.indexOf(it), step = Math.min(9, ((G.vertical ? G.pw : G.ph) - 12) / Math.max(1, n - 1));
      return n > 1 ? (i - (n - 1) / 2) * step : 0;
    }
    // Route every arrow in one order; try a few orders, keep the one that
    // leaves the fewest arrows as labels.
    function route(order) {
      var drawn = [], paths = [], stubs = [];
      order.forEach(function (it) {
        var a = boxes[it.e[0]], b = boxes[it.e[1]];
        if (!a || !b) return;
        var outOff = port(outs[it.e[0]], it, 1), inOff = port(ins[it.e[1]], it, 0);
        var p1 = G.vertical ? [a.x + a.w / 2 + outOff, a.y + a.h] : [a.x + a.w, a.y + a.h / 2 + outOff];
        var p2 = G.vertical ? [b.x + b.w / 2 + inOff, b.y - 1] : [b.x - 1, b.y + b.h / 2 + inOff];
        // Short, direct connectors only (JD review 2026-11-10: long elbows
        // are hard to follow): same day, at most two hours on, and no
        // detour much longer than the straight line. Anything else is a
        // label at both ends.
        if (a.day !== b.day || b.m - a.m > 120) return stubs.push(it);
        var direct = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        var cands = shapes(G, p1, p2, gutters).filter(function (c) {
          var L = 0;
          for (var j = 1; j < c.pts.length; j++) L += Math.hypot(c.pts[j][0] - c.pts[j - 1][0], c.pts[j][1] - c.pts[j - 1][1]);
          return L <= direct * 1.6 + 24;
        });
        var ok = null;
        for (var c = 0; c < cands.length && !ok; c++) if (clear(cands[c], p1, p2, litBoxes, a, b, drawn)) ok = cands[c];
        if (!ok) return stubs.push(it);
        drawn.push({ s: ok.s, from: a, to: b });
        paths.push({ it: it, d: ok.d, pts: ok.pts });
      });
      return { paths: paths, stubs: stubs };
    }
    var head = list.filter(function (it) { return it.actual; });
    var rest = list.filter(function (it) { return !it.actual; });
    var orders = [rest, rest.slice().reverse(), rest.slice().sort(function (x, y) { return (x.e[2] === "w" ? 0 : 1) - (y.e[2] === "w" ? 0 : 1); })];
    var best = null;
    orders.forEach(function (o) {
      var r = route(head.concat(o));
      if (!best || r.stubs.length < best.stubs.length) best = r;
    });
    best.paths.forEach(function (p) {
      var it = p.it, k = it.e[2];
      var color = k === "w" ? "var(--win)" : k === "l" ? "var(--lose)" : "#c99a1e";
      s.appendChild(svg("path", {
        d: p.d, fill: "none", stroke: color, "stroke-width": it.actual ? 2.25 : 1.5,
        "stroke-dasharray": it.actual ? "" : k === "l" ? "5 3" : k === "if" ? "2 3" : "",
        "stroke-linejoin": "round", "stroke-linecap": "round", opacity: it.actual ? 1 : 0.9,
      }));
      // Arrowhead: a small triangle along the last stretch of the line.
      var q = p.pts[p.pts.length - 1], r = p.pts[p.pts.length - 2];
      for (var j = p.pts.length - 2; j >= 0 && Math.hypot(q[0] - r[0], q[1] - r[1]) < 1; j--) r = p.pts[j];
      var len = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1, ux = (q[0] - r[0]) / len, uy = (q[1] - r[1]) / len;
      var hl = 6, hw = 3.25;
      s.appendChild(svg("path", {
        d: "M" + q[0].toFixed(1) + " " + q[1].toFixed(1) + " L" + (q[0] - ux * hl - uy * hw).toFixed(1) + " " + (q[1] - uy * hl + ux * hw).toFixed(1) + " L" + (q[0] - ux * hl + uy * hw).toFixed(1) + " " + (q[1] - uy * hl - ux * hw).toFixed(1) + " Z",
        fill: color,
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
    function draw() { var fresh = gridEl(t, picked, host); wrap.replaceWith(fresh); size(); }
    return wrap;
  }
  var expanded = {};

  // The paths section: picker, key and the field grid for one team view.
  function pathsEl(t, withLabel) {
    var out = el("div", "tm");
      var picked = t.selected;
      if (withLabel) add(out, el("div", "lbl", "Paths to the title"));
      var bar = el("div", "fg-bar");
      var sel = el("select");
      sel.setAttribute("aria-label", "Team");
      t.picker.forEach(function (p) {
        var o = el("option", null, p.name + " \u00b7 " + p.record + (p.end ? " \u00b7 " + p.end : ""));
        o.value = p.name;
        if (p.name === picked) o.selected = true;
        sel.appendChild(o);
      });
      var sum = el("span", "fg-sum");
      bar.appendChild(sel);
      bar.appendChild(sum);
      out.appendChild(bar);
      out.appendChild(keyEl(t.grid));
      var holder = el("div");
      out.appendChild(holder);
      var current = null;
      function show() {
        var p = t.picker.filter(function (x) { return x.name === picked; })[0];
        sum.textContent = p ? (p.reach.length ? p.reach.length + " games still possible" : p.end || "No games left") : "";
        var g = gridEl(t, picked, out);
        if (current) current.replaceWith(g); else holder.appendChild(g);
        current = g;
        size();
      }
      sel.addEventListener("change", function () { picked = sel.value; show(); });
      setTimeout(show, 0);
      var lastV = null;
      window.addEventListener("resize", function () {
        var v = (out.clientWidth || window.innerWidth) < 640;
        if (lastV !== null && v !== lastV) show();
        lastV = v;
      });
      lastV = (out.clientWidth || window.innerWidth) < 640;
    return out;
  }
  function teamEl(t) {
    var sec = el("section", "tm");
    tone(sec, t);
    var head = el("div", "tm-head");
    add(head, el("span", "tm-name", t.team), el("span", "tag", t.division), el("span", "tm-rec", t.record + (t.end ? " \u00b7 " + t.end : "")));
    sec.appendChild(head);
    if (t.next) {
      add(sec, el("div", "lbl", t.waiting ? "Next game (waiting on " + t.waiting + ")" : "Next game"));
      sec.appendChild(cardEl(t.next));
    } else if (!t.end) add(sec, el("p", "end", "No game on the schedule for this team right now."));
    if (t.grid && t.picker) sec.appendChild(pathsEl(t, true));
    else if (t.lazy) {
      // Several teams of one name: each grid is fetched when asked for, so
      // the answer stays small (the host runs get_team_path for the view).
      add(sec, el("div", "lbl", "Paths to the title"));
      if (caps.serverTools) {
        var btn = el("button", "fg-more", "Show " + t.division + " paths \u203a");
        btn.type = "button";
        btn.addEventListener("click", function () {
          btn.disabled = true;
          btn.textContent = "Loading\u2026";
          request("tools/call", { name: "get_team_path", arguments: t.lazy }).then(function (r) {
            var v = r && r.structuredContent && r.structuredContent.view;
            var one = v && v.teams && v.teams[0];
            if (!one || !one.grid) throw new Error("no grid");
            btn.replaceWith(pathsEl(one, false));
            size();
          }).catch(function () { btn.disabled = false; btn.textContent = "Couldn\u2019t load \u2014 try again"; });
        });
        sec.appendChild(btn);
      } else add(sec, el("p", "end", "Ask about " + t.team + " in " + t.division + " to see its paths."));
    }
    if (t.played.length) {
      add(sec, el("div", "lbl", "Results"));
      var ul = el("ul", "played");
      t.played.forEach(function (p) {
        var li = el("li");
        add(li, el("span", p.result === "Won" ? "w" : p.result === "Lost" ? "l" : null, p.result), document.createTextNode(" " + p.score + " vs " + p.opponent + " \u00b7 " + p.title));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
    }
    sec.appendChild(siteLink(t.url, "Open " + t.division + " bracket \u203a", "foot"));
    return sec;
  }
  function keyEl(grid) {
    var k = el("div", "fg-key");
    function sw(color, dash, w) {
      var s = svg("svg", { width: 22, height: 8 });
      s.appendChild(svg("line", { x1: 1, y1: 4, x2: 21, y2: 4, stroke: color, "stroke-width": w || 1.5, "stroke-dasharray": dash || "" }));
      return s;
    }
    var a = el("span"); a.appendChild(sw("var(--win)")); a.appendChild(document.createTextNode("Win"));
    var b = el("span"); b.appendChild(sw("var(--lose)", "5 3")); b.appendChild(document.createTextNode("Loss"));
    var c = el("span"); c.appendChild(sw("var(--ink)", "", 2.25)); c.appendChild(document.createTextNode("Played"));
    add(k, a, b, c, el("span", null, "Out 9th: their finish if they lose there"), el("span", null, "Times " + (grid.zone || "MT")));
    return k;
  }
  function render(sc, args) {
    var v = sc.view;
    if (!v || !v.teams || !v.teams.length) return false;
    var list = el("div", "teams");
    v.teams.forEach(function (t) { list.appendChild(teamEl(t)); });
    root.appendChild(list);
  }
`;

export const TEAM_VIEW_HTML = viewHtml({ title: "AFA team", appName: "AFA team path", css: TEAM_CSS, js: TEAM_JS });
