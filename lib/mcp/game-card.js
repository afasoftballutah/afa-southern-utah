// MCP Apps view for get_game (JD 2026-11-10: "give it a shot but break it
// into pieces so I can be sure we are building the right thing" — piece 1).
//
// An MCP Apps host (Claude, ChatGPT, VS Code, …) draws this card inside the
// chat when get_game runs; every other client still reads the unchanged
// JSON text. The card is the site's opened game pill (components/
// ScheduleTimeline.js Details): division / W·L·★ Final / Game N tags in the
// division's color, the matchup board, where the loser (red) and winner
// (green) go next with day, time and field, the game's time and field, and
// "View on site" (the division page opened on that game).
//
// Spec: io.modelcontextprotocol/ui 2026-01-26. The view is one
// self-contained HTML document — inline CSS and a ~70-line postMessage
// bridge (ui/initialize, tool-result, open-link, size-changed), no scripts,
// fonts or fetches from anywhere — so the default block-all CSP is enough
// and nothing is declared in _meta.ui.csp. It draws only from the tool's
// structuredContent: the same public fields as the text (never contacts).

import { DIVISION_TONES } from "@/lib/division-tones";
import { divisionTone, bracketPill, nextStep, fieldDisplayName, gameTitle } from "@/lib/schedule-timeline";
import { gameView, whenLabel } from "./game-view";

export const GAME_CARD_URI = "ui://afa/game";

/** "Sun 4 PM PST" → "Sun 4 PM": the card's Time row already names the zone. */
const noZone = (s) => (s ? s.replace(/\s+(?!AM$|PM$)[A-Z]{2,5}$/, "") : s);

/** "Thu 4 PM · Hunter F3" for game N in the same division, or null. */
function whereOf(rows, row, n, tz) {
  if (!n) return null;
  const to = rows.find((r) => r.divisionId === row.divisionId && r.label === `G${n}`);
  if (!to?.scheduledTime || !to?.field) return null;
  return `${noZone(whenLabel(to.scheduledTime, tz))} \u00b7 ${fieldDisplayName(to.field)}`;
}

/** One side of "where the teams go": what the site's NextValue shows. */
function step(x, role, rows, row, tz) {
  const s = nextStep(x, role);
  if (!s) return null;
  if (s.champion) return { champion: true };
  if (s.out) return { out: true, place: s.place ?? null };
  if (s.place) return { place: s.place };
  if (s.next) return { next: s.next, where: whereOf(rows, row, x.next, tz) };
  return { text: s.text };
}

/**
 * What the card draws, from a getTournamentSchedule row and its schedule
 * (for where the next games are). Public fields only.
 */
export function gameCard(row, rows, tz, { siteUrl, slug }) {
  const g = gameView(row, tz);
  const tone = DIVISION_TONES[divisionTone(row.divisionName)] ?? DIVISION_TONES.other;
  const side = bracketPill(row);
  const final = Boolean(row.isFinal || row.status === "final");
  const n = /^G(\d+)$/.exec(row.label ?? "")?.[1] ?? null;
  const board = [1, 2].map((i) => {
    const score = row[`score${i}`];
    const other = row[`score${i === 1 ? 2 : 1}`];
    const label = g[`team${i}`];
    const feed = /^(Winner|Loser) (G\d+)$/.exec(label ?? "");
    return {
      ...(feed ? { from: feed[1], game: feed[2] } : { team: label ?? "TBD" }),
      score: final && typeof score === "number" ? score : null,
      won: final && typeof score === "number" && typeof other === "number" && score > other,
      place: row[`team${i}Place`] ?? null,
    };
  });
  const ifN = /(\d+)\s*$/.exec(String(row.flow?.ifGame ?? ""))?.[1] ?? null;
  const base = slug && row.divisionId ? `${siteUrl}/tournaments/${slug}/division/${row.divisionId}` : `${siteUrl}/tournaments/${slug ?? ""}`;
  return {
    division: row.divisionName ?? null,
    tone: { bg: tone.bg, ink: tone.ink, solid: tone.solid },
    side: side ? { text: side.text, label: side.label, gold: Boolean(side.gold) } : null,
    title: gameTitle(row.label),
    status: g.status,
    board,
    loser: step(row.flow?.loser, "loser", rows, row, tz),
    winner: step(row.flow?.winner, "winner", rows, row, tz),
    ifGame: ifN ? { title: `Game ${ifN}`, where: whereOf(rows, row, ifN, tz) } : null,
    rule: row.flow?.rule ?? null,
    time: g.when,
    field: g.field,
    url: n && row.bracketSide !== "pool" ? `${base}?game=${n}` : base,
  };
}

