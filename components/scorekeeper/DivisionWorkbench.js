"use client";

import { useState } from "react";
import Link from "next/link";
import DirectorTable from "./DirectorTable";
import RegistrationCard from "./RegistrationCard";
import DivisionMinimums from "./DivisionMinimums";

// The divisions of one tournament, and whatever you are doing with one.
//
// JD, 2026-07-27: "Each division should be a list item. then the bottom
// section shows what we are doing with that division. So, actions on the row.
// Show teams, Create Matchups, Input Scores."
//
// Pick a division and an action on its row; the panel underneath becomes that
// thing. The list stays on screen, so you never lose your place in it.
//
// "TO SCORE" IS GONE. It meant "games not yet final", which nobody could have
// guessed. Scores now read X/Y the same way Teams does — entered out of
// total — because a director already reads every other number here that way.

const COLUMNS = [
  { key: "division", label: "Division" },
  { key: "gender", label: "Gender", width: "7rem" },
  { key: "class", label: "Class", align: "center", width: "5rem" },
  { key: "teams", label: "Teams", align: "right", width: "6rem" },
  { key: "scores", label: "Scores", align: "right", width: "6rem" },
  { key: "actions", label: "", align: "right", width: "22rem" },
];

export default function DivisionWorkbench({ divisions, registrations, classes }) {
  const [panel, setPanel] = useState(null); // { divisionId, action }

  const open = (divisionId, action) =>
    setPanel((cur) =>
      cur && cur.divisionId === divisionId && cur.action === action ? null : { divisionId, action }
    );

  const isOn = (d, action) => panel?.divisionId === d.id && panel?.action === action;

  const rows = divisions.map((d) => ({
    key: d.id,
    search: `${d.name} ${d.genderLabel ?? ""} ${d.className ?? ""}`,
    sortValues: { division: d.sortOrder, teams: d.teams, scores: d.gamesTotal },
    cells: {
      division: d.name,
      gender: d.genderLabel ?? "—",
      class: d.className ?? "—",
      // X/max. Uncapped divisions borrow whichever is larger, the minimum
      // needed to run or the teams already in — so the denominator is never
      // smaller than the numerator.
      teams: `${d.teams}/${d.teamsMax}`,
      scores: d.gamesTotal === 0 ? "—" : `${d.gamesTotal - d.unplayed}/${d.gamesTotal}`,
      actions: (
        <span className="flex justify-end gap-2">
          <button
            type="button"
            className={"pill" + (isOn(d, "teams") ? " bg-afa-navy text-white border-afa-navy" : "")}
            onClick={() => open(d.id, "teams")}
          >
            Show teams
          </button>
          <button
            type="button"
            className={"pill" + (isOn(d, "setup") ? " bg-afa-navy text-white border-afa-navy" : "")}
            onClick={() => open(d.id, "setup")}
          >
            Create matchups
          </button>
          <Link className="pill" href={`/scorekeeper/division/${d.id}`}>
            Input scores
          </Link>
        </span>
      ),
    },
  }));

  const chosen = divisions.find((d) => d.id === panel?.divisionId);
  const forDivision = registrations.filter((r) => r.division_id === panel?.divisionId);

  return (
    <div className="space-y-3">
      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        defaultSort={{ key: "division", dir: "asc" }}
        empty="No divisions yet. Add one below."
        searchPlaceholder="Find a division…"
      />

      {chosen && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="t-heading">
              {chosen.name} — {panel.action === "teams" ? "teams" : "matchups"}
            </h2>
            <button type="button" className="pill" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>

          {panel.action === "teams" && (
            <>
              <Link href="/scorekeeper/registrations/new" className="pill">
                Add a team yourself
              </Link>
              {forDivision.length === 0 ? (
                <div className="card p-6 text-center">
                  <p className="t-meta">Nobody has registered for {chosen.name} yet.</p>
                </div>
              ) : (
                forDivision.map((r) => (
                  <RegistrationCard key={r.id} registration={r} classes={classes} />
                ))
              )}
            </>
          )}

          {panel.action === "setup" && (
            <div className="card p-4 space-y-3">
              {chosen.genderLabel === "Coed" && (
                <div>
                  <p className="t-label mb-2">Roster must have at least</p>
                  <DivisionMinimums
                    divisionId={chosen.id}
                    minMen={chosen.minMen}
                    minWomen={chosen.minWomen}
                  />
                </div>
              )}
              <p className="t-body">
                {chosen.teams} {chosen.teams === 1 ? "team is" : "teams are"} in {chosen.name}.
                {chosen.teams < chosen.minTeams &&
                  ` It takes ${chosen.minTeams} to run this division.`}
              </p>
              <Link href={`/scorekeeper/division/${chosen.id}`} className="btn">
                Open {chosen.name} to build pools and brackets
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
