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
import { GRID_CSS, GRID_JS } from "./grid-view";

export const TEAM_VIEW_URI = "ui://afa/team";

export { waitingGame } from "./field-grid";

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
${GRID_CSS}
button.fg-more {
  justify-self: start; font: inherit; font-size: 0.8125rem; font-weight: 600; color: var(--link); background: var(--chip);
  border: 0; border-radius: 999px; min-height: 2.25rem; padding: 0 0.875rem; cursor: pointer;
}
.played { list-style: none; display: grid; gap: 0.25rem; font-size: 0.8125rem; }
.played .w { color: var(--win); font-weight: 600; }
.played .l { color: var(--lose); font-weight: 600; }
`;

const TEAM_JS = String.raw`
${GRID_JS}

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
      bar.appendChild(sel);
      out.appendChild(bar);
      out.appendChild(keyEl(t.grid));
      var holder = el("div");
      out.appendChild(holder);
      var current = null;
      function show() {
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
  function render(sc, args) {
    var v = sc.view;
    if (!v || !v.teams || !v.teams.length) return false;
    var list = el("div", "teams");
    v.teams.forEach(function (t) { list.appendChild(teamEl(t)); });
    root.appendChild(list);
  }
`;

export const TEAM_VIEW_HTML = viewHtml({ title: "AFA team", appName: "AFA team path", css: TEAM_CSS, js: TEAM_JS });
