"use client";

import { useEffect, useState, useCallback } from "react";

// Seeding (dispatch-brief-22): "machine proposes, director disposes."
// Standings compute; ties are surfaced for the director to settle and are
// NEVER broken automatically by run differential, head-to-head, or name
// order (afa-spec.md). This panel computes and previews in dry-run on
// load and after every change; nothing writes until the director presses
// Apply seeding.

function poolLetters(pools) {
  return Object.keys(pools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Groups an ordered team list into consecutive blocks sharing the same
// rank (a tied group always occupies a contiguous run once sorted by
// wins), so tied teams render together under one label with Up/Down
// controls, and everyone else renders solo.
function groupByRank(order, standingsByTeam) {
  const groups = [];
  for (const team of order) {
    const info = standingsByTeam.get(team);
    const rank = info?.rank ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.rank === rank) last.teams.push(team);
    else groups.push({ rank, teams: [team] });
  }
  return groups;
}

function PoolBlock({ letter, pool, order, onReorder }) {
  const standingsByTeam = new Map(pool.standings.map((t) => [t.team, t]));
  const groups = groupByRank(order, standingsByTeam);
  // The SEED number ("A #2") is always sequential position in the chosen
  // order — distinct from `rank`, which shares the lowest value across a
  // tied group (2nd/3rd tied both show rank 2, but still need distinct
  // seed numbers #2 and #3 to fill two different bracket slots). This is
  // exactly how resolveSeeds() in lib/bracket/seed.js numbers them.
  const seedNumberByTeam = new Map(order.map((team, i) => [team, i + 1]));

  function move(team, direction) {
    const i = order.indexOf(team);
    const j = i + direction;
    if (j < 0 || j >= order.length) return;
    // Only swap within the same tied cluster — a team's RANK is computed,
    // never guessed at here; only the order WITHIN a tie is the
    // director's call.
    const a = standingsByTeam.get(order[i]);
    const b = standingsByTeam.get(order[j]);
    if (!a || !b || a.rank !== b.rank) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(letter, next);
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold text-afa-navy">Pool {letter}</h3>
      <div className="space-y-1">
        {groups.map((g) => {
          const tied = g.teams.length > 1;
          return (
            <div
              key={g.rank}
              className={tied ? "border border-afa-navy/25 rounded p-2 space-y-1 bg-afa-navy/5" : ""}
            >
              {tied && (
                <p className="text-xs font-bold text-afa-navy">
                  Tied at {standingsByTeam.get(g.teams[0]).w}-{standingsByTeam.get(g.teams[0]).l} — you decide the order
                </p>
              )}
              {g.teams.map((team, idx) => {
                const info = standingsByTeam.get(team);
                return (
                  <div key={team} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-semibold text-afa-navy">
                        {letter} #{seedNumberByTeam.get(team)}
                      </span>{" "}
                      {team}{" "}
                      <span className="text-afa-ink/50">
                        ({info.w}-{info.l})
                      </span>
                    </span>
                    {tied && (
                      <span className="flex gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${team} up`}
                          disabled={idx === 0}
                          onClick={() => move(team, -1)}
                          className="min-h-11 min-w-11 border border-afa-navy/30 rounded text-afa-navy font-bold disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${team} down`}
                          disabled={idx === g.teams.length - 1}
                          onClick={() => move(team, 1)}
                          className="min-h-11 min-w-11 border border-afa-navy/30 rounded text-afa-navy font-bold disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SeedBrackets({ divisionId, tournamentSlug }) {
  const [result, setResult] = useState(null);
  const [orders, setOrders] = useState({}); // { [poolLetter]: [teamName,...] }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applySummary, setApplySummary] = useState(null);

  const fetchPreview = useCallback(
    async (overrides) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/scorekeeper/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentSlug, overrides, dryRun: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load seeding preview");
        setResult(json);
        // Seed the local order state for any complete pool that doesn't
        // have a director override yet, so Up/Down controls have a
        // starting order to work from.
        setOrders((prev) => {
          const next = { ...prev };
          for (const [letter, pool] of Object.entries(json.pools ?? {})) {
            if (pool.complete && !next[letter]) {
              next[letter] = pool.standings.map((t) => t.team);
            }
          }
          return next;
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [tournamentSlug]
  );

  useEffect(() => {
    fetchPreview({});
  }, [fetchPreview]);

  function handleReorder(letter, newOrder) {
    const nextOrders = { ...orders, [letter]: newOrder };
    setOrders(nextOrders);
    fetchPreview(nextOrders);
  }

  async function apply() {
    setBusy(true);
    setError("");
    setApplySummary(null);
    try {
      const res = await fetch("/api/scorekeeper/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentSlug, overrides: orders, dryRun: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not apply seeding");
      setApplySummary(json);
      await fetchPreview(orders);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="chalk-panel space-y-2">
        <h2 className="font-bold text-afa-navy">Seed Brackets</h2>
        <p className="text-sm text-afa-ink/60">Loading pool standings…</p>
      </div>
    );
  }

  const pools = result.pools ?? {};
  const letters = poolLetters(pools);
  const preview = result.preview ?? [];
  const readyCount = preview.filter((p) => p.team).length;
  const waitingCount = preview.length - readyCount;

  return (
    <div className="chalk-panel space-y-4">
      <h2 className="font-bold text-afa-navy">Seed Brackets</h2>

      <div className="space-y-3">
        {letters.map((letter) => {
          const pool = pools[letter];
          if (!pool.complete) {
            return (
              <p key={letter} className="text-sm text-afa-ink/70">
                Pool {letter} — {pool.remaining} of {pool.total} game{pool.total === 1 ? "" : "s"} left
              </p>
            );
          }
          return (
            <PoolBlock
              key={letter}
              letter={letter}
              pool={pool}
              order={orders[letter] ?? pool.standings.map((t) => t.team)}
              onReorder={handleReorder}
            />
          );
        })}
      </div>

      <div className="space-y-1 border-t border-afa-navy/10 pt-3">
        <h3 className="text-sm font-bold text-afa-navy">Preview</h3>
        {preview.length === 0 && <p className="text-sm text-afa-ink/60">No bracket slots to seed yet.</p>}
        {preview.map((p) => (
          <p key={p.seedRef} className="text-sm">
            <span className="font-semibold text-afa-navy">{p.seedRef}</span>{" "}
            → {p.team ? p.team : <span className="text-afa-ink/50">not yet</span>}
          </p>
        ))}
      </div>

      <p className="text-sm text-afa-ink/70">
        {readyCount} slot{readyCount === 1 ? "" : "s"} will fill, {waitingCount} still waiting on pool play.
      </p>

      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}

      {applySummary && (
        <div className="text-sm bg-afa-navy/5 border border-afa-navy/20 rounded p-2 space-y-1">
          <p className="font-bold text-afa-navy">
            Applied — {applySummary.appliedCount} slot{applySummary.appliedCount === 1 ? "" : "s"} filled.
          </p>
          {(applySummary.writes ?? []).map((w) => (
            <p key={w.id} className="text-afa-ink/70">
              {Object.entries(w.patch)
                .map(([k, v]) => `${k === "team1_name" ? "team1" : "team2"} → ${v}`)
                .join(", ")}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={busy || readyCount === 0}
        onClick={apply}
        className="w-full bg-red-600 text-white font-bold py-3 rounded-lg disabled:opacity-40"
      >
        Apply seeding
      </button>
    </div>
  );
}
