"use client";

// Compact Path stats on the view-tab row (JD, 2026-11-12): min / max
// games left to win, and teams remaining — click for standings of the
// teams that are done. Desktop Path view only, when a team is selected.

import { useEffect, useMemo, useRef, useState } from "react";
import { pathStats } from "@/lib/path-stats";

export default function PathStats({ rows, team, divisions = [] }) {
  const stats = useMemo(() => pathStats(rows, team, divisions), [rows, team, divisions]);
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!stats) return null;

  return (
    <div className="path-stats" ref={root}>
      {stats.eliminated ? (
        <span className="path-stats__out">Eliminated</span>
      ) : stats.champion ? (
        <span className="path-stats__champ">Champion</span>
      ) : stats.min != null ? (
        <>
          <span className="path-stats__item">
            Min <strong>{stats.min}</strong> to win
          </span>
          <span className="path-stats__item">
            Max <strong>{stats.max}</strong>
          </span>
        </>
      ) : null}
      <button
        type="button"
        className="path-stats__teams"
        aria-expanded={open}
        aria-controls="path-stats-done"
        onClick={() => setOpen((v) => !v)}
      >
        {stats.teamsRemaining} team{stats.teamsRemaining === 1 ? "" : "s"} remaining
      </button>
      {open ? (
        <div id="path-stats-done" className="path-stats__pop" role="dialog" aria-label="Standings of teams that are done">
          <p className="path-stats__pop-title">Teams that are done</p>
          {stats.finished.length === 0 ? (
            <p className="path-stats__empty">No teams are out yet.</p>
          ) : (
            <table className="path-stats__table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>W-L</th>
                  <th>RF</th>
                  <th>RA</th>
                </tr>
              </thead>
              <tbody>
                {stats.finished.map((t) => (
                  <tr key={t.team}>
                    <td>
                      {t.team}
                      {t.place ? <span className="path-stats__place">{t.place}</span> : null}
                    </td>
                    <td>{t.record}</td>
                    <td>{t.rf}</td>
                    <td>{t.ra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
