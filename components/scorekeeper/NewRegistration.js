"use client";

import { useMemo, useState } from "react";
import RoomShell, { RoomField, RoomHall } from "@/components/forms/RoomShell";
import { directorPost } from "./DirectorForm";

const ROOM = {
  1: "Tournament",
  2: "Team",
  3: "Manager",
  4: "Players",
};

/**
 * Director add-team — Room flow (same chrome as umpires).
 * Collects less than public register: manager email optional, no signatures.
 */
export default function NewRegistration({ tournaments }) {
  const [page, setPage] = useState(1);
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const [divisionId, setDivisionId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState("");

  const tournament = useMemo(
    () => tournaments.find((t) => t.id === tournamentId),
    [tournaments, tournamentId]
  );
  const divisions = tournament?.divisions ?? [];
  const effectiveDivision =
    divisions.length === 1 ? divisions[0].id : divisionId;

  const players = useMemo(
    () =>
      names
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, dob] = line.split(",").map((x) => x?.trim());
          return {
            name,
            birthDate: /^\d{4}-\d{2}-\d{2}$/.test(dob ?? "") ? dob : null,
          };
        }),
    [names]
  );

  const dirty =
    Boolean(teamName.trim()) ||
    Boolean(managerName.trim()) ||
    Boolean(names.trim()) ||
    page > 1;

  function canPage1() {
    return Boolean(tournamentId) && Boolean(effectiveDivision);
  }
  function canPage2() {
    return teamName.trim().length > 0;
  }
  function canPage3() {
    return managerName.trim().length > 0;
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await directorPost({
      action: "createRegistration",
      tournamentId,
      divisionId: effectiveDivision,
      teamName,
      managerName,
      managerEmail,
      managerPhone,
      players,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(res);
  }

  function onSubmit(e) {
    e?.preventDefault?.();
    setError("");
    if (page === 1) {
      if (!canPage1()) {
        setError(
          divisions.length > 1
            ? "Pick a tournament and division."
            : "Pick a tournament."
        );
        return;
      }
      setPage(2);
      return;
    }
    if (page === 2) {
      if (!canPage2()) {
        setError("Team name is required.");
        return;
      }
      setPage(3);
      return;
    }
    if (page === 3) {
      if (!canPage3()) {
        setError("Manager name is required.");
        return;
      }
      setPage(4);
      return;
    }
    save();
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  if (done) {
    return (
      <div className="card p-4 space-y-3 max-w-md">
        <p className="t-strong">{teamName} is in.</p>
        <p className="t-meta">
          Nobody has signed yet. Send the team link so each person signs their
          own waiver, and keep the manager link for yourself.
        </p>
        <button
          type="button"
          className="btn-action w-full"
          onClick={() => copy(done.rosterLink, "roster")}
        >
          {copied === "roster" ? "Copied" : "Copy team link"}
        </button>
        <button
          type="button"
          className="btn-transient w-full"
          onClick={() => copy(done.manageLink, "manage")}
        >
          {copied === "manage" ? "Copied" : "Copy manager link"}
        </button>
        <a
          className="btn-transient w-full block text-center"
          href="/director/registrations"
        >
          See all registrations
        </a>
      </div>
    );
  }

  if (!tournaments.length) {
    return (
      <div className="card p-4">
        <p className="t-meta">
          No tournaments with divisions yet. Create a tournament and add
          divisions first.
        </p>
      </div>
    );
  }

  const primaryDisabled =
    busy ||
    (page === 1 && !canPage1()) ||
    (page === 2 && !canPage2()) ||
    (page === 3 && !canPage3());

  return (
    <RoomShell
      title="Add team"
      roomTitle={ROOM[page]}
      page={page}
      totalPages={4}
      dirty={dirty}
      onClose={() => {
        if (dirty && !window.confirm("Discard what you entered?")) return;
        window.location.href = "/director/registrations";
      }}
      error={error}
      welcome={
        page === 1
          ? "Which event is this team entering?"
          : page === 2
            ? "Name the team."
            : page === 3
              ? "Who runs the team? Email is optional if you only have a name."
              : "Optional — paste names now, or add players later from the roster."
      }
      hall={
        page > 1 ? (
          <RoomHall
            lines={[
              {
                label: "Event",
                value: tournament
                  ? `${tournament.name}${
                      divisions.find((d) => d.id === effectiveDivision)?.name
                        ? ` · ${divisions.find((d) => d.id === effectiveDivision).name}`
                        : ""
                    }`
                  : "",
              },
              page > 2 ? { label: "Team", value: teamName } : null,
              page > 3 ? { label: "Manager", value: managerName } : null,
            ].filter(Boolean)}
            onEdit={() => setPage(1)}
            editLabel="Edit place"
          />
        ) : null
      }
      onBack={page > 1 ? () => setPage((p) => p - 1) : null}
      showSkip={page === 4}
      onSkip={page === 4 ? () => save() : null}
      skipLabel="Skip players"
      primaryLabel={
        page < 4 ? "Continue" : busy ? "Saving…" : "Add team"
      }
      primaryDisabled={primaryDisabled}
      busy={busy}
      onSubmit={onSubmit}
      className="max-w-lg"
    >
      {page === 1 && (
        <>
          <label className="block space-y-1">
            <span className="form-label font-bold text-afa-navy">
              Tournament
            </span>
            <select
              className="form-field w-full"
              value={tournamentId}
              onChange={(e) => {
                setTournamentId(e.target.value);
                setDivisionId("");
              }}
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.startDate}
                  {t.open ? "" : " (closed to the public)"}
                </option>
              ))}
            </select>
          </label>
          {divisions.length > 1 && (
            <label className="block space-y-1">
              <span className="form-label font-bold text-afa-navy">
                Division
              </span>
              <select
                className="form-field w-full"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">Pick one…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      {page === 2 && (
        <RoomField
          label="Team name"
          required
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          explainer="e.g. Backwards K"
        />
      )}

      {page === 3 && (
        <>
          <RoomField
            label="Manager name"
            required
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            explainer="Legal name if you have it"
          />
          <RoomField
            label="Phone"
            optional
            type="tel"
            value={managerPhone}
            onChange={(e) => setManagerPhone(e.target.value)}
            explainer="702-555-0100"
          />
          <RoomField
            label="Email"
            optional
            type="email"
            value={managerEmail}
            onChange={(e) => setManagerEmail(e.target.value)}
          />
        </>
      )}

      {page === 4 && (
        <label className="block space-y-1">
          <span className="form-label font-normal text-afa-muted">
            Players
          </span>
          <textarea
            className="form-field w-full min-h-[160px] text-sm"
            rows={8}
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder={"One per line:\nJared Willcox, 1980-02-17\nAustyn Davies"}
          />
          <p className="text-[11px] font-normal uppercase tracking-wide text-afa-muted/80">
            Optional · {players.length} listed
            {players.some((p) => !p.birthDate)
              ? " · some without birth date"
              : ""}
          </p>
        </label>
      )}
    </RoomShell>
  );
}
