"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeSeedOrder, isCompleteSeedOrder } from "@/lib/bracket/seed-order";

/**
 * Director sets seed #1 … #N for a division (no pool required).
 * Saves via setDivisionSeedOrder; parent can re-read seedOrder after save.
 */
export default function DirectorSeedList({
  divisionId,
  teamNames = [],
  initialOrder = null,
  onSaved,
}) {
  const baseline = useMemo(
    () => normalizeSeedOrder(teamNames, initialOrder ?? teamNames),
    [teamNames, initialOrder]
  );
  const [order, setOrder] = useState(baseline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Sync when server list changes (e.g. after refresh)
  useEffect(() => {
    setOrder(normalizeSeedOrder(teamNames, initialOrder ?? teamNames));
  }, [teamNames, initialOrder]);

  const complete = isCompleteSeedOrder(teamNames, order);

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setOrder((cur) => {
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setDivisionSeedOrder",
          divisionId,
          seedOrder: order,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save seeds");
      setSaved(true);
      if (onSaved) onSaved(json.seedOrder ?? order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (teamNames.length < 2) {
    return (
      <p className="t-meta">Need at least two registered teams to seed.</p>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div>
        <p className="t-strong">Seed order</p>
        <p className="t-meta">
          #1 is the top seed. Generate uses this list — not registration time.
        </p>
      </div>
      <ol className="divide-y divide-black/5 border border-black/10 rounded-lg overflow-hidden">
        {order.map((name, i) => (
          <li
            key={name}
            className="flex items-center gap-2 px-3 py-2 bg-white"
          >
            <span className="t-label w-10 shrink-0">#{i + 1}</span>
            <span className="t-body flex-1 min-w-0 truncate">{name}</span>
            <button
              type="button"
              className="pill"
              disabled={busy || i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${name} up`}
            >
              Up
            </button>
            <button
              type="button"
              className="pill"
              disabled={busy || i === order.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${name} down`}
            >
              Down
            </button>
          </li>
        ))}
      </ol>
      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
      <button
        type="button"
        className="btn-action w-full"
        disabled={busy || !complete}
        onClick={save}
      >
        {busy ? "Saving…" : saved ? "Seeds saved" : "Save seed order"}
      </button>
    </div>
  );
}
