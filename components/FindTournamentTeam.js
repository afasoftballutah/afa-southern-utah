"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import {
  forgetTeamOnDevice,
  readMyRegistrations,
  rememberRegistration,
} from "@/lib/my-registrations";
import { readMe, writeMe } from "@/lib/me";

/**
 * Find a team on this tournament by name or manager email.
 * Register is a side door — most visitors are not signing a new team up.
 */
export default function FindTournamentTeam({
  slug,
  teams = [],
  selectedTeam = "",
  onTeam,
  registrationOpen = false,
  registerHref = "/register",
  externalRegisterUrl = null,
  registering = false,
  onRegister,
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [local, setLocal] = useState([]);

  useEffect(() => {
    setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
  }, [slug]);

  const didAuto = useRef(false);
  useEffect(() => {
    if (didAuto.current) return;
    didAuto.current = true;
    if (selectedTeam) return;
    const mine = readMyRegistrations().find((r) => r.tournamentSlug === slug);
    if (mine?.teamName) {
      onTeam?.(mine.teamName);
      return;
    }
    const me = readMe();
    if (me?.teamName && teams.some((t) => t.name === me.teamName)) {
      onTeam?.(me.teamName);
    }
  }, [slug, selectedTeam, teams, onTeam]);

  const picked = useMemo(
    () => teams.find((t) => t.name === selectedTeam) ?? null,
    [teams, selectedTeam]
  );
  const saved = useMemo(
    () => local.filter((r) => !selectedTeam || r.teamName === selectedTeam),
    [local, selectedTeam]
  );

  function choose(name) {
    onTeam?.(name);
    try {
      if (name) {
        window.localStorage.setItem(`afa-team-${slug}`, name);
        writeMe({ teamName: name, source: "picked" });
      } else {
        window.localStorage.removeItem(`afa-team-${slug}`);
      }
    } catch {
      /* private browsing */
    }
  }

  async function onLookup(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lookup failed");
      const here = (json.teams || []).filter((t) => t.tournamentSlug === slug);
      if (here.length === 0) {
        setError("No team for that email in this tournament.");
        return;
      }
      for (const t of here) {
        rememberRegistration({
          teamName: t.teamName,
          tournamentName: t.tournamentName,
          tournamentSlug: t.tournamentSlug,
          divisionId: t.divisionId,
          manageToken: t.manageToken,
          rosterToken: t.rosterToken,
          manageLink: t.manageLink,
          rosterLink: t.rosterLink,
          managerEmail: email,
          genderKey: t.genderKey,
          genderLabel: t.genderLabel,
          levelLabel: t.levelLabel,
          seatLabel: t.seatLabel,
        });
        if (t.teamName) writeMe({ teamName: t.teamName, source: "picked" });
      }
      setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
      choose(here[0].teamName);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function forget(name) {
    forgetTeamOnDevice(name);
    setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
    if (selectedTeam === name) choose("");
  }

  return (
    <div className="form-surface p-4 space-y-3">
      <div className="text-center">
        <h2 className="t-heading">Find your team</h2>
        <p className="t-meta">By name or the manager email from registration.</p>
      </div>

      <label className="block">
        <span className="form-label">Team name</span>
        <select
          className="form-field"
          value={selectedTeam}
          onChange={(e) => choose(e.target.value)}
          aria-label="Team name"
        >
          <option value="">Find your team</option>
          {teams.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
              {t.seats?.length ? ` · ${t.seats.join(", ")}` : ""}
            </option>
          ))}
        </select>
      </label>

      <form onSubmit={onLookup}>
        <div className="flex flex-wrap gap-2 items-stretch">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Manager email"
            aria-label="Manager email"
            className="form-field flex-1 min-w-[12rem]"
          />
          <button type="submit" disabled={busy} className="btn-action shrink-0 px-4">
            {busy ? "Looking…" : "Find"}
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-700 mt-1.5" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {picked || saved.length > 0 ? (
        <ul className="space-y-2">
          {(saved.length > 0 ? saved : picked ? [{ teamName: picked.name, ...picked }] : []).map(
            (r) => {
              const seat = teams.find((t) => t.name === r.teamName) || r;
              return (
                <li
                  key={r.manageToken || r.teamName}
                  className={
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 " +
                    (seat.genderKey
                      ? "reg-team-row--" + seat.genderKey
                      : "border-afa-navy/10 bg-white")
                  }
                >
                  <div className="min-w-0">
                    <p className="team-name font-semibold truncate">{r.teamName}</p>
                    <p className="t-meta flex flex-wrap items-center gap-1.5 mt-0.5">
                      <DivisionSeatMark
                        genderKey={seat.genderKey}
                        seatLabel={seat.seatLabel}
                        genderLabel={seat.genderLabel}
                        levelLabel={seat.levelLabel}
                      />
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {r.manageToken ? (
                      <Link
                        href={`/register/manage/${encodeURIComponent(r.manageToken)}`}
                        className="btn-action text-sm px-3 py-1.5"
                      >
                        Manage roster
                      </Link>
                    ) : null}
                    {r.rosterToken ? (
                      <Link
                        href={`/register/roster/${encodeURIComponent(r.rosterToken)}`}
                        className="btn-transient text-sm px-3 py-1.5"
                      >
                        Team link
                      </Link>
                    ) : seat.divisionId ? (
                      <Link
                        href={`/tournaments/${slug}/division/${seat.divisionId}`}
                        className="btn-transient text-sm px-3 py-1.5"
                      >
                        Division
                      </Link>
                    ) : null}
                    {r.manageToken ? (
                      <button
                        type="button"
                        className="t-meta underline"
                        onClick={() => forget(r.teamName)}
                      >
                        Forget
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            }
          )}
        </ul>
      ) : null}

      {registrationOpen ? (
        <p className="text-center">
          {externalRegisterUrl ? (
            <a
              href={externalRegisterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="t-meta underline"
            >
              Register a team
            </a>
          ) : (
            <button
              type="button"
              className="t-meta underline"
              aria-expanded={registering}
              onClick={() => onRegister?.()}
            >
              Register a team
            </button>
          )}
        </p>
      ) : null}
    </div>
  );
}
