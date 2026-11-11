// MCP Apps view for get_team_path: ui://afa/team (JD 2026-11-10: "i dont
// want to have to ask so specifically" — piece 2). Asking "next game for
// Fallen" or "paths Fallen could take to win" brings up cards without
// naming a game:
//   - the team's next game as the site's game card;
//   - results so far;
//   - Paths to the title: the undefeated (win-out) route and the route
//     after a loss in the next game, as compact game cards linked by
//     Winner/Loser, each with its time and field and where a loss (red) or
//     a win (green) goes. Open when the user asked about paths (paths:
//     true), one tap away otherwise.
// Routes follow the bracket's own flow (lib/bracket/flow.js, the same
// arrows the site draws): Winner → the game it feeds, Loser → the losers
// side or out. A route that reaches the final from the losers side ends
// with the if-necessary game. Public data only; the text answer is
// unchanged.

import { gameCard, whereOf } from "./game-card";
import { viewHtml } from "./views";

export const TEAM_VIEW_URI = "ui://afa/team";

const num = (label) => /^G(\d+)$/.exec(label ?? "")?.[1] ?? null;
const norm = (s) => String(s ?? "").trim().toLowerCase();

/** G# → row within the row's own division (bracket game numbers are per division). */
function numberIndex(rows, divisionId) {
  const m = new Map();
  for (const r of rows) if (r.divisionId === divisionId && num(r.label)) m.set(num(r.label), r);
  return m;
}

/** Which board slot (0/1) is fed by "W5"/"L5", or -1. */
function slotFedBy(row, result, n) {
  return (row.flow?.from ?? []).findIndex((f) => f?.short === `${result}${n}`);
}

function stepCard(row, ctx, { team, slot, via, flag }) {
  const c = gameCard(row, ctx.rows, ctx.tz, ctx.site);
  c.board = c.board.map((b, i) => {
    if (i === slot && !b.team) return { team, us: true, via, score: b.score, won: b.won, place: b.place };
    if (b.team && norm(b.team) === norm(team)) return { ...b, us: true };
    return b;
  });
  if (flag) c.flag = flag;
  return c;
}

/**
 * Win out from `start`, entering through `enter` ({ result: "W"|"L", n })
 * or already named on its board. `losersSide`: the team has a loss, so a
 * final win only forces the if-necessary game.
 */
function winOut(start, enter, team, ctx, losersSide) {
  const byNum = numberIndex(ctx.rows, start.divisionId);
  const steps = [];
  const seen = new Set();
  let row = start;
  let from = enter;
  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    const slot = from ? slotFedBy(row, from.result, from.n) : -1;
    const via = from ? `${from.result === "W" ? "Winner" : "Loser"} G${from.n}` : null;
    steps.push(stepCard(row, ctx, { team, slot, via }));
    const w = row.flow?.winner;
    if (w?.next && byNum.has(String(w.next))) {
      from = { result: "W", n: num(row.label) };
      row = byNum.get(String(w.next));
      continue;
    }
    const ifN = /(\d+)\s*$/.exec(String(row.flow?.ifGame ?? ""))?.[1];
    // The final: from the winners side a loss forces the if-necessary game
    // and a win is the title; from the losers side a win forces it.
    if (ifN && byNum.has(ifN)) {
      const last = steps[steps.length - 1];
      const to = { next: `Game ${ifN}`, where: whereOf(ctx.rows, row, ifN, ctx.tz) };
      if (losersSide) last.winner = to;
      else last.loser = to;
    }
    if (ifN && losersSide && byNum.has(ifN)) {
      const ifRow = byNum.get(ifN);
      const n = num(row.label);
      steps.push(stepCard(ifRow, ctx, { team, slot: slotFedBy(ifRow, "W", n), via: `Winner G${n}`, flag: `Only played if ${team} wins Game ${n}: from the losers side it takes two wins.` }));
    }
    break;
  }
  return steps;
}

/** "Out, tied for 9th" from the bracket's own words ("Loser → out, tied for 9th"). */
function outWords(x) {
  const w = String(x?.words ?? "").replace(/^Loser\s*→\s*/i, "").trim();
  if (w) return w[0].toUpperCase() + w.slice(1);
  return x?.place ? `Out, ${x.place}` : "Out";
}

const span = (steps) => (steps.length ? [steps[0].time, steps[steps.length - 1].time].filter(Boolean) : []);

/** The routes from the team's next game (or the game it is waiting to play). */
export function teamRoutes(start, team, ctx, { losses = 0 } = {}) {
  if (!start?.flow) return [];
  const losersSide = losses > 0 || start.bracketSide === "losers";
  const first = winOut(start, start.enter ?? null, team, ctx, losersSide);
  const n = num(start.label);
  const routes = [
    { kind: "win", title: losersSide ? "Win out" : "Undefeated route", lead: null, games: first.length, span: span(first), steps: first },
  ];
  const lose = start.flow?.loser;
  const byNum = numberIndex(ctx.rows, start.divisionId);
  if (lose?.next && byNum.has(String(lose.next))) {
    const steps = winOut(byNum.get(String(lose.next)), { result: "L", n }, team, ctx, true);
    routes.push({ kind: "loss", title: `After losing Game ${n}`, lead: `Lose Game ${n}`, games: steps.length, span: span(steps), steps });
  } else if (lose && n) {
    routes.push({ kind: "loss", title: `After losing Game ${n}`, lead: null, games: 0, span: [], steps: [], end: outWords(lose) });
  }
  return routes;
}

