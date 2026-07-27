"use client";

import { useMemo, useState } from "react";
import { Field, Input, Select, directorPost } from "./DirectorForm";

// A director taking a team the way they always have: on paper, at a table,
// with a phone number and a list of names.
//
// JD, 2026-07-27: "most tournaments we will just have to put them in
// ourselves." So this asks for less than the public form. A manager's email
// is optional here — the director may genuinely not have one — and nobody
// signs anything at this table. The team link comes back at the end to share.
export default function NewRegistration({ tournaments }) {
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
  const effectiveDivision = divisions.length === 1 ? divisions[0].id : divisionId;

  // One name per line, "Name, YYYY-MM-DD" if the birth date is to hand.
  // Typing twelve names is faster than tapping twelve Add buttons, and it is
  // what a paper roster already looks like.
  const players = useMemo(
    () =>
      names
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, dob] = line.split(",").map((x) => x?.trim());
          return { name, birthDate: /^\d{4}-\d{2}-\d{2}$/.test(dob ?? "") ? dob : null };
        }),
    [names]
  );
  const withoutDob = players.filter((p) => !p.birthDate).length;

  async function submit() {
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
    if (res.error) return setError(res.error);
    setDone(res);
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  if (done) {
    return (
      <div className="card p-4 space-y-3">
        <p className="t-strong">{teamName} is in.</p>
        <p className="t-meta">
          Nobody has signed yet. Send the team link so each person signs their
          own waiver, and keep the manager link for yourself.
        </p>
        <button type="button" className="btn w-full" onClick={() => copy(done.rosterLink, "roster")}>
          {copied === "roster" ? "Copied" : "Copy team link"}
        </button>
        <button type="button" className="btn-quiet w-full" onClick={() => copy(done.manageLink, "manage")}>
          {copied === "manage" ? "Copied" : "Copy manager link"}
        </button>
        <a className="btn-quiet w-full block text-center" href="/scorekeeper/registrations">
          See all registrations
        </a>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <Field label="Tournament">
        <Select
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
        </Select>
      </Field>

      {divisions.length > 1 && (
        <Field label="Division">
          <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            <option value="">Pick one…</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Team name"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} /></Field>
      <Field label="Manager" hint="They go on the roster too — a manager plays.">
        <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} />
      </Field>
      <Field label="Manager phone"><Input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="702-555-0100" /></Field>
      <Field label="Manager email" hint="Optional. Leave it blank if you do not have one.">
        <Input value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
      </Field>

      <Field
        label="Players"
        hint="One per line. Add a birth date after a comma if you have it — without one they will not join the People list."
      >
        <textarea
          rows={8}
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder={"Kaydee Anderson, 2002-10-14\nJarrod Grannum, 1979-01-21\nLyndsey Healey"}
          className="w-full border border-afa-navy/30 rounded-lg px-3 py-3 text-base font-mono"
        />
      </Field>

      <p className="t-meta">
        {players.length} {players.length === 1 ? "player" : "players"}
        {withoutDob > 0 && ` · ${withoutDob} without a birth date`}
      </p>

      <button
        type="button"
        className="btn w-full"
        disabled={busy || !teamName.trim() || !managerName.trim() || !effectiveDivision}
        onClick={submit}
      >
        {busy ? "Saving…" : "Add this team"}
      </button>
      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
    </div>
  );
}
