"use client";

// Path view (JD 2026-11-10: "a different view like the claude view").
// Phones keep the MCP field grid (lib/mcp/grid-view.js) in a shadow root.
// Desktop Path is the Timeline grid exactly as drawn — same days, fields,
// hours, spacing and card positions — with games the followed team is
// not in and cannot reach left empty, and the win/loss path overlaid
// (JD, 2026-11-12). Reachable is the same played + reach set the phone
// Path already shows.

import { useEffect, useMemo, useRef, useState } from "react";
import { CSS as CARD_CSS, CARD_JS } from "@/lib/mcp/views";
import { GRID_CSS, siteGridRunner } from "@/lib/mcp/grid-view";
import { fieldGrid, gridTrack } from "@/lib/mcp/field-grid";
import { divisionFamily } from "@/lib/team-feed";
import ScheduleTimeline, { PHONE_VERTICAL_QUERY } from "@/components/ScheduleTimeline";

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
  const [phone, setPhone] = useState(true);
  const family = useMemo(
    () => (team?.name ? divisionFamily(divisions, team.divisionId) ?? new Set([team.divisionId]) : null),
    [team, divisions]
  );

  useEffect(() => {
    const mq = window.matchMedia(PHONE_VERTICAL_QUERY);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Phone Path: the MCP grid, drawn as of the moment the view mounts (or
  // the rows or team change), never polled.
  useEffect(() => {
    if (!phone) return undefined;
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
      wrap.appendChild(gridEl(t, picked, host));
      shadow.appendChild(wrap);
    }
    draw();
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth || window.innerWidth;
      if (w < 640 !== vertical || w !== lastW) draw();
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [phone, rows, timeZone, zoneShort, slug, team, family]);

  if (!phone) {
    return (
      <section className="path-view" aria-label="Path view">
        <ScheduleTimeline
          rows={rows}
          timeZone={timeZone}
          zoneShort={zoneShort}
          slug={slug}
          team={team}
          pathMode
          divisions={divisions}
        />
      </section>
    );
  }

  // Shadow root lives on an inner node so a desktop remount cannot leave
  // an unslotted shadow on the section (which would hide the Timeline).
  return (
    <section className="path-view" aria-label="Path view">
      <div ref={hostRef} />
    </section>
  );
}
