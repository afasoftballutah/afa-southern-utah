"use client";

import { useState } from "react";
import Link from "next/link";
import DirectorTable from "./DirectorTable";
import TeamTable from "./TeamTable";
import InlineNumber from "./InlineNumber";
import DivisionPlayDay from "./DivisionPlayDay";
import TournamentPlayDays from "./TournamentPlayDays";
import ConfirmDialog from "./ConfirmDialog";

// The divisions of one tournament, and whatever you are doing with one.
//
// JD, 2026-07-27: "Each division should be a list item. then the bottom
// section shows what we are doing with that division. So, actions on the row.
// Show teams, Create Matchups, Input Scores."
//
// Pick a division and an action on its row; the panel underneath becomes that
// thing. The list stays on screen, so you never lose your place in it.
//
// JD, 2026-07-27: "the Divisions row is kind of weird. since it just combines
// two columns listed next. and what is 'Scores'?"
//
// Both right. Division WAS Gender and Class glued together and then printed
// beside them, so the same fact appeared three times in a row. "Coed D" is
// what a director says out loud, so that is the one that stays.
//
// And "Scores" never said what it counted. Games is how many exist; Scored is
// how many have a final score. Two plain numbers beat one slash nobody can
// read the meaning of.
// JD, 2026-07-27: "combine the two teams columns. then just have a Matchups
// and Scores column with the numbers on all the buttons."
//
// The count and the button that opens it were two columns saying one thing.
// The number now rides on the control it belongs to, so a row is the bracket
// and the three things you can do to it, each already telling you where it
// stands.
const COLUMNS = [
  { key: "division", label: "Division" },
  {
    key: "playDay",
    label: "Play day",
    width: "10.5rem",
  },
  // How many men and women a roster needs here. Men's is 10/0, Women's 0/10,
  // Coed whatever its split is — the numbers the eligibility pill checks a
  // roster against, where a director can see them.
  { key: "minMen", label: "M", group: "Minimum", align: "center", width: "3rem" },
  { key: "minWomen", label: "W", group: "Minimum", align: "center", width: "3rem" },
  { key: "teams", label: "Teams", align: "center", width: "12rem" },
  { key: "matchups", label: "Matchups", align: "center", width: "12rem" },
  { key: "scores", label: "Scores", align: "center", width: "12rem" },
];

// A button and how far that step has got. Three states, because "started" and
// "not started" are different problems for a director and both were reading
// as an empty box (JD, 2026-07-27: "maybe show a yellow tag when they are
// partials... in the checkbox").
//
//   ☐ grey   nothing yet
//   ◪ amber  under way
//   ☑ green  done
//
// Same glyph family as the waiver column, so done looks the same everywhere.
const MARK = {
  none: { glyph: "☐", tone: "text-afa-muted/50" },
  partial: { glyph: "◪", tone: "text-afa-part" },
  done: { glyph: "☑", tone: "text-afa-go" },
};

function Step({ state, children }) {
  const m = MARK[state] ?? MARK.none;
  return (
    <span className="inline-flex items-center gap-2">
      {children}
      <span className={"tick " + m.tone}>{m.glyph}</span>
    </span>
  );
}

