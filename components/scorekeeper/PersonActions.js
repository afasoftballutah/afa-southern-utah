"use client";

import { useState } from "react";

// The two things a director does to a person: move them to another team, or
// merge a duplicate away. Both are one dropdown and one button, and both ask
// once in plain words before doing anything.
//
// JD, 2026-07-27: "Drill downs everywhere, simple confirms."
//
// A confirm here names the person AND the consequence. "Are you sure?" tells
// a director nothing; "Move Taylor Sams from Fallen to GWZ?" tells them
// exactly what is about to be true.
export default function PersonActions({ person, appearances, registrations, otherPeople }) {
  const [from, setFrom] = useState(appearances[0]?.memberId ?? "");
  const [to, setTo] = useState("");
  const [mergeId, setMergeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function post(payload, confirmText, successText) {
    if (!confirm(confirmText)) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That did not work");
      setDone(successText);
      // Reload rather than patch state by hand — this changes rosters,
      // waivers and counts in several places at once, and a stale number on a
      // control screen is worse than a second of waiting.
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const fromLabel = appearances.find((a) => a.memberId === from);
  const toLabel = registrations.find((r) => r.id === to);
  const mergeLabel = otherPeople.find((p) => p.id === mergeId);

  return (
    <div className="space-y-3">
      {appearances.length > 0 && registrations.length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="t-strong">Move to another team</p>
          {appearances.length > 1 && (
            <label className="block">
              <span className="t-label block mb-1">Move them off</span>
              <select
                className="w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-base"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                {appearances.map((a) => (
                  <option key={a.memberId} value={a.memberId}>
                    {a.teamName} — {a.tournamentName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="t-label block mb-1">And onto</span>
            <select
              className="w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-base"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">Pick a team…</option>
              {registrations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn w-full"
            disabled={busy || !from || !to}
            onClick={() =>
              post(
                { action: "movePlayer", memberId: from, toRegistrationId: to },
                `Move ${person.name} from ${fromLabel?.teamName} to ${toLabel?.label}?\n\nBoth waivers will be rebuilt.`,
                "Moved."
              )
            }
          >
            Move {person.name}
          </button>
        </div>
      )}

      {otherPeople.length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="t-strong">Same person, listed twice?</p>
          <p className="t-meta">
            Pick the other record. Everything on it moves here, and it stops
            showing up in lists. Nothing is deleted.
          </p>
          <select
            className="w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-base"
            value={mergeId}
            onChange={(e) => setMergeId(e.target.value)}
          >
            <option value="">Pick the duplicate…</option>
            {otherPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-quiet w-full"
            disabled={busy || !mergeId}
            onClick={() =>
              post(
                { action: "mergePlayers", keepId: person.id, dropId: mergeId },
                `Merge ${mergeLabel?.label} into ${person.name}?\n\nEvery roster entry moves to ${person.name}. This can be undone by merging back.`,
                "Merged."
              )
            }
          >
            Merge into {person.name}
          </button>
        </div>
      )}

      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
      {done && <p className="t-meta font-semibold">{done}</p>}
    </div>
  );
}
