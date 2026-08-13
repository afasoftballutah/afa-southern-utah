"use client";

import { useState } from "react";
import Link from "next/link";
import TournamentEditor from "./TournamentEditor";
import TournamentUmpires from "./TournamentUmpires";
import DivisionWorkbench from "./DivisionWorkbench";
import TeamTable from "./TeamTable";

const DOORS = [
  { key: "event", label: "Event" },
  { key: "teams", label: "Teams" },
  { key: "divisions", label: "Divisions" },
  { key: "umps", label: "Umpires" },
];

/**
 * Click the tournament, read the tournament. Other doors are jobs.
 */
export default function TournamentDesk({
  tournament,
  venues = [],
  umpireRoster = [],
  crew = [],
  workbench,
  registrations = [],
  classes = [],
  divisions = [],
  publicHref = null,
}) {
  const [door, setDoor] = useState("event");
  const live = registrations.filter((r) => r.status !== "withdrawn");

  return (
    <div className="space-y-3">
      <div className="seg-view" role="tablist" aria-label="This tournament">
        {DOORS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={door === d.key}
            className={door === d.key ? "btn-info" : "btn-transient"}
            onClick={() => setDoor(d.key)}
          >
            {d.label}
            {d.key === "teams" ? (
              <span className="ml-1 opacity-80">{live.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {door === "teams" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/director/registrations/new?tournament=${encodeURIComponent(tournament.id)}`}
              className="pill"
            >
              Add Team
            </Link>
            {publicHref ? (
              <Link href={publicHref} className="t-meta underline">
                Public page
              </Link>
            ) : null}
          </div>
          {live.length === 0 ? (
            <p className="t-meta">Nobody has registered for this event yet.</p>
          ) : (
            <TeamTable
              registrations={registrations}
              classes={classes}
              divisions={divisions}
              layout="tournament"
              editClass={false}
            />
          )}
        </div>
      ) : null}

      {door === "divisions" ? workbench : null}

      {door === "event" ? (
        <TournamentEditor tournament={tournament} venues={venues} />
      ) : null}

      {door === "umps" ? (
        <TournamentUmpires
          tournamentId={tournament.id}
          tournamentName={tournament.name}
          dayStartTime={tournament.day_start_time ?? null}
          roster={umpireRoster}
          initial={crew}
        />
      ) : null}
    </div>
  );
}
