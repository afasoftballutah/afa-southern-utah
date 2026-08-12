"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { divisionLevelLabel } from "@/lib/division-layout";
import { readMe, writeMe } from "@/lib/me";

/**
 * Women's / Men's / Coed columns. Highlights every division this device's
 * team appears in — Coed plus Men's or Women's when they play both.
 */
export default function TournamentDivisionNav({
  slug,
  columns = [],
  teamSummaries = {},
}) {
  const [team, setTeam] = useState("");

  useEffect(() => {
    let picked = "";
    try {
      picked = window.localStorage.getItem(`afa-team-${slug}`) || "";
    } catch {
      picked = "";
    }
    if (picked && teamSummaries[picked]) {
      setTeam(picked);
      return;
    }
    const me = readMe();
    if (me?.teamName && teamSummaries[me.teamName]) {
      setTeam(me.teamName);
    }
  }, [slug, teamSummaries]);

  const mine = useMemo(() => {
    const ids = new Set();
    if (!team) return ids;
    const row = teamSummaries[team];
    if (!row) return ids;
    for (const id of row.divisionIds ?? []) ids.add(id);
    if (row.divisionId) ids.add(row.divisionId);
    return ids;
  }, [team, teamSummaries]);

  const hasMine = mine.size > 0;
  const teams = Object.keys(teamSummaries).sort((a, b) => a.localeCompare(b));

  function pick(value) {
    setTeam(value);
    try {
      if (value) {
        window.localStorage.setItem(`afa-team-${slug}`, value);
        writeMe({ teamName: value, source: "picked" });
      } else {
        window.localStorage.removeItem(`afa-team-${slug}`);
      }
    } catch {
      /* private browsing */
    }
  }

  return (
    <div className="space-y-3">
      {teams.length > 0 && (
        <label className="flex flex-wrap items-center justify-center gap-2">
          <span className="t-meta">Your team</span>
          <select
            className="form-field max-w-[16rem]"
            value={team}
            onChange={(e) => pick(e.target.value)}
            aria-label="Find your team"
          >
            <option value="">Find your team</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        className={
          "register-division-cols" + (hasMine ? " has-mine" : "")
        }
        role="navigation"
        aria-label="Divisions"
      >
        {columns.map((col) => {
          const colMine = col.items.some((d) => mine.has(d.id));
          return (
            <div
              key={col.key}
              className={"register-division-col register-division-col--" + col.key}
            >
              {col.genderOnly ? (
                <Link
                  href={`/tournaments/${slug}/division/${col.items[0].id}`}
                  className={
                    "register-division-col__card register-division-col__card--header" +
                    (mine.has(col.items[0].id) ? " is-mine" : "")
                  }
                >
                  {col.label}
                </Link>
              ) : (
                <>
                  <span
                    className={
                      "register-division-col__card register-division-col__card--header" +
                      (colMine ? " is-mine" : "")
                    }
                  >
                    {col.label}
                  </span>
                  {col.items.map((d) => (
                    <Link
                      key={d.id}
                      href={`/tournaments/${slug}/division/${d.id}`}
                      className={
                        "register-division-col__card" +
                        (mine.has(d.id) ? " is-mine" : "")
                      }
                    >
                      {divisionLevelLabel(d)}
                    </Link>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