const CSS = String.raw`
:root {
  color-scheme: light dark;
  --ink: var(--color-text-primary, #1d1d1f);
  --label: var(--color-text-secondary, #6e6e73);
  --card: var(--color-background-primary, #fff);
  --board: #f6f6f8;
  --chip: #f2f2f7;
  --hair: rgb(0 0 0 / 0.07);
  --link: #002868;
  --lose: #dc2626;
  --win: #15803d;
  --font: var(--font-sans, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif);
}
:root.dark {
  --ink: var(--color-text-primary, #f2f2f7);
  --label: var(--color-text-secondary, #a1a1aa);
  --card: var(--color-background-primary, #1c1c1e);
  --board: #2c2c2e;
  --chip: #3a3a3c;
  --hair: rgb(255 255 255 / 0.1);
  --link: #93b4ff;
  --lose: #f87171;
  --win: #4ade80;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: var(--font); color: var(--ink); -webkit-font-smoothing: antialiased; }
.card {
  max-width: 26rem; background: var(--card); border-radius: 0.875rem; padding: 0 1rem;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 20 60 / 0.08);
}
.sec { padding: 0.75rem 0; }
.sec.tight { padding: 0.5rem 0; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; padding-top: 0.875rem; }
.tag {
  display: inline-flex; align-items: center; height: 1.375rem; white-space: nowrap; padding: 0 0.5rem;
  border-radius: 999px; background: var(--tone-bg); color: var(--tone-ink);
  font-size: 0.75rem; font-weight: 600; line-height: 1;
}
.tag.side { min-width: 1.375rem; justify-content: center; background: var(--chip); color: var(--ink); }
.tag.side.gold { background: #fbf3dc; color: #8a6a10; }
.tag.game { background: var(--chip); color: var(--ink); font-weight: 700; }
.tag.status { background: transparent; color: var(--label); font-weight: 500; padding: 0 0.25rem; }
.board { list-style: none; display: grid; border-radius: 0.625rem; background: var(--board); }
.row { display: flex; align-items: center; gap: 0.5rem; min-height: 2.5rem; padding: 0 0.75rem; font-size: 0.9375rem; }
.row + .row { border-top: 1px solid var(--hair); }
.team { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.row.won .team { font-weight: 700; }
.from { font-size: 0.75rem; font-weight: 400; color: var(--label); }
.out { flex: none; font-size: 0.75rem; color: var(--label); }
.score { flex: none; min-width: 1.5rem; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.place { font-weight: 700; font-style: italic; }
.cup { font-style: normal; color: #c99a1e; }
dl.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
dl.pair > div:last-child { text-align: right; }
dt { font-size: 0.6875rem; color: var(--label); margin-bottom: 0.125rem; }
dd { font-size: 0.875rem; font-weight: 500; }
.arrow { color: var(--label); }
.muted { color: var(--label); }
dd.where { font-size: 0.75rem; font-weight: 400; margin-top: 0.125rem; white-space: nowrap; }
dd.where.lose { color: var(--lose); }
dd.where.win { color: var(--win); }
.rule { margin-top: 0.375rem; font-size: 0.75rem; line-height: 1.4; color: var(--label); }
.foot { border-top: 1px solid var(--hair); padding: 0.25rem 0; }
.foot a { display: flex; align-items: center; min-height: 2.75rem; font-size: 0.8125rem; font-weight: 600; color: var(--link); text-decoration: none; }
.foot a:hover { text-decoration: underline; }
.foot .url { font-size: 0.6875rem; color: var(--label); padding-bottom: 0.5rem; word-break: break-all; display: none; }
.foot.fallback .url { display: block; }
.note { padding: 1rem; font-size: 0.875rem; color: var(--label); }
`;

