"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import { parseSeedRef } from "@/lib/bracket/seed";

// Seeding (dispatch-brief-22): "machine proposes, director disposes."
// Standings compute; ties are surfaced for the director to settle and are
// NEVER broken automatically by run differential, head-to-head, or name
// order (afa-spec.md). This panel computes and previews in dry-run on
// load and after every change; nothing writes until the director presses
// Apply seeding.
//
// One pool card IS the seeding interface (dispatch-brief-26): a team's
// finish position in its pool already decides which bracket it enters, so
// the standings row and the seed row are the same row. There is no
// separate "Seeds -> slots" table anymore — its destination control now
// lives inline on each team's own line.

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

function PoolCard({ letter, pool, order, slotBySeedRef, swappedSeedRefs, busy, onReorder, onOpenPicker }) {
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
    <Card className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[.09em] text-afa-navy">Pool {letter}</h3>
        <span className="text-[11px] font-semibold text-afa-muted">
          {pool.complete ? "Final" : `${pool.remaining} of ${pool.total} left`}
        </span>
      </div>

      {/* Columns are labelled ONCE at the top of the pool so no row has to
          carry a unit, which is what makes a one-line row fit. PCT is
          gone: in a two-game pool it restates W-L, and it was the column
          squeezing the names (redesign spec 4). */}
      <div className="grid grid-cols-[17px_minmax(0,1fr)_34px_26px_98px] items-center gap-x-2 pb-1.5 text-[9.5px] font-bold uppercase tracking-[.07em] text-afa-muted border-b border-afa-navy/10">
        <span />
        <span>Team</span>
        <span className="text-right">W&ndash;L</span>
        <span className="text-right">RA</span>
        <span className="pl-0.5">Seeded to</span>
      </div>

      <div>
        {groups.map((g) => {
          // An incomplete pool shows standings, never seeding controls —
          // there is nothing to seed yet, and W-L can still change.
          const tied = pool.complete && g.teams.length > 1;
          return (
            <div key={g.rank} className={tied ? "-mx-1.5 rounded-[11px] bg-afa-navy/[0.045] px-1.5 py-0.5" : ""}>
              {tied && (
                <p className="px-0.5 pt-1.5 pb-0.5 text-[9.5px] font-bold uppercase tracking-[.07em] text-afa-navy/80">
                  Tied at {standingsByTeam.get(g.teams[0]).w}&ndash;{standingsByTeam.get(g.teams[0]).l} &middot; you decide the order
                </p>
              )}
              {g.teams.map((team, idx) => {
                const info = standingsByTeam.get(team);
                // Canonical "A #1" — this component's own numbering, used
                // only as a lookup key and as the display label. Never
                // sent to the API: the stored seed_ref may or may not
                // carry brackets ("[A #1]"), and computeRemap's
                // swap-partner search is a strict string match against
                // whatever is already in the column, so every write below
                // uses current.raw, the exact string read back from the
                // server — never a reformatted one.
                const seedRef = pool.complete ? `${letter} #${seedNumberByTeam.get(team)}` : null;
                const current = seedRef ? slotBySeedRef[seedRef] : null;
                const highlighted = current ? swappedSeedRefs.has(current.raw) : false;
                const seedNo = seedNumberByTeam.get(team);
                return (
                  <div
                    key={team}
                    className={`grid grid-cols-[17px_minmax(0,1fr)_34px_26px_98px] items-center gap-x-2 min-h-11 py-1.5 border-b border-afa-navy/[0.07] last:border-0 ${
                      highlighted ? "rounded bg-afa-navy/10" : ""
                    }`}
                  >
                    <span className="text-right text-[12.5px] font-bold tabular-nums text-afa-navy/50">
                      {pool.complete ? seedNo : "\u00b7"}
                    </span>
                    <span className="min-w-0 break-words text-[15px] font-semibold leading-tight">{team}</span>
                    <span className="text-right text-[13.5px] font-semibold tabular-nums text-afa-ink/[0.78]">
                      {info.w}&ndash;{info.l}
                    </span>
                    <span className="text-right text-[13px] tabular-nums text-afa-muted">{info.ra}</span>

                    {/* The destination is what this screen PRODUCES, so it
                        gets a colour language keyed to the bracket names
                        the league already says out loud, not a fourth
                        native dropdown on a 280px card. Tapping it opens
                        the picker (redesign spec 3). */}
                    {current ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onOpenPicker({ seedRef, raw: current.raw, team, current })}
                        aria-label={`Destination for ${seedRef}, currently ${current.where}`}
                        className={`min-h-9 w-full rounded-lg px-1.5 text-[11px] font-bold uppercase tracking-[.04em] disabled:opacity-50 ${
                          TIER_CLASS[current.where.split(" ")[0]] ?? "bg-afa-navy/10 text-afa-navy"
                        }`}
                      >
                        {current.where}
                      </button>
                    ) : (
                      <span className="text-center text-[13px] text-afa-ink/20" title="Seeding opens when the pool is final">
                        &ndash;
                      </span>
                    )}

                    {tied && (
                      <span className="col-start-5 col-end-6 -mt-1 flex justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${team} up`}
                          disabled={idx === 0}
                          onClick={() => move(team, -1)}
                          className="min-h-8 min-w-8 rounded border border-afa-navy/30 text-xs font-bold text-afa-navy disabled:opacity-30"
                        >
                          &#9650;
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${team} down`}
                          disabled={idx === g.teams.length - 1}
                          onClick={() => move(team, 1)}
                          className="min-h-8 min-w-8 rounded border border-afa-navy/30 text-xs font-bold text-afa-navy disabled:opacity-30"
                        >
                          &#9660;
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
    </Card>
  );
}

// Gold, Silver and Bronze read as themselves rather than as three
// identical grey chips — muted metallics that sit quiet on cream and
// never fight navy.
const TIER_CLASS = {
  Gold: "bg-[#f7edcd] text-[#7a5c12]",
  Silver: "bg-[#e9edf2] text-[#46546a]",
  Bronze: "bg-[#f3e2d6] text-[#7b4a28]",
};

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
  // time. Refetches the dry-run preview so every row redraws with the
  // server's answer, not a local guess.
  // Seeds touched by the most recent swap, highlighted briefly so both
  // ends of the move are visible — even when they land in different pool
  // cards (dispatch-brief-26).
  const [swappedSeedRefs, setSwappedSeedRefs] = useState(new Set());
  // The seed whose destination the director is choosing. A sheet rather
  // than a <select>: a native dropdown cannot show which team currently
  // holds each slot without truncating it inside a 280px card.
  const [picker, setPicker] = useState(null);

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
      // A swap always moves TWO seeds. The API reports both slots it wrote
      // and the seed ref each now holds — mark those seeds so both rows
      // light up, wherever their pool card sits (JD, 2026-07-25).
      const touched = new Set((json.changed ?? []).map((c) => c.seedRef).filter(Boolean));
      setSwappedSeedRefs(touched);
      await fetchPreview(orders);
      if (touched.size) window.setTimeout(() => setSwappedSeedRefs(new Set()), 6000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // A row's destination <select> encodes its target slot as
  // "gameId::slot" — gameId is a uuid (dashes throughout), so "::" is the
  // separator, not "-". Picking an option performs the existing swap: the
  // TARGET is the chosen slot, the value written there is this row's own
  // seedRef.
  function handleRemap(seedRef, destValue) {
    const idx = destValue.lastIndexOf("::");
    if (idx === -1) return;
    const gameId = destValue.slice(0, idx);
    const slotSide = destValue.slice(idx + 2);
    remapSlot(gameId, slotSide, seedRef);
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
  // Where does each seed CURRENTLY feed, and by which exact slot (dispatch-
  // brief-26)? Picking a destination swaps the seed here from wherever it
  // is, so both the display and the <select>'s own value need the precise
  // gameId+slot, not just the human-readable "where."
  //
  // Keyed by the CANONICAL "A #1" (this component's own numbering, no
  // brackets, ever) so a pool row's rank always finds its slot regardless
  // of how the database happens to have stored that seed_ref — some
  // transcribed brackets carry the bracketed form "[A #1]" (dispatch-
  // brief-22's placeholder convention), and computeRemap's swap-partner
  // search (lib/bracket/seed.js) is a strict STRING match against the
  // column's existing value. `raw` is that exact stored string; every
  // remap request below sends `current.raw` back, never a reformatted
  // canonical string — reformatting it would make the swap-partner search
  // miss the seed's real current slot and duplicate it onto two slots
  // instead of moving it.
  const slotBySeedRef = {};
  for (const sl of slots) {
    if (!sl.seedRef) continue;
    const parsed = parseSeedRef(sl.seedRef);
    if (!parsed) continue;
    const key = `${parsed.pool} #${parsed.rank}`;
    slotBySeedRef[key] = {
      raw: sl.seedRef,
      gameId: sl.gameId,
      slot: sl.slot,
      where: `${sl.division} G${sl.round}`,
      team: sl.team || null,
    };
  }
  // Every seed-fed slot in the tournament is a valid destination for any
  // seed — a slot in a bracket a team "couldn't reach" is not a special
  // case (JD, 2026-07-25). Labelled with the team currently projected
  // there so a cross-bracket move reads as what it is.
  const seedFedSlotOptions = slots.map((sl) => ({
    value: `${sl.gameId}::${sl.slot}`,
    who: sl.team || "not yet decided",
    label: `${sl.division} G${sl.round} — ${sl.team || "not yet decided"}`,
    // The slot on its own, for the one option a row renders as its
    // current destination (see the option list below).
    slot: `${sl.division} G${sl.round}`,
  }));

  return (
    <div className="chalk-panel space-y-4">
      <h2 className="font-bold text-afa-navy">Seed Brackets</h2>

      {swappedSeedRefs.size > 0 && (
        <p className="text-xs font-bold text-afa-navy">
          Swapped — the highlighted rows below moved.
        </p>
      )}

      {/* Three pool cards per line on desktop, one per line on a phone
          (dispatch-brief-26) — these carry controls and must stay
          thumb-usable, so the grid only kicks in once there's room. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {letters.map((letter) => (
          <PoolCard
            key={letter}
            letter={letter}
            pool={pools[letter]}
            order={orders[letter] ?? pools[letter].standings.map((t) => t.team)}
            slotBySeedRef={slotBySeedRef}

            swappedSeedRefs={swappedSeedRefs}
            busy={busy}
            onReorder={handleReorder}
            onOpenPicker={setPicker}
          />
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

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setPicker(null)}
            className="absolute inset-0 bg-afa-ink/30"
          />
          <div className="relative w-full max-h-[76vh] overflow-y-auto rounded-t-2xl bg-afa-cream p-4">
            <div className="mb-2">
              <p className="text-[17px] font-semibold">{picker.team}</p>
              <p className="text-sm text-afa-muted">
                {picker.seedRef} &middot; currently {picker.current.where}
              </p>
            </div>
            {["Gold", "Silver", "Bronze"].map((tier) => {
              const list = seedFedSlotOptions.filter((o) => o.slot.startsWith(tier));
              if (!list.length) return null;
              return (
                <div key={tier}>
                  <p className="px-1 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-[.09em] text-afa-muted">
                    {tier} bracket
                  </p>
                  {list.map((opt, i) => {
                    const isCurrent = opt.value === `${picker.current.gameId}::${picker.current.slot}`;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const p = picker;
                          setPicker(null);
                          if (!isCurrent) handleRemap(p.raw, opt.value);
                        }}
                        className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left disabled:opacity-50"
                      >
                        {/* The second side of a game reads as the
                            opponent's line rather than repeating the game
                            name — "Silver G4" holds two seeds because two
                            teams play Silver game 4. */}
                        <span
                          className={`w-[92px] shrink-0 rounded-lg px-1.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-[.04em] ${
                            TIER_CLASS[tier]
                          }`}
                        >
                          {i > 0 && list[i - 1].slot === opt.slot ? <i className="not-italic opacity-60">vs</i> : opt.slot}
                        </span>
                        <span className="min-w-0 break-words text-[14.5px]">
                          {opt.who === picker.team ? <i className="text-afa-muted">stays here</i> : opt.who}
                        </span>
                        {isCurrent && <span className="ml-auto text-afa-navy">&#10003;</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
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
