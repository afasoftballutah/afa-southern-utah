"use client";

import { useState } from "react";

// One dropdown, one button, one confirm that names both sides. Used for
// people and for teams, so a merge looks and behaves identically wherever a
// director meets it.
export default function MergeControl({ kind, keepId, keepLabel, options, heading, note }) {
  const [dropId, setDropId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (options.length === 0) return null;
  const dropLabel = options.find((o) => o.id === dropId)?.label;

  async function merge() {
    if (
      !confirm(
        `Merge ${dropLabel} into ${keepLabel}?\n\nEverything on ${dropLabel} moves to ${keepLabel}. Nothing is deleted, and merging back undoes it.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind === "teams" ? "mergeTeams" : "mergePlayers",
          keepId,
          dropId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That did not work");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <p className="t-strong">{heading}</p>
      {note && <p className="t-meta">{note}</p>}
      <select
        className="w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-base"
        value={dropId}
        onChange={(e) => setDropId(e.target.value)}
      >
        <option value="">Pick the duplicate…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn-quiet w-full" disabled={busy || !dropId} onClick={merge}>
        Merge into {keepLabel}
      </button>
      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
    </div>
  );
}
