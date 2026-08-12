"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import {
  forgetTeamOnDevice,
  readMyRegistrations,
  rememberRegistration,
} from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";

function TeamRow({ r, slug, onForget }) {
  return (
    <li
      className={
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 " +
        (r.genderKey
          ? "reg-team-row--" + r.genderKey
          : "border-afa-navy/10 bg-white")
      }
    >
      <div className="min-w-0">
        <p className="team-name font-semibold truncate">{r.teamName}</p>
        <p className="t-meta flex flex-wrap items-center gap-1.5 mt-0.5">
          <DivisionSeatMark
            genderKey={r.genderKey}
            seatLabel={r.seatLabel}
            genderLabel={r.genderLabel}
            levelLabel={r.levelLabel}
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
        ) : r.divisionId ? (
          <Link
            href={`/tournaments/${slug}/division/${r.divisionId}`}
            className="btn-transient text-sm px-3 py-1.5"
          >
            Division
          </Link>
        ) : null}
        {r.manageToken && onForget ? (
          <button
            type="button"
            className="t-meta underline"
            onClick={() => onForget(r.teamName)}
          >
            Forget
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * User's teams first. Then Find (team or manager name) or Register.
 */
export default function FindTournamentTeam({
  slug,
  selectedTeam = "",
  onTeam,
  registrationOpen = false,
  externalRegisterUrl = null,
  panel = null,
  onPanel,
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [local, setLocal] = useState([]);

  useEffect(() => {
    setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
  }, [slug]);

  useEffect(() => {
    if (selectedTeam) return;
    const mine = readMyRegistrations().find((r) => r.tournamentSlug === slug);
    if (mine?.teamName) onTeam?.(mine.teamName);
  }, [slug, selectedTeam, onTeam]);

  async function onLookup(e) {
    e.preventDefault();
    const name = query.trim();
    if (name.length < 2) {
      setError("Type a team name or manager name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tournamentSlug: slug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lookup failed");
      const here = json.teams || [];
      if (here.length === 0) {
        setError("No team matches that name.");
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
          genderKey: t.genderKey,
          genderLabel: t.genderLabel,
          levelLabel: t.levelLabel,
          seatLabel: t.seatLabel,
        });
        if (t.teamName) writeMe({ teamName: t.teamName, source: "picked" });
      }
      setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
      onTeam?.(here[0].teamName);
      try {
        window.localStorage.setItem(`afa-team-${slug}`, here[0].teamName);
      } catch {
        /* private browsing */
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function forget(name) {
    forgetTeamOnDevice(name);
    setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
    if (selectedTeam === name) onTeam?.("");
  }

  return (
    <div className="space-y-3">
      {local.length > 0 ? (
        <ul className="space-y-2">
          {local.map((r) => (
            <TeamRow key={r.manageToken} r={r} slug={slug} onForget={forget} />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={panel === "find" ? "btn-action flex-1" : "btn-transient flex-1"}
          aria-pressed={panel === "find"}
          onClick={() => onPanel?.(panel === "find" ? null : "find")}
        >
          Find my team
        </button>
        {registrationOpen ? (
          externalRegisterUrl ? (
            <a
              href={externalRegisterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-transient flex-1 text-center"
            >
              Register
            </a>
          ) : (
            <button
              type="button"
              className={
                panel === "register" ? "btn-action flex-1" : "btn-transient flex-1"
              }
              aria-pressed={panel === "register"}
              onClick={() => onPanel?.(panel === "register" ? null : "register")}
            >
              Register
            </button>
          )
        ) : null}
      </div>

      {panel === "find" ? (
        <form onSubmit={onLookup} className="form-surface p-4">
          <div className="flex flex-wrap gap-2 items-stretch">
            <input
              type="search"
              autoComplete="off"
              required
              minLength={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Team or manager name"
              aria-label="Team or manager name"
              className="form-field flex-1 min-w-[12rem]"
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-action shrink-0 px-4"
            >
              {busy ? "Looking…" : "Find"}
            </button>
          </div>
          {error ? (
            <p className="text-sm text-red-700 mt-1.5" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
