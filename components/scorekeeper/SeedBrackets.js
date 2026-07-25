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

// Slots arrive from the API already sorted by division, then game number
// (dispatch-brief-23) — group them here for rendering without re-sorting
// or hardcoding a Gold/Silver/Bronze name list.
function groupSlotsByDivision(slots) {
  const groups = [];
  for (const s of slots) {
    const last = groups[groups.length - 1];
    if (last && last.division === s.division) last.rows.push(s);
    else groups.push({ division: s.division, rows: [s] });
  }
  return groups;
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

  // Remap (dispatch-brief-23): change which seed feeds a slot. Persists
  // immediately, never touches team names or pool_games — safe at any
  // time. Refetches the dry-run preview so both this row and any row that
  // got swapped redraw with the server's answer, not a local guess.
  // Slots touched by the most recent swap, highlighted briefly so both ends
  // of the move are visible.
  const [swapped, setSwapped] = useState([]);

  async function remapSlot(gameId, slotSide, nextSeedRef) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentSlug,
          action: "remap",
          gameId,
          slot: slotSide,
          seedRef: nextSeedRef,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remap slot");
      // A swap always moves TWO slots. The API reports both; mark them so the
      // partner is visible too — otherwise you change one dropdown and the
      // seed you displaced moves somewhere off-screen with no sign of it
      // (JD, 2026-07-25).
      const touched = (json.changed ?? []).map((c) => `${c.gameId}-${c.slot}`);
      setSwapped(touched);
      await fetchPreview(orders);
      if (touched.length) window.setTimeout(() => setSwapped([]), 6000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
  const slots = result.slots ?? [];
  const seedRefOptions = result.seedRefOptions ?? [];
  const slotGroups = groupSlotsByDivision(slots);
  // Where does each seed CURRENTLY feed? Picking a seed swaps it here from
  // wherever it is, so the option has to say where it is — otherwise a
  // cross-bracket move (pulling a pool winner out of Gold into Silver) looks
  // identical to a harmless shuffle within one bracket (JD, 2026-07-25).
  const slotBySeedRef = {};
  for (const sl of slots) {
    if (sl.seedRef) {
      slotBySeedRef[sl.seedRef] = {
        where: `${sl.division} G${sl.round}`,
        team: sl.team || null,
      };
    }
  }
  // Every option names the TEAM you would be swapping with (JD, 2026-07-25) —
  // a director thinks in teams, not seed codes. Then where that team sits, so
  // a cross-bracket move is visible. Top/bottom is dropped: which side of a
  // matchup a team is listed on carries no meaning here.
  const optionLabel = (ref) => {
    const at = slotBySeedRef[ref];
    if (!at) return `${ref} — unassigned`;
    return at.team ? `${ref} ${at.team} — ${at.where}` : `${ref} — ${at.where}`;
  };

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

      <div className="space-y-3 border-t border-afa-navy/10 pt-3">
        <h3 className="text-sm font-bold text-afa-navy">Seeds → slots</h3>
        <p className="text-xs text-afa-ink/60">
          Seeds swap, they never duplicate — pointing a seed at a new slot moves
          it off whatever slot it used to feed. This persists right away and is
          always safe; nothing is written to the bracket until you press Apply
          below.
        </p>
        {swapped.length > 0 && (
          <p className="text-xs font-bold text-afa-navy">
            Swapped — both slots below are highlighted.
          </p>
        )}
        {slots.length === 0 && (
          <p className="text-sm text-afa-ink/60">No seed-fed slots on this bracket.</p>
        )}
        {/* Gold / Silver / Bronze side by side (JD, 2026-07-25). Stacked,
            28 slot rows ran the page to roughly eleven phone screens. Three
            columns turns it into three short lists you can compare across.
            One column on a phone — a dropdown inside a third of 390px is
            unusable, so the columns only appear once there's room. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3 items-start">
        {slotGroups.map((group) => (
          <div key={group.division} className="space-y-1">
            <h4 className="text-sm font-bold text-afa-navy">{group.division}</h4>
            <div className="space-y-2">
              {group.rows.map((row) => (
                <div
                  key={`${row.gameId}-${row.slot}`}
                  className={`text-sm border-b border-afa-navy/10 pb-2 space-y-1 ${
                    swapped.includes(`${row.gameId}-${row.slot}`)
                      ? "bg-afa-navy/5 rounded px-2 -mx-2"
                      : ""
                  }`}
                >
                  <div>
                    <span className="font-semibold text-afa-navy">
                      Game {row.round}
                    </span>{" "}
                    <span className="font-semibold">{row.seedRef}</span>{" "}
                    → {row.team ? row.team : <span className="text-afa-ink/50">not yet</span>}
                  </div>
                  <select
                    aria-label={`Seed for ${group.division} Game ${row.round}, currently ${row.seedRef}`}
                    className="w-full border border-afa-navy/30 rounded px-2 py-2"
                    value={row.seedRef}
                    disabled={busy}
                    onChange={(e) =>
                      remapSlot(row.gameId, row.slot, e.target.value === "" ? null : e.target.value)
                    }
                  >
                    <option value="">— none —</option>
                    {seedRefOptions.map((ref) => (
                      <option key={ref} value={ref}>
                        {optionLabel(ref)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
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