export default function DivisionWorkbench({
  divisions,
  registrations,
  classes,
  setup,
  tournamentId = null,
  tournamentStart = null,
  tournamentEnd = null,
}) {
  const divisionOptions = divisions.map((d) => ({ id: d.id, label: d.label }));
  // Keyed on division AND class, because a tournament that runs Coed D and
  // Coed E has two brackets and one division row would hide one of them.
  const [panel, setPanel] = useState(null); // { key, action }

  const open = (key, action) =>
    setPanel((cur) => (cur && cur.key === key && cur.action === action ? null : { key, action }));

  const isOn = (d, action) => panel?.key === d.key && panel?.action === action;

  const minDate = tournamentStart
    ? String(tournamentStart).slice(0, 10)
    : null;
  const maxDate = tournamentEnd
    ? String(tournamentEnd).slice(0, 10)
    : minDate;

  const rows = divisions.map((d) => ({
    key: d.key,
    search: `${d.label} ${d.genderLabel ?? ""} ${d.className ?? ""} ${d.dayDate ?? ""}`,
    sortValues: {
      division: d.sortKey,
      playDay: d.dayDate ?? "",
      minMen: d.minMen ?? -1,
      minWomen: d.minWomen ?? -1,
      teams: d.teams,
      matchups: d.gamesTotal,
      scores: d.gamesTotal - d.unplayed,
    },
    panel: panel?.key === d.key ? (
      <Panel
        key={`panel-${d.key}`}
        division={d}
        registrations={registrations}
        classes={classes}
        divisionOptions={divisionOptions}
      />
    ) : null,
    cells: {
      division: d.label,
      playDay: d.parentDivisionId ? (
        <span className="t-meta text-[12px]">
          {d.dayLabel || d.dayDate || "—"}
        </span>
      ) : (
        <DivisionPlayDay
          divisionId={d.id}
          label={d.label}
          dayDate={d.dayDate}
          minDate={minDate}
          maxDate={maxDate}
        />
      ),
      minMen: (
        <InlineNumber
          key={`minMen-${d.key}`}
          label="Men"
          subject={d.label}
          value={d.minMen}
          action="setDivisionMinimums"
          valueKey="minMen"
          payload={{ divisionId: d.id, minWomen: d.minWomen ?? null }}
        />
      ),
      minWomen: (
        <InlineNumber
          key={`minWomen-${d.key}`}
          label="Women"
          subject={d.label}
          value={d.minWomen}
          action="setDivisionMinimums"
          valueKey="minWomen"
          payload={{ divisionId: d.id, minMen: d.minMen ?? null }}
        />
      ),
      teams: (
        <Step
          key={`teams-${d.key}`}
          state={d.teams >= d.teamsMax ? "done" : d.teams > 0 ? "partial" : "none"}
        >
          <button
            type="button"
            className={"pill" + (isOn(d, "teams") ? " ring-2 ring-afa-navy/30" : "")}
            onClick={() => open(d.key, "teams")}
          >
            Teams {d.teams}/{d.teamsMax}
          </button>
        </Step>
      ),
      matchups: (
        <Step key={`matchups-${d.key}`} state={d.gamesTotal > 0 ? "done" : "none"}>
          <MatchupsButton division={d} />
        </Step>
      ),
      scores: (
        <Step
          key={`scores-${d.key}`}
          state={
            d.gamesTotal === 0
              ? "none"
              : d.unplayed === 0
                ? "done"
                : d.unplayed < d.gamesTotal
                  ? "partial"
                  : "none"
          }
        >
          <Link className="pill" href={`/director/division/${d.id}`}>
            Scores{d.gamesTotal > 0 ? ` ${d.gamesTotal - d.unplayed}/${d.gamesTotal}` : ""}
          </Link>
        </Step>
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

  const playDaysBar =
    tournamentId && divisions.length > 0 ? (
      <TournamentPlayDays
        tournamentId={tournamentId}
        startDate={tournamentStart}
        endDate={tournamentEnd}
        divisions={divisions.map((d) => ({
          id: d.id,
          gender: d.gender ?? null,
          dayDate: d.dayDate ?? null,
          label: d.label,
          parentDivisionId: d.parentDivisionId ?? null,
        }))}
      />
    ) : null;

  return (
    <DirectorTable
      before={
        <>
          {setup}
          {playDaysBar}
        </>
      }
      columns={COLUMNS}
      rows={rows}
      defaultSort={{ key: "division", dir: "asc" }}
      empty="No divisions yet. Add one below."
      search={false}
      width="max-w-3xl"
    />
  );
}

// What opens under a division's row. JD, 2026-07-27: "I think it only works
// if part of the accordion" — a panel below the table left the list intact but
// disconnected from the row that opened it, and collapsing the list to hide
// that just traded one problem for another.
function MatchupsButton({ division: d }) {
  const [ask, setAsk] = useState(false);
  const href = `/director/division/${d.id}`;
  const need = d.minTeams ?? 6;
  const short = d.gamesTotal === 0 && d.teams < need;

  function go() {
    window.location.href = href;
  }

  return (
    <>
      <button
        type="button"
        className="pill"
        onClick={() => (short ? setAsk(true) : go())}
      >
        Matchups{d.gamesTotal > 0 ? ` ${d.gamesTotal}` : ""}
      </button>
      {ask ? (
        <ConfirmDialog
          title={`Build ${d.label}`}
          message={`${d.label} has ${
            d.teams === 0 ? "no teams" : d.teams === 1 ? "1 team" : `${d.teams} teams`
          }. It takes ${need}.`}
          confirmLabel="Build anyway"
          onConfirm={go}
          onCancel={() => setAsk(false)}
        />
      ) : null}
    </>
  );
}

function Panel({ division: d, registrations, classes, divisionOptions }) {
  const forDivision = registrations.filter((r) => r.division_id === d.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/director/registrations/new?tournament=${encodeURIComponent(d.tournamentId)}&division=${encodeURIComponent(d.id)}`}
          className="pill"
        >
          Add Team
        </Link>
      </div>
      {forDivision.length === 0 ? (
        <p className="t-meta">Nobody has registered for {d.label} yet.</p>
      ) : (
        <TeamTable
          registrations={forDivision}
          classes={classes}
          divisions={divisionOptions}
          divisionHasClass={d.classId != null}
          editClass={false}
        />
      )}
    </div>
  );
}


