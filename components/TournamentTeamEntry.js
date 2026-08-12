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
  const [registering, setRegistering] = useState(false);

  function showRegister() {
    setRegistering(true);
    requestAnimationFrame(() => {
      document.getElementById("tournament-divisions")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <div className="space-y-4">
      <FindTournamentTeam
        slug={slug}
        teams={teams}
        selectedTeam={team}
        onTeam={setTeam}
        registrationOpen={registrationOpen}
        registerHref={registerHref}
        externalRegisterUrl={externalRegisterUrl}
        registering={registering}
        onRegister={showRegister}
      />
      {columns.length > 0 ? (
        <div id="tournament-divisions" className="space-y-3">
          <div className="text-center">
            <h2 className="t-heading">
              {registering ? "Register" : finished ? "Results" : "Divisions"}
            </h2>
            <p className="t-meta">
              {registering
                ? "Pick a division"
                : finished
                  ? "Schedule and results"
                  : "Schedule and tournament updates"}
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
        </div>
      ) : null}
    </div>
  );
}
