// Shared pieces of the AFA MCP Apps views (ui://afa/game, ui://afa/team,
// ui://afa/games): the site's game-card look, the card renderer and the
// MCP Apps postMessage bridge. Each view is one self-contained HTML
// document built by viewHtml(): inline CSS and script, nothing loaded from
// anywhere, so the host's default block-all CSP is all it needs. Views draw
// only from the tool's structuredContent, and only with textContent (team
// names are data, never HTML).

export const CSS = String.raw`
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
#app { padding: 2px; }
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
.row.us .team { font-weight: 700; color: var(--tone-ink); }
:root.dark .row.us .team { color: var(--ink); }
.via { flex: none; font-size: 0.6875rem; color: var(--label); }
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
.foot a, a.site { display: flex; align-items: center; min-height: 2.75rem; font-size: 0.8125rem; font-weight: 600; color: var(--link); text-decoration: none; }
.foot a:hover, a.site:hover { text-decoration: underline; }
.foot .url { font-size: 0.6875rem; color: var(--label); padding-bottom: 0.5rem; word-break: break-all; display: none; }
.foot.fallback .url { display: block; }
.note { padding: 1rem; font-size: 0.875rem; color: var(--label); }
/* Compact card: a step on a route or a row in a list. */
.card.compact { padding: 0 0.75rem; }
.card.compact .head { padding-top: 0.625rem; }
.card.compact .sec { padding: 0.5rem 0; }
.card.compact .row { min-height: 2.125rem; font-size: 0.875rem; }
.meta { margin-left: auto; font-size: 0.75rem; font-weight: 500; color: var(--ink); white-space: nowrap; }
.go { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 0.75rem; padding: 0 0 0.625rem; font-size: 0.75rem; }
.go .lose { color: var(--lose); }
.go .win { color: var(--win); }
.flag { font-size: 0.75rem; color: #8a6a10; padding: 0 0 0.5rem; }
`;

// In-page card renderer (shared by every view).
export const CARD_JS = String.raw`
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function placeEl(place) { return el("span", "place" + (place === "\uD83C\uDFC6" ? " cup" : ""), place); }
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
  function stepText(s) {
    if (!s) return null;
    if (s.champion) return "\uD83C\uDFC6 Champion";
    if (s.out) return "\u2192 Out" + (s.place ? " \u00b7 " + s.place : "");
    if (s.place) return "\u2192 " + s.place;
    if (s.next) return "\u2192 " + s.next + (s.where ? " \u00b7 " + s.where : "");
    return s.text || null;
  }
  function pairBlock(dtText, s, whereCls) {
    var d = el("div");
    add(d, el("dt", null, dtText));
    var dd = el("dd"); dd.appendChild(nextValue(s)); d.appendChild(dd);
    if (s && s.next && s.where) add(d, el("dd", "where " + whereCls, "(" + s.where + ")"));
    return d;
  }
  function tone(node, c) {
    node.style.setProperty("--tone-bg", c.tone.bg);
    node.style.setProperty("--tone-ink", c.tone.ink);
    node.style.setProperty("--tone-solid", c.tone.solid);
  }
  function boardEl(c) {
    var board = el("ol", "board");
    c.board.forEach(function (r) {
      var li = el("li", "row" + (r.won ? " won" : "") + (r.us ? " us" : ""));
      var t = el("span", "team");
      if (r.team) t.textContent = r.team;
      else { add(t, el("span", "from", r.from)); t.appendChild(document.createTextNode(" " + r.game)); }
      li.appendChild(t);
      if (r.via) add(li, el("span", "via", r.via));
      if (r.place) { var o = el("span", "out", "Out \u00b7 "); o.appendChild(placeEl(r.place)); li.appendChild(o); }
      if (r.score != null) add(li, el("span", "score", r.score));
      board.appendChild(li);
    });
    return board;
  }
  function headEl(c, withDivision) {
    var head = el("header", "head");
    if (withDivision) add(head, el("span", "tag", c.division));
    if (c.side) { var sd = el("span", "tag side" + (c.side.gold ? " gold" : ""), c.side.text); sd.title = c.side.label; sd.setAttribute("aria-label", c.side.label); head.appendChild(sd); }
    add(head, el("span", "tag game", c.title));
    if (c.status === "In progress" || c.status === "Cancelled") add(head, el("span", "tag status", c.status));
    return head;
  }
  // The full card: the site's opened pill.
  function cardEl(c, opts) {
    opts = opts || {};
    var card = el("article", "card");
    tone(card, c);
    card.setAttribute("aria-label", (c.division || "") + " " + c.title);
    card.appendChild(headEl(c, true));
    add(card, add(el("section", "sec"), boardEl(c)));
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
    if (opts.footer !== false) card.appendChild(siteLink(c.url, opts.linkText || "View on site \u203a", "foot"));
    return card;
  }
  // The compact card: tags, time and field on one line, the board, and
  // where a loss (red) and a win (green) go.
  function compactEl(c, opts) {
    opts = opts || {};
    var card = el("article", "card compact");
    tone(card, c);
    card.setAttribute("aria-label", (c.division || "") + " " + c.title);
    var head = headEl(c, opts.division);
    add(head, el("span", "meta", [c.time || "TBD", c.field].filter(Boolean).join(" \u00b7 ")));
    card.appendChild(head);
    add(card, add(el("section", "sec"), boardEl(c)));
    var lose = stepText(c.loser), win = stepText(c.winner);
    if (lose || win) {
      var go = el("p", "go");
      add(go, lose ? el("span", "lose", "Lose " + lose) : el("span"), win ? el("span", "win", "Win " + win) : null);
      card.appendChild(go);
    }
    if (c.flag) add(card, el("p", "flag", c.flag));
    return card;
  }
`;

