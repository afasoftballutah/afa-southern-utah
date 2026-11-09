"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Undo for pool play made by mistake. Only shown while no pool game has a
 * score; the server checks again before it deletes anything.
 */
export default function RemovePoolPlay({ divisionId, gameCount }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removePoolPlay", divisionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove pool play");
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const games = gameCount === 1 ? "1 pool game" : `${gameCount} pool games`;

  return (
    <div className="card p-4 space-y-2" data-testid="remove-pool-play">
      <p className="t-strong">Made pool play by mistake?</p>
      <p className="t-meta">
        Removes all {games} from this division. Teams stay registered. Only
        works while no pool game has a score.
      </p>
      {error && <p className="text-sm font-bold underline text-afa-ink">{error}</p>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-afa-ink">Remove {games}?</p>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-lg bg-afa-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Removing…" : "Yes, remove"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-afa-navy/30 px-4 py-2 text-sm font-semibold text-afa-navy disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-afa-navy/30 px-4 py-2 text-sm font-semibold text-afa-navy"
        >
          Remove pool play
        </button>
      )}
    </div>
  );
}
