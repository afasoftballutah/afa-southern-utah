"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { divisionLevelLabel } from "@/lib/division-layout";
import { readMe, writeMe } from "@/lib/me";

function cardHref({ slug, divisionId, mode, externalRegisterUrl }) {
  if (mode === "register") {
    if (externalRegisterUrl) return externalRegisterUrl;
    const q = new URLSearchParams({
      tournament: slug,
      division: divisionId,
    });
    return `/register?${q.toString()}`;
  }
  return `/tournaments/${slug}/division/${divisionId}`;
}

function CardLink({ href, className, children, external }) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Women's / Men's / Coed columns.
 * Register mode: each card starts signup for that seat.
 * Schedule mode: each card opens that division, and highlights every
 * division this device's team plays (Coed plus Men's or Women's).
 */
export default function TournamentDivisionNav({
  slug,
  columns = [],
  teamSummaries = {},
  mode = "schedule",
  externalRegisterUrl = null,
  selectedTeam = "",
  hideTeamPicker = false,
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

  const activeTeam = hideTeamPicker ? selectedTeam || "" : selectedTeam || team;

  const mine = useMemo(() => {
    const ids = new Set();
    if (!activeTeam) return ids;
    const row = teamSummaries[activeTeam];
    if (!row) return ids;
    for (const id of row.divisionIds ?? []) ids.add(id);
    if (row.divisionId) ids.add(row.divisionId);
    return ids;
  }, [activeTeam, teamSummaries]);

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

  const registering = mode === "register";
  const external = registering && Boolean(externalRegisterUrl);

  return (
    <div className="space-y-3">
      {!registering && !hideTeamPicker && teams.length > 0 && (
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
          "register-division-cols" + (!registering && hasMine ? " has-mine" : "")
        }
        role="navigation"
        aria-label={registering ? "Register for a division" : "Divisions"}
      >
        {columns.map((col) => {
          const colMine = !registering && col.items.some((d) => mine.has(d.id));
          return (
            <div
              key={col.key}
              className={"register-division-col register-division-col--" + col.key}
            >
              {col.genderOnly ? (
                <CardLink
                  href={cardHref({
                    slug,
                    divisionId: col.items[0].id,
                    mode,
                    externalRegisterUrl,
                  })}
                  external={external}
                  className={
                    "register-division-col__card register-division-col__card--header" +
                    (!registering && mine.has(col.items[0].id) ? " is-mine" : "")
                  }
                >
                  {col.label}
                </CardLink>
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
                    <CardLink
                      key={d.id}
                      href={cardHref({
                        slug,
                        divisionId: d.id,
                        mode,
                        externalRegisterUrl,
                      })}
                      external={external}
                      className={
                        "register-division-col__card" +
                        (!registering && mine.has(d.id) ? " is-mine" : "")
                      }
                    >
                      {divisionLevelLabel(d)}
                    </CardLink>
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
