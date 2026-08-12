"use client";

import { useState } from "react";
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

  const showGrid =
    panel === "register" || (finished && panel !== "find" && columns.length > 0);

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
              {panel === "register" ? "Register" : "Results"}
            </h2>
            <p className="t-meta">
              {panel === "register" ? "Pick a division" : "Schedule and results"}
            </p>
          </div>
          <TournamentDivisionNav
            slug={slug}
            columns={columns}
            teamSummaries={teamSummaries}
            selectedTeam={team}
            hideTeamPicker
            mode={panel === "register" ? "register" : "schedule"}
          />
        </div>
      ) : null}
    </div>
  );
}
