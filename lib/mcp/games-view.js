// MCP Apps view for get_schedule and get_now_next: ui://afa/games (JD
// 2026-11-10, piece 2). A list of the site's game cards, compact, grouped
// by day (schedule) or by Now playing / Up next / Just finished. With a
// team filter ("Fallen") every game of every team with that name shows, so
// a name in four divisions gives one card per division, each in its
// division's color with the team's row marked. Public data only; the text
// answer is unchanged.

import { gameCard } from "./game-card";
import { localDay } from "./game-view";
import { viewHtml } from "./views";

export const GAMES_VIEW_URI = "ui://afa/games";
export const VIEW_MAX = 24;

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** "Thu, Nov 12" for a game's local day. */
export function dayTitle(day) {
  if (!day) return "Time TBD";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function card(row, ctx, team) {
  const c = gameCard(row, ctx.rows, ctx.tz, ctx.site);
  if (team) c.board = c.board.map((b) => (b.team && norm(b.team).includes(norm(team)) ? { ...b, us: true } : b));
  return c;
}

/**
 * groups: [{ label, rows }] → the view. At most VIEW_MAX cards in all; the
 * rest are counted ("+ 12 more on the site").
 */
export function gamesView({ title, subtitle = null, groups, ctx, team = null, url }) {
  let left = VIEW_MAX;
  let hidden = 0;
  const out = [];
  for (const g of groups) {
    const rows = g.rows.slice(0, Math.max(0, left));
    hidden += g.rows.length - rows.length;
    left -= rows.length;
    if (rows.length) out.push({ label: g.label, cards: rows.map((r) => card(r, ctx, team)) });
    else if (g.empty) out.push({ label: g.label, cards: [], empty: g.empty });
  }
  return { title, subtitle, groups: out, more: hidden, url };
}

/** Schedule rows grouped by their local day. */
export function byDay(rows, tz) {
  const groups = [];
  for (const r of rows) {
    const label = dayTitle(localDay(r.scheduledTime, tz));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

const GAMES_CSS = String.raw`
.list-head { display: grid; gap: 0.125rem; margin-bottom: 0.75rem; }
.list-title { font-size: 1.0625rem; font-weight: 700; letter-spacing: -0.01em; }
.list-sub { font-size: 0.8125rem; color: var(--label); }
.group + .group { margin-top: 1rem; }
.group-label { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--label); margin-bottom: 0.5rem; }
.cards { display: grid; gap: 0.625rem; }
@media (min-width: 720px) { .cards { grid-template-columns: repeat(2, minmax(0, 26rem)); } }
.empty { font-size: 0.8125rem; color: var(--label); }
.more { margin-top: 0.75rem; font-size: 0.8125rem; color: var(--label); }
`;

const GAMES_JS = String.raw`
  function render(sc) {
    var v = sc.view;
    if (!v || !v.groups) return false;
    var head = el("header", "list-head");
    add(head, el("div", "list-title", v.title), v.subtitle ? el("div", "list-sub", v.subtitle) : null);
    root.appendChild(head);
    if (!v.groups.length) add(root, el("p", "empty", "No games match."));
    v.groups.forEach(function (g) {
      var box = el("section", "group");
      add(box, el("div", "group-label", g.label));
      if (g.empty) add(box, el("p", "empty", g.empty));
      var cards = el("div", "cards");
      g.cards.forEach(function (c) { cards.appendChild(compactEl(c, { division: true })); });
      box.appendChild(cards);
      root.appendChild(box);
    });
    if (v.more) add(root, el("p", "more", "+ " + v.more + " more on the site"));
    root.appendChild(siteLink(v.url, "View on site \u203a", "foot"));
  }
`;

export const GAMES_VIEW_HTML = viewHtml({ title: "AFA games", appName: "AFA games", css: GAMES_CSS, js: GAMES_JS });
