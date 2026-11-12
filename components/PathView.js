"use client";

// Path view (JD 2026-11-10: "a different view like the claude view"): the
// MCP team view's field grid (ui://afa/team) as a Schedule tab. Every game
// of the tournament on one grid of fields × time (phone: fields across,
// time down; desktop: time across), each box the site's timeline pill in
// its division colour. The team picked in Find your team lights every game
// it can still play: green win arrows, red dashed loss arrows, its finish
// under each game where a loss ends its run, a leg gone bold only once the
// game it leaves has a score (the route actually taken), everything else faded. With no team picked the grid is unlit.
//
// Time-aware without polling: the grid is drawn from the page's rows at the
// moment it mounts (RefreshOnReturn brings fresh rows back). A game is done
// only once it has a score; past its start with none it reads In progress
// for an hour, then Awaiting score, and its paths stay open. An opening run
// of all-scored hours folds into one thin band; tap it to open it. Tap any
// game for its card: teams, score, where the winner and loser go.
//
// The drawing code is the MCP view's own (lib/mcp/grid-view.js), run in a
// shadow root so its styles and the site's never touch.

import { useEffect, useMemo, useRef } from "react";
import { CSS as CARD_CSS, CARD_JS } from "@/lib/mcp/views";
import { GRID_CSS, siteGridRunner } from "@/lib/mcp/grid-view";
import { fieldGrid, gridTrack } from "@/lib/mcp/field-grid";
import { divisionFamily } from "@/lib/team-feed";

let runner = null;
function gridRunner() {
  if (!runner) runner = siteGridRunner(CARD_JS);
  return runner;
}

// The MCP view's CSS, scoped to the shadow root; the site has no dark mode.
const SHADOW_CSS = `${CARD_CSS.replace(/:root\.dark[^{]*\{[^}]*\}/g, "").replace(/:root/g, ":host")}${GRID_CSS.replace(/:root\.dark[^{]*\{[^}]*\}/g, "")}
:host { display: block; min-width: 0; max-width: 100%; font-family: inherit; color: var(--ink); --font: inherit; }
.pv { display: grid; gap: 0.625rem; min-width: 0; width: 100%; }`;


export default function PathView({ rows, timeZone, zoneShort = "", slug, team = null, divisions = [] }) {
  const hostRef = useRef(null);
  const rootRef = useRef(null);
  const family = useMemo(
    () => (team?.name ? divisionFamily(divisions, team.divisionId) ?? new Set([team.divisionId]) : null),
    [team, divisions]
  );
  // The grid: drawn as of the moment the view mounts (or the rows or team
  // change), never polled.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const { grid, index } = fieldGrid(rows, timeZone, new Date(), { siteUrl: "", slug });
    grid.zone = zoneShort || null;
    let t = { grid, picker: [] };
    let picked = null;
    if (family) {
      const tr = gridTrack(rows, team.name, family, null, index);
      const mine = new Set([...tr.played, ...tr.reach]);
      const days = grid.days.filter((d) => d.games.some((g) => mine.has(g.i)));
      t = { grid: { ...grid, days: days.length ? days : grid.days }, picker: [{ name: team.name, ...tr }] };
      picked = team.name;
    }
    if (!rootRef.current) {
      rootRef.current = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = SHADOW_CSS;
      rootRef.current.appendChild(style);
    }
    const shadow = rootRef.current;
    const { gridEl } = gridRunner();
    let vertical = null;
    let lastW = 0;
    function draw() {
      const w = host.clientWidth || window.innerWidth;
      vertical = w < 640;
      lastW = w;
      shadow.querySelector(".pv")?.remove();
      const wrap = document.createElement("div");
      wrap.className = "pv";
      // The key (Win / Loss / Times) sits in the grid's sticky head, on
      // the same row as the team / division / record.
      wrap.appendChild(gridEl(t, picked, host));
      shadow.appendChild(wrap);
    }
    draw();
    // Phone ↔ desktop orientation, and desktop width changes so hour
    // columns can stretch to the new size.
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth || window.innerWidth;
      if (w < 640 !== vertical || w !== lastW) draw();
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [rows, timeZone, zoneShort, slug, team, family]);

  // The team line and the Win / Loss / Times key ride in the grid's sticky head.
  return <section className="path-view" aria-label="Path view" ref={hostRef} />;
}