// The MCP Apps bridge. The view defines render(structuredContent) before it.
export const BRIDGE_JS = String.raw`
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
  // "View on site": the host opens it (ui/open-link); a plain link otherwise,
  // with the address shown when the host refuses.
  function siteLink(url, text, cls) {
    var box = el(cls === "foot" ? "footer" : "div", cls);
    var link = el("a", cls === "foot" ? null : "site", text);
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.addEventListener("click", function (e) {
      if (!caps.openLinks) { box.classList.add("fallback"); return; }
      e.preventDefault();
      request("ui/open-link", { url: url }).then(function (r) { if (r && r.isError) box.classList.add("fallback"); }, function () { box.classList.add("fallback"); });
    });
    add(box, link, el("div", "url", url));
    return box;
  }
  var root = document.getElementById("app");
  function note(text) { root.textContent = ""; add(root, el("p", "note", text)); size(); }
  var args = {};
  function onResult(r) {
    var sc = r && r.structuredContent;
    if (sc && !r.isError) { root.textContent = ""; if (render(sc, args) !== false) return size(); }
    var msg = "This could not be shown.";
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
    if (m.method === "ui/notifications/tool-input") { args = (m.params && m.params.arguments) || {}; return; }
    if (m.method === "ui/notifications/tool-result") return onResult(m.params);
    if (m.method === "ui/notifications/tool-cancelled") return note("Cancelled.");
    if (m.method === "ui/notifications/host-context-changed") return theme(m.params);
    if (m.id != null && (m.method === "ui/resource-teardown" || m.method === "ping")) return post({ id: m.id, result: {} });
    if (m.id != null && m.method) post({ id: m.id, error: { code: -32601, message: "Method not found" } });
  });
  if (window.ResizeObserver) new ResizeObserver(size).observe(document.documentElement);
  note("Loading\u2026");
  request("ui/initialize", { appInfo: { name: APP_NAME, version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" })
    .then(function (r) {
      caps = (r && r.hostCapabilities) || {};
      theme(r && r.hostContext);
      post({ method: "ui/notifications/initialized", params: {} });
    }, function () {});
`;

/** One self-contained view: shared CSS + extra, shared JS + the view's render(sc, args). */
export function viewHtml({ title, appName, css = "", js }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}${css}</style>
</head>
<body>
<div id="app"></div>
<script>
(function () {
  var APP_NAME = ${JSON.stringify(appName)};
${CARD_JS}
${js}
${BRIDGE_JS}
})();
</script>
</body>
</html>
`;
}
