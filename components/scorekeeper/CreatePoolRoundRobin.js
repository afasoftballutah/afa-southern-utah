"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-shot: build Pool A as a full round-robin from registered teams.
 * For demos / weekends without QuickScores import.
 */
export default function CreatePoolRoundRobin({ divisionId, teamCount }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (
      !window.confirm(
        `Create Pool A round-robin for ${teamCount} teams? Every pair plays once.`
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
          action: "createPoolRoundRobin",
          divisionId,
          poolLetter: "A",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create pool");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-2">
      <p className="t-strong">Start with pool play</p>
      <p className="t-meta">
        Optional. Builds Pool A (each team plays every other). Score the games,
        then generate the bracket from the finish order. Skip this for no-pool
        3GG — use seed order below instead.
      </p>
      {error && <p className="text-sm font-bold underline text-afa-ink">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={create}
        className="rounded-lg border border-afa-navy/30 px-4 py-2 text-sm font-semibold text-afa-navy disabled:opacity-40"
      >
        {busy ? "Creating…" : `Create Pool A (${teamCount} teams)`}
      </button>
    </div>
  );
}