/**
 * The game a team waits on when its name is not on the next slot yet: where
 * its last final sends it (Winner/Loser of that game).
 */
export function waitingGame(lastFinal, won, rows) {
  const x = won ? lastFinal?.flow?.winner : lastFinal?.flow?.loser;
  if (!x?.next) return null;
  const row = numberIndex(rows, lastFinal.divisionId).get(String(x.next));
  return row ? { ...row, enter: { result: won ? "W" : "L", n: num(lastFinal.label) } } : null;
}

const TEAM_CSS = String.raw`
.teams { display: grid; gap: 1.25rem; }
.tm { display: grid; gap: 0.625rem; }
.tm-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
.tm-name { font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em; }
.tm-rec { font-size: 0.8125rem; color: var(--label); }
.lbl { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--label); }
.played { list-style: none; display: grid; gap: 0.25rem; font-size: 0.8125rem; }
.played .w { color: var(--win); font-weight: 600; }
.played .l { color: var(--lose); font-weight: 600; }
details.paths { max-width: 54rem; }
details.paths > summary {
  cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 0.375rem;
  min-height: 2.25rem; padding: 0 0.875rem; border-radius: 999px; background: var(--chip);
  font-size: 0.8125rem; font-weight: 600;
}
details.paths > summary::-webkit-details-marker { display: none; }
details.paths > summary::after { content: "\25B8"; font-size: 0.7rem; color: var(--label); }
details.paths[open] > summary::after { content: "\25BE"; }
.routes { display: grid; gap: 1rem; margin-top: 0.75rem; }
@media (min-width: 720px) { .routes.two { grid-template-columns: 1fr 1fr; align-items: start; } }
.route { display: grid; gap: 0; max-width: 26rem; }
.route-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.5rem; margin-bottom: 0.5rem; }
.route-title { font-size: 0.9375rem; font-weight: 700; white-space: nowrap; }
.route-title::before { content: ""; display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 50%; margin-right: 0.375rem; background: var(--win); vertical-align: 0.05em; }
.route.loss .route-title::before { background: var(--lose); }
.route-sub { font-size: 0.75rem; color: var(--label); }
.link { display: flex; align-items: center; gap: 0.375rem; height: 1.625rem; padding-left: 1rem; font-size: 0.75rem; font-weight: 600; }
.link::before { content: ""; width: 2px; height: 100%; background: currentColor; opacity: 0.6; }
.link.win { color: var(--win); }
.link.lose { color: var(--lose); }
.end { font-size: 0.8125rem; color: var(--label); }
`;

const TEAM_JS = String.raw`
  function routeEl(r, team) {
    var box = el("section", "route " + r.kind);
    var head = el("div", "route-head");
    add(head, el("span", "route-title", r.title));
    if (r.games) add(head, el("span", "route-sub", r.games + (r.games === 1 ? " game" : " games") + (r.span.length ? " \u00b7 " + r.span.join(" \u2192 ") : "")));
    box.appendChild(head);
    if (!r.steps.length) { add(box, el("p", "end", r.end || "No games on this route.")); return box; }
    if (r.lead) add(box, el("div", "link lose", r.lead + " \u2193"));
    r.steps.forEach(function (c, i) {
      if (i > 0) add(box, el("div", "link win", "Win " + r.steps[i - 1].title + " \u2193"));
      box.appendChild(compactEl(c));
    });
    return box;
  }
  function teamEl(t, open) {
    var box = el("section", "tm");
    tone(box, t);
    var head = el("div", "tm-head");
    add(head, el("span", "tm-name", t.team), el("span", "tag", t.division), el("span", "tm-rec", t.record + (t.end ? " \u00b7 " + t.end : "")));
    box.appendChild(head);
    if (t.next) {
      add(box, el("div", "lbl", t.waiting ? "Next game (waiting on " + t.waiting + ")" : "Next game"));
      box.appendChild(cardEl(t.next));
    } else if (!t.end) add(box, el("p", "end", "No game on the schedule for this team right now."));
    if (t.played.length) {
      add(box, el("div", "lbl", "Results"));
      var ul = el("ul", "played");
      t.played.forEach(function (p) {
        var li = el("li");
        add(li, el("span", p.result === "Won" ? "w" : p.result === "Lost" ? "l" : null, p.result), document.createTextNode(" " + p.score + " vs " + p.opponent + " \u00b7 " + p.title));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    if (t.routes.length) {
      var d = el("details", "paths");
      if (open) d.open = true;
      add(d, el("summary", null, "Paths to the title"));
      var rs = el("div", "routes" + (t.routes.length > 1 ? " two" : ""));
      t.routes.forEach(function (r) { rs.appendChild(routeEl(r, t.team)); });
      d.appendChild(rs);
      d.addEventListener("toggle", size);
      box.appendChild(d);
    }
    box.appendChild(siteLink(t.url, "Open " + t.division + " bracket \u203a", "foot"));
    return box;
  }
  function render(sc, args) {
    var v = sc.view;
    if (!v || !v.teams || !v.teams.length) return false;
    var open = args.paths === true || (v.teams.length === 1 && v.paths === true);
    var list = el("div", "teams");
    v.teams.forEach(function (t) { list.appendChild(teamEl(t, open)); });
    root.appendChild(list);
  }
`;

export const TEAM_VIEW_HTML = viewHtml({ title: "AFA team", appName: "AFA team path", css: TEAM_CSS, js: TEAM_JS });
