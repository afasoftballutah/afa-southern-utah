"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  forgetRegistration,
  readMyRegistrations,
  rememberRegistration,
} from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";

/**
 * On /register: show teams this device already knows + email lookup
 * so a manager can get back without a password.
 */
export default function MyRegistrations() {
  const [local, setLocal] = useState([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookupResults, setLookupResults] = useState(null); // null | [] | teams
  const [showLookup, setShowLookup] = useState(false);

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
          manageToken: t.manageToken,
          rosterToken: t.rosterToken,
          manageLink: t.manageLink,
          rosterLink: t.rosterLink,
          managerEmail: email,
        });
        if (t.teamName) {
          writeMe({ teamName: t.teamName, source: "picked" });
        }
      }
      refreshLocal();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function removeLocal(token) {
    forgetRegistration(token);
    refreshLocal();
  }

  return (
    <div className="form-surface p-4 space-y-3">
      <div>
        <p className="t-heading">Already registered?</p>
        <p className="t-meta mt-0.5">
          No login. Open a team you manage on this phone, or look up by the
          email you used when you registered.
        </p>
      </div>

      {local.length > 0 && (
        <ul className="space-y-2">
          {local.map((r) => (
            <li
              key={r.manageToken}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-afa-navy/10 bg-white px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="team-name font-semibold truncate">{r.teamName}</p>
                {r.tournamentName && (
                  <p className="t-meta truncate">{r.tournamentName}</p>
                )}
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
                  onClick={() => removeLocal(r.manageToken)}
                >
                  Forget
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showLookup ? (
        <button
          type="button"
          className="btn-transient w-full"
          onClick={() => setShowLookup(true)}
        >
          {local.length
            ? "Find a team on another phone"
            : "Look up my team by email"}
        </button>
      ) : (
        <form onSubmit={onLookup} className="space-y-2">
          <label className="block">
            <span className="t-label">Manager email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="same email as registration"
              className="mt-1 w-full rounded-lg border border-afa-navy/20 px-3 py-2.5 text-base"
            />
          </label>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {lookupResults && lookupResults.length === 0 && (
            <p className="text-sm text-afa-ink/70">
              No teams found for that email. Check the spelling, or register a
              new team below.
            </p>
          )}
          {lookupResults && lookupResults.length > 0 && (
            <p className="text-sm text-[#2f7a4f] font-semibold">
              Found {lookupResults.length} team
              {lookupResults.length === 1 ? "" : "s"} — saved on this phone.
              Use Manage roster above.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="btn-action flex-1 min-w-[8rem]"
            >
              {busy ? "Looking…" : "Find my teams"}
            </button>
            <button
              type="button"
              className="btn-transient"
              onClick={() => {
                setShowLookup(false);
                setError("");
                setLookupResults(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
