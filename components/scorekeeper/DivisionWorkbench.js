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
  // Keyed on division AND class, because a tournament that runs Coed D and
  // Coed E has two brackets and one division row would hide one of them.
  const [panel, setPanel] = useState(null); // { key, action }

  const open = (key, action) =>
    setPanel((cur) => (cur && cur.key === key && cur.action === action ? null : { key, action }));

  const isOn = (d, action) => panel?.key === d.key && panel?.action === action;

  const rows = divisions.map((d) => ({
    key: d.key,
    search: `${d.label} ${d.genderLabel ?? ""} ${d.className ?? ""}`,
    sortValues: { division: d.sortKey, teams: d.teams, scores: d.gamesTotal },
    cells: {
      division: d.label,
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
            className={"pill pill-solid" + (isOn(d, "teams") ? " ring-2 ring-afa-navy/30" : "")}
            onClick={() => open(d.key, "teams")}
          >
            Teams
          </button>
          <button
            type="button"
            className={"pill pill-solid" + (isOn(d, "setup") ? " ring-2 ring-afa-navy/30" : "")}
            onClick={() => open(d.key, "setup")}
          >
            Matchups
          </button>
          <Link className="pill pill-solid" href={`/scorekeeper/division/${d.id}`}>
            Scores
          </Link>
        </span>
      ),
    },
  }));

  const chosen = divisions.find((d) => d.key === panel?.key);
  // The teams in THIS bracket: same division, and same class when the row is
  // a class row.
  const forDivision = registrations.filter(
    (r) =>
      chosen &&
      r.division_id === chosen.id &&
      (chosen.classId == null || r.class_id === chosen.classId)
  );

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
              {chosen.label} — {panel.action === "teams" ? "teams" : "matchups"}
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
                  <p className="t-meta">Nobody has registered for {chosen.label} yet.</p>
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
                {chosen.teams} {chosen.teams === 1 ? "team is" : "teams are"} in {chosen.label}.
                {chosen.teams < chosen.minTeams &&
                  ` It takes ${chosen.minTeams} to run this division.`}
              </p>
              <Link href={`/scorekeeper/division/${chosen.id}`} className="btn">
                Open {chosen.label} to build pools and brackets
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
