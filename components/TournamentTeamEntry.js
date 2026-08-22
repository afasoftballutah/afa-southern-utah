"use client";

import { useState } from "react";
import Link from "next/link";
import FindTournamentTeam from "@/components/FindTournamentTeam";
import TournamentDivisionNav from "@/components/TournamentDivisionNav";

export default function TournamentTeamEntry({
  slug,
  columns = [],
  teamSummaries = {},
  teams = [],
  registrationOpen = false,
  registerHref = "/register",
  externalRegisterUrl = null,
  finished = false,
}) {
  const [team, setTeam] = useState("");
  const [panel, setPanel] = useState(null);

  const registering = panel === "register";
  const showGrid = columns.length > 0;

  return (
    <div className="space-y-4">
      <FindTournamentTeam
        slug={slug}
        teams={teams}
        selectedTeam={team}
        onTeam={setTeam}
        registrationOpen={registrationOpen}
        externalRegisterUrl={externalRegisterUrl}
        panel={panel}
        onPanel={setPanel}
      />
      {showGrid ? (
        <div id="tournament-divisions" className="space-y-3">
          <div className="text-center">
            <h2 className="t-heading">
              {registering ? "Register" : finished ? "Results" : "Divisions"}
            </h2>
            <p className="t-meta">
              {registering
                ? "Pick a division"
                : "Open your division for the bracket and games"}
            </p>
          </div>
          <TournamentDivisionNav
            slug={slug}
            columns={columns}
            teamSummaries={teamSummaries}
            selectedTeam={team}
            hideTeamPicker
            mode={registering ? "register" : "schedule"}
          />
          {!registering ? (
            <p className="text-center">
              <Link
                href={`/tournaments/${slug}/schedule`}
                className="t-meta underline"
              >
                All games
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