// The view's whole runtime: the MCP Apps handshake over postMessage, the
// card drawn with textContent (team names are data, never HTML), and
// "View on site" through the host's ui/open-link (a plain link otherwise).
const SCRIPT = String.raw`
(function () {
  var root = document.getElementById("app");
  var caps = {};
  var seq = 0;
  var waiting = {};
  function post(msg) { msg.jsonrpc = "2.0"; window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = ++seq;
    post({ id: id, method: method, params: params });
    return new Promise(function (resolve, reject) {
      waiting[id] = { resolve: resolve, reject: reject };
      setTimeout(function () { if (waiting[id]) { delete waiting[id]; reject(new Error("timeout")); } }, 10000);
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function placeEl(place) {
    var s = el("span", "place" + (place === "\uD83C\uDFC6" ? " cup" : ""), place);
    return s;
  }
  function nextValue(s) {
    var v = el("span");
    if (!s) { v.className = "muted"; v.textContent = "\u2014"; return v; }
    if (s.champion) { v.className = "cup"; v.textContent = "\uD83C\uDFC6"; v.setAttribute("aria-label", "Champion"); return v; }
    if (s.out) { v.textContent = "Out"; if (s.place) { v.appendChild(document.createTextNode(" \u00b7 ")); v.appendChild(placeEl(s.place)); } return v; }
    if (s.place) { v.appendChild(placeEl(s.place)); return v; }
    if (s.next) { add(v, el("span", "arrow", "\u2192")); v.appendChild(document.createTextNode(" " + s.next)); return v; }
    v.textContent = s.text || "\u2014";
    return v;
  }
  function pairBlock(dtText, s, whereCls) {
    var d = el("div");
    add(d, el("dt", null, dtText));
    var dd = el("dd"); dd.appendChild(nextValue(s)); d.appendChild(dd);
    if (s && s.next && s.where) add(d, el("dd", "where " + whereCls, "(" + s.where + ")"));
    return d;
  }
  function render(c) {
    root.textContent = "";
    var card = el("article", "card");
    card.style.setProperty("--tone-bg", c.tone.bg);
    card.style.setProperty("--tone-ink", c.tone.ink);
    card.style.setProperty("--tone-solid", c.tone.solid);
    card.setAttribute("aria-label", (c.division || "") + " " + c.title);

    var head = el("header", "head");
    add(head, el("span", "tag", c.division));
    if (c.side) { var sd = el("span", "tag side" + (c.side.gold ? " gold" : ""), c.side.text); sd.title = c.side.label; sd.setAttribute("aria-label", c.side.label); head.appendChild(sd); }
    add(head, el("span", "tag game", c.title));
    if (c.status === "In progress" || c.status === "Cancelled") add(head, el("span", "tag status", c.status));
    card.appendChild(head);

    var board = el("ol", "board");
    c.board.forEach(function (r) {
      var li = el("li", "row" + (r.won ? " won" : ""));
      var t = el("span", "team");
      if (r.team) t.textContent = r.team;
      else { add(t, el("span", "from", r.from)); t.appendChild(document.createTextNode(" " + r.game)); }
      li.appendChild(t);
      if (r.place) { var o = el("span", "out", "Out \u00b7 "); o.appendChild(placeEl(r.place)); li.appendChild(o); }
      if (r.score != null) add(li, el("span", "score", r.score));
      board.appendChild(li);
    });
    add(card, add(el("section", "sec"), board));

    if (c.loser || c.winner || c.ifGame) {
      var go = el("section", "sec tight");
      add(go, add(el("dl", "pair"), pairBlock("Loser", c.loser, "lose"), pairBlock("Winner", c.winner, "win")));
      if (c.ifGame) {
        var p = el("p", "rule", "If " + c.ifGame.title + (c.ifGame.where ? " (" + c.ifGame.where + ")" : ""));
        if (c.rule) p.title = c.rule;
        go.appendChild(p);
      }
      card.appendChild(go);
    }

    var tf = el("dl", "pair");
    var a = el("div"); add(a, el("dt", null, "Time"), el("dd", null, c.time || "TBD"));
    var b = el("div"); add(b, el("dt", null, "Field"), el("dd", null, c.field || "TBD"));
    add(card, add(el("section", "sec tight"), add(tf, a, b)));

    var foot = el("footer", "foot");
    var link = el("a", null, "View on site \u203a");
    link.href = c.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.addEventListener("click", function (e) {
      if (!caps.openLinks) { foot.classList.add("fallback"); return; }
      e.preventDefault();
      request("ui/open-link", { url: c.url }).then(function (r) { if (r && r.isError) foot.classList.add("fallback"); }, function () { foot.classList.add("fallback"); });
    });
    add(foot, link, el("div", "url", c.url));
    card.appendChild(foot);
    root.appendChild(card);
    size();
  }
  function note(text) { root.textContent = ""; add(root, el("p", "note", text)); size(); }
  function onResult(r) {
    var sc = r && r.structuredContent;
    if (sc && sc.card) return render(sc.card);
    var msg = "This game could not be shown.";
    try { var j = JSON.parse(r.content[0].text); if (j && j.error) msg = j.error; } catch (_) {}
    note(msg);
  }
  function theme(ctx) {
    if (!ctx) return;
    if (ctx.theme) document.documentElement.classList.toggle("dark", ctx.theme === "dark");
    var v = ctx.styles && ctx.styles.variables;
    if (v) for (var k in v) if (v[k]) document.documentElement.style.setProperty(k, v[k]);
  }
  var lastH = 0;
  function size() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h && h !== lastH) { lastH = h; post({ method: "ui/notifications/size-changed", params: { height: h } }); }
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method == null && m.id != null && waiting[m.id]) {
      var w = waiting[m.id]; delete waiting[m.id];
      return m.error ? w.reject(m.error) : w.resolve(m.result);
    }
    if (m.method === "ui/notifications/tool-result") return onResult(m.params);
    if (m.method === "ui/notifications/tool-cancelled") return note("Cancelled.");
    if (m.method === "ui/notifications/host-context-changed") return theme(m.params);
    if (m.id != null && (m.method === "ui/resource-teardown" || m.method === "ping")) return post({ id: m.id, result: {} });
    if (m.id != null && m.method) post({ id: m.id, error: { code: -32601, message: "Method not found" } });
  });
  if (window.ResizeObserver) new ResizeObserver(size).observe(document.documentElement);
  note("Loading game\u2026");
  request("ui/initialize", { appInfo: { name: "AFA game card", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" })
    .then(function (r) {
      caps = (r && r.hostCapabilities) || {};
      theme(r && r.hostContext);
      post({ method: "ui/notifications/initialized", params: {} });
    }, function () {});
})();
`;

export const GAME_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AFA game</title>
<style>${CSS}</style>
</head>
<body>
<div id="app"></div>
<script>${SCRIPT}</script>
</body>
</html>
`;
