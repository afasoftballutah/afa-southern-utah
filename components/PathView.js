"use client";

// Path view (JD 2026-11-10: "a different view like the claude view"): the
// MCP team view's field grid (ui://afa/team) as a Schedule tab. Every game
// of the tournament on one grid of fields × time (phone: fields across,
// time down; desktop: time across), each box the site's timeline pill in
// its division colour. The team picked in Find your team lights every game
// it can still play: green win arrows, red dashed loss arrows, its finish
// under each game where a loss ends its run, its games so far joined solid,
// everything else faded. With no team picked the grid is unlit.
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
:host { display: block; font-family: inherit; color: var(--ink); --font: inherit; }
.pv { display: grid; gap: 0.625rem; }`;

const norm = (s) => String(s ?? "").trim().toLowerCase();

export default function PathView({ rows, timeZone, zoneShort = "", slug, team = null, divisions = [] }) {
  const hostRef = useRef(null);
  const rootRef = useRef(null);
  const family = useMemo(
    () => (team?.name ? divisionFamily(divisions, team.divisionId) ?? new Set([team.divisionId]) : null),
    [team, divisions]
  );
  // The summary line: record and games still possible do not depend on
  // the clock, so they render on the server too.
  const track = useMemo(() => {
    if (!family) return null;
    const { index } = fieldGrid(rows, timeZone, new Date(0), { siteUrl: "", slug });
    return gridTrack(rows, team.name, family, null, index);
  }, [rows, timeZone, slug, team, family]);

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
    const { gridEl, keyEl } = gridRunner();
    let vertical = null;
    function draw() {
      vertical = (host.clientWidth || window.innerWidth) < 640;
      shadow.querySelector(".pv")?.remove();
      const wrap = document.createElement("div");
      wrap.className = "pv";
      const key = keyEl(t.grid);
      // League (Mountain) time carries no label; Worlds says PST.
      if (!t.grid.zone) key.lastChild?.remove();
      wrap.appendChild(key);
      wrap.appendChild(gridEl(t, picked, host));
      shadow.appendChild(wrap);
    }
    draw();
    // Phone ↔ desktop orientation when the width crosses the breakpoint.
    const ro = new ResizeObserver(() => {
      if ((host.clientWidth || window.innerWidth) < 640 !== vertical) draw();
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [rows, timeZone, zoneShort, slug, team, family]);

  const division = team?.divisionName ?? rows.find((r) => r.divisionId === team?.divisionId)?.divisionName ?? null;
  return (
    <section className="path-view space-y-2" aria-label="Path view">
      <p className="text-sm text-afa-ink/70">
        {team?.name ? (
          <>
            <span className="font-semibold text-afa-ink">{team.name}</span>
            {division ? ` · ${division}` : ""}
            {track ? ` · ${track.record} · ${track.reach.length ? `${track.reach.length} games still possible` : "no games left"}` : ""}
          </>
        ) : (
          "Pick your team above to light every game it could still play."
        )}
      </p>
      <div ref={hostRef} data-team={team?.name ? norm(team.name) : undefined} />
    </section>
  );
}
