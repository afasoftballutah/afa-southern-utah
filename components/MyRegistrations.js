"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  forgetTeamOnDevice,
  readMyRegistrations,
  rememberRegistration,
} from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";
import DivisionSeatMark from "@/components/DivisionSeatMark";

/**
 * On /register: show teams this device already knows + email lookup
 * so a manager can get back without a password.
 *
 * compactSlug: one line per team already saved for that event — used when
 * the manager just tapped a division and is naming a team, not recovering.
 */
export default function MyRegistrations({ compactSlug = null, onChange }) {
  const [local, setLocal] = useState([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookupResults, setLookupResults] = useState(null); // null | [] | teams

  useEffect(() => {
    setLocal(readMyRegistrations());
  }, []);

  function refreshLocal() {
    setLocal(readMyRegistrations());
  }

  async function onLookup(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLookupResults(null);
    try {
      const res = await fetch("/api/register/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lookup failed");
      const teams = json.teams || [];
      setLookupResults(teams);
      // Remember on this device so next visit is one tap
      for (const t of teams) {
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
        if (t.teamName) {
          writeMe({ teamName: t.teamName, source: "picked" });
        }
      }
      refreshLocal();
      onChange?.();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function removeLocal(teamName) {
    forgetTeamOnDevice(teamName);
    refreshLocal();
    onChange?.();
  }

  const rows = compactSlug
    ? local.filter((r) => r.tournamentSlug === compactSlug)
    : local;

  if (compactSlug) {
    if (rows.length === 0) return null;
    return (
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.manageToken}
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span className="team-name font-semibold">{r.teamName}</span>
            <DivisionSeatMark
              genderKey={r.genderKey}
              seatLabel={r.seatLabel}
              genderLabel={r.genderLabel}
              levelLabel={r.levelLabel}
            />
            <Link
              href={`/register/manage/${encodeURIComponent(r.manageToken)}`}
              className="t-meta underline"
            >
              Manage
            </Link>
            <button
              type="button"
              className="t-meta underline"
              onClick={() => removeLocal(r.teamName)}
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="form-surface p-4 space-y-3">
      <div>
        <p className="t-heading">Already registered?</p>
        <p className="t-meta mt-0.5">
          Teams saved on this phone, or look up with the manager email from
          registration.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.manageToken}
              className={
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 " +
                (r.genderKey
                  ? "reg-team-row--" + r.genderKey
                  : "border-afa-navy/10 bg-white")
              }
            >
              <div className="min-w-0">
                <p className="team-name font-semibold truncate">{r.teamName}</p>
                <p className="t-meta truncate flex flex-wrap items-center gap-1.5 mt-0.5">
                  <DivisionSeatMark
                    genderKey={r.genderKey}
                    seatLabel={r.seatLabel}
                    genderLabel={r.genderLabel}
                    levelLabel={r.levelLabel}
                  />
                  {r.tournamentName ? (
                    <span>{r.tournamentName}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  href={`/register/manage/${encodeURIComponent(r.manageToken)}`}
                  className="btn-action text-sm px-3 py-1.5"
                >
                  Manage roster
                </Link>
                {r.rosterToken && (
                  <Link
                    href={`/register/roster/${encodeURIComponent(r.rosterToken)}`}
                    className="btn-transient text-sm px-3 py-1.5"
                  >
                    Team link
                  </Link>
                )}
                <button
                  type="button"
                  className="t-meta underline"
                  onClick={() => removeLocal(r.teamName)}
                >
                  Forget
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onLookup} className="space-y-2">
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
          <button
            type="submit"
            disabled={busy}
            className="btn-action shrink-0 px-4"
          >
            {busy ? "Looking…" : "Find my teams"}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {lookupResults && lookupResults.length === 0 && (
          <p className="text-sm text-afa-ink/70">
            No teams for that email. Check the spelling, or register below.
          </p>
        )}
        {lookupResults && lookupResults.length > 0 && (
          <p className="text-sm text-[#2f7a4f] font-semibold">
            Found {lookupResults.length} team
            {lookupResults.length === 1 ? "" : "s"} — saved on this phone.
          </p>
        )}
      </form>
    </div>
  );
}
