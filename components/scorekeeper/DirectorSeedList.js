"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeSeedOrder, isCompleteSeedOrder } from "@/lib/bracket/seed-order";
import { directorPost } from "./DirectorForm";

/**
 * Director sets seed #1 … #N. Generate uses this list — not registration time.
 * optional poolDefault: "Use pool finish" resets to that order.
 */
export default function DirectorSeedList({
  divisionId,
  teamNames = [],
  initialOrder = null,
  poolDefault = null,
  onSaved,
  onOrderChange,
  onRenamed,
  meta = null,
}) {
  const baseline = useMemo(
    () => normalizeSeedOrder(teamNames, initialOrder ?? poolDefault ?? teamNames),
    [teamNames, initialOrder, poolDefault]
  );
  const [order, setOrder] = useState(baseline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const skipBlur = useRef(false);

  useEffect(() => {
    const next = normalizeSeedOrder(teamNames, initialOrder ?? poolDefault ?? teamNames);
    setOrder(next);
    onOrderChange?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when server/props change
  }, [teamNames, initialOrder, poolDefault]);

  const complete = isCompleteSeedOrder(teamNames, order);

  function setOrderAndNotify(next) {
    setOrder(next);
    setSaved(false);
    onOrderChange?.(next);
  }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrderAndNotify(next);
  }

  function usePoolFinish() {
    if (!poolDefault?.length) return;
    setOrderAndNotify(normalizeSeedOrder(teamNames, poolDefault));
  }

  async function rename(from) {
    const to = draft.trim();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    const json = await directorPost({
      action: "renameTeam",
      divisionId,
      fromName: from,
      toName: to,
    });
    setBusy(false);
    if (json.error) {
      setError(json.error);
      return;
    }
    const next = order.map((n) => (n === from ? to : n));
    setOrderAndNotify(next);
    setEditing(null);
    onRenamed?.(from, to);
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
    return <p className="t-meta">Need at least two teams to seed.</p>;
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="t-strong">Seed order</p>
          <p className="t-meta">
            {meta ||
              "#1 is the top seed. Tap a name to fix spelling."}
          </p>
        </div>
        {poolDefault?.length >= 2 && (
          <button
            type="button"
            className="pill shrink-0"
            disabled={busy}
            onClick={usePoolFinish}
          >
            Reset to pool finish
          </button>
        )}
      </div>
      <ol className="divide-y divide-black/5 border border-black/10 rounded-lg overflow-hidden">
        {order.map((name, i) => (
          <li
            key={name}
            className={
              editing === name
                ? "flex flex-col gap-2 px-3 py-3 bg-white"
                : "flex items-center gap-2 px-3 py-2 bg-white"
            }
          >
            <div className="flex items-center gap-2">
              <span className="t-label w-10 shrink-0">#{i + 1}</span>
              {editing === name ? null : (
                <button
                  type="button"
                  className="t-body flex-1 min-w-0 truncate text-left hover:underline"
                  onClick={() => {
                    setDraft(name);
                    setEditing(name);
                  }}
                >
                  {name}
                </button>
              )}
              {editing === name ? null : (
                <>
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
                </>
              )}
            </div>
            {editing === name ? (
              <input
                className="form-field w-full"
                value={draft}
                autoFocus
                aria-label={`Rename ${name}`}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (skipBlur.current) {
                    skipBlur.current = false;
                    return;
                  }
                  rename(name);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    skipBlur.current = true;
                    setEditing(null);
                  }
                }}
              />
            ) : null}
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
