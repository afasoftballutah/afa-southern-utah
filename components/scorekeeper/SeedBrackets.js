"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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

function PoolCard({ letter, pool, order, slotBySeedRef, swappedSeedRefs, proposedSeeds, busy, onReorder, onOpenPicker, games = [], filtered = false, readOnly, onGameSaved }) {
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
        <h3 className="h-sub">Pool {letter}</h3>
        <span
          className={`flex items-center gap-1.5 text-[11px] font-semibold ${
            readOnly ? "font-bold text-afa-navy" : "text-afa-muted"
          }`}
        >
          {readOnly ? (
            <>&#128274; Final</>
          ) : pool.complete ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[#46a06a]" />
              Final
            </>
          ) : (
            `${pool.remaining} game${pool.remaining === 1 ? "" : "s"} left`
          )}
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
                    data-seed={seedRef ?? undefined}
                    className={`grid grid-cols-[17px_minmax(0,1fr)_34px_26px_98px] items-center gap-x-2 min-h-11 py-1.5 border-b border-afa-navy/[0.07] last:border-0 ${
                      proposedSeeds?.has(seedRef)
                        ? "rounded bg-afa-navy/[0.07] ring-2 ring-afa-navy/40"
                        : highlighted
                        ? "rounded bg-afa-navy/10"
                        : ""
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

      {/* A pool is three teams AND the three games that decided them, so
          they live on one card. The standings above are computed from
          these scores; scoring the last one is what makes the pool final
          and opens its seeding (redesign spec 4). */}
      {games.length > 0 && (
        <div>
          <p className="pt-3.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[.07em] text-afa-muted">
            {filtered ? "Matching games" : "Games"}
          </p>
          <div className="space-y-1">
            {games.map((g) => (
              <PoolGameRow key={g.id} game={g} readOnly={readOnly} onSaved={onGameSaved} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * One game, one row per team, each team's score on its own row. A score
 * centred between two names is in the one place it can sit without
 * belonging to either. Save arrives when a number changes and leaves when
 * it is saved — there is no permanent Save on 28 rows waiting for an
 * event that rarely comes.
 */
function PoolGameRow({ game, readOnly, onSaved }) {
  const final = game.status === "final";
  const [s1, setS1] = useState(final ? String(game.team1_score) : "");
  const [s2, setS2] = useState(final ? String(game.team2_score) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = s1 !== (final ? String(game.team1_score) : "") || s2 !== (final ? String(game.team2_score) : "");
  const both = s1 !== "" && s2 !== "";
  const w1 = both && Number(s1) > Number(s2);
  const w2 = both && Number(s2) > Number(s1);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/scorekeeper/pool-games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1_score: Number(s1), team2_score: Number(s2) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const side = (name, val, set, won) => (
    <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2 py-[5px] pl-2.5 pr-1.5">
      <span
        className={`text-sm leading-tight [overflow-wrap:anywhere] ${
          won ? "font-semibold text-afa-ink" : "text-afa-ink/[0.58]"
        }`}
      >
        {name}
      </span>
      <input
        type="number"
        inputMode="numeric"
        placeholder="&ndash;"
        aria-label={`${name} score`}
        readOnly={readOnly}
        disabled={busy || readOnly}
        value={val}
        onChange={(e) => set(e.target.value)}
        className={`h-[34px] w-14 rounded-[7px] border border-transparent bg-afa-navy/[0.035] px-0.5 text-center text-[15px] font-semibold tabular-nums [appearance:textfield] focus:border-afa-navy focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-afa-navy/[0.16] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
          won ? "text-afa-ink" : "text-afa-ink/[0.55]"
        }`}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_62px] items-center gap-2 py-1">
      <div className="text-[10px] font-medium leading-tight text-afa-muted">
        <b className="font-bold text-afa-ink/50">{fieldAbbrev(game.field)}</b>
        <br />
        {shortTime(game.scheduled_time)}
      </div>
      <div className={`overflow-hidden rounded-[10px] border bg-white transition ${dirty ? "border-afa-navy/45 ring-[3px] ring-afa-navy/10" : "border-afa-navy/15"} divide-y divide-afa-navy/[0.07]`}>
        {side(game.team1_name, s1, setS1, w1)}
        {side(game.team2_name, s2, setS2, w2)}
      </div>
      <div>
        {dirty && both && !readOnly && (
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="h-9 rounded-full bg-afa-navy px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        )}
      </div>
      {err && <p className="col-span-3 text-xs font-bold text-afa-ink underline">{err}</p>}
    </div>
  );
}

/**
 * Field and time chips. During a tournament a director is standing at a
 * field working a time slot, not reading pool by pool — filtering to
 * "F3 · Fri 10p" turns nine cards into the two with a game on right now.
 * A pool with no matching game drops out entirely rather than sitting
 * there empty.
 */
function FilterChips({ label, value, options, format, onPick }) {
  if (options.length < 2) return null;
  const chip = (v, text) => (
    <button
      key={String(v)}
      type="button"
      aria-pressed={value === v}
      onClick={() => onPick(v)}
      className={`min-h-[30px] rounded-full px-[11px] text-xs font-semibold whitespace-nowrap transition ${
        value === v ? "bg-afa-navy text-white" : "bg-afa-navy/5 text-afa-ink/[0.72] hover:bg-afa-navy/10"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="pr-0.5 text-[9.5px] font-bold uppercase tracking-[.08em] text-afa-muted whitespace-nowrap">
        {label}
      </span>
      {chip(null, "All")}
      {options.map((o) => chip(o, format(o)))}
    </div>
  );
}

function fieldAbbrev(field) {
  if (!field) return "";
  const m = String(field).match(/\d+/);
  return m ? `F${m[0]}` : field;
}

function shortTime(iso) {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${h}${m ? ":" + String(m).padStart(2, "0") : ""}${d.getHours() < 12 ? "a" : "p"}`;
}

// Gold, Silver and Bronze read as themselves rather than as three
// identical grey chips — muted metallics that sit quiet on cream and
// never fight navy.
const TIER_CLASS = {
  Gold: "bg-[#f7edcd] text-[#7a5c12]",
  Silver: "bg-[#e9edf2] text-[#46546a]",
  Bronze: "bg-[#f3e2d6] text-[#7b4a28]",
};

export default function SeedBrackets({ divisionId, tournamentSlug, poolGames = [], readOnly = false }) {
  const router = useRouter();
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
  const [filter, setFilter] = useState({ field: null, time: null });
  // Nothing is written on selection. A swap is PROPOSED: both ends light
  // up, a dotted line is drawn between them wherever they sit, and the
  // director confirms. Every applied swap is then listed, undoable.
  const [proposal, setProposal] = useState(null);
  const [swaps, setSwaps] = useState([]);
  const [undoing, setUndoing] = useState(null);
  const [link, setLink] = useState(null);

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
  /* A swap always moves TWO seeds, so it is stated as both moves before
     either happens. The partner is whoever currently holds the seat being
     taken — read off the same slots list the picker was built from, never
     guessed. */
  function proposeSwap(pick, opt) {
    const idx = opt.value.lastIndexOf("::");
    const gameId = opt.value.slice(0, idx);
    const slotSide = opt.value.slice(idx + 2);
    const target = (result?.slots ?? []).find((sl) => sl.gameId === gameId && sl.slot === slotSide);
    if (!target) return;
    const targetLabel = `${target.division} G${target.round}`;
    const partnerSeed = target.seedRef ? seedLabelOf(target.seedRef) : null;
    setProposal({
      value: opt.value,
      a: { raw: pick.raw, seedRef: pick.seedRef, team: pick.team, from: pick.current.where, to: targetLabel },
      b: {
        raw: target.seedRef,
        seedRef: partnerSeed,
        team: target.team || "the seat's current holder",
        from: targetLabel,
        to: pick.current.where,
      },
      backValue: `${pick.current.gameId}::${pick.current.slot}`,
    });
  }

  async function commitSwap() {
    const p = proposal;
    setProposal(null);
    await remapSlot(...splitDest(p.value), p.a.raw);
    setSwaps((prev) => [{ id: `${Date.now()}-${p.a.raw}`, ...p }, ...prev]);
  }

  async function undoSwap(entry) {
    setUndoing(null);
    await remapSlot(...splitDest(entry.backValue), entry.a.raw);
    setSwaps((prev) => prev.filter((s) => s.id !== entry.id));
  }

  function splitDest(value) {
    const i = value.lastIndexOf("::");
    return [value.slice(0, i), value.slice(i + 2)];
  }

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

  // "[A #1]" or "A #1" -> "A #1", the canonical key the rows are drawn
  // with, so a proposal can find both of its ends in the DOM.
  function seedLabelOf(raw) {
    const parsed = parseSeedRef(raw);
    return parsed ? `${parsed.pool} #${parsed.rank}` : null;
  }

  /* The dotted line between the two rows of a proposed swap. Measured off
     the rendered rows rather than computed, because the two ends can sit
     in any two pool cards on the page — and redrawn on scroll and resize
     for the same reason. */
  useEffect(() => {
    if (!proposal) {
      setLink(null);
      return;
    }
    const draw = () => {
      const el = (ref) => document.querySelector(`[data-seed="${CSS.escape(ref)}"]`);
      const A = el(proposal.a.seedRef);
      const B = proposal.b.seedRef ? el(proposal.b.seedRef) : null;
      if (!A || !B) return setLink(null);
      const ra = A.getBoundingClientRect();
      const rb = B.getBoundingClientRect();
      const ca = { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2 };
      const cb = { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 };
      const [T, Bm] = ca.y <= cb.y ? [ra, rb] : [rb, ra];
      const p1 = { x: T.left + T.width / 2, y: T.bottom + 3 };
      const p2 = { x: Bm.left + Bm.width / 2, y: Bm.top - 3 };
      const bow = Math.max(24, (p2.y - p1.y) * 0.4);
      setLink(`M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + bow}, ${p2.x} ${p2.y - bow}, ${p2.x} ${p2.y}`);
    };
    draw();
    const on = () => requestAnimationFrame(draw);
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [proposal]);

  if (!result) {
    return (
      <div className="card p-4 space-y-2">
        <h2 className="h-section">Seed Brackets</h2>
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

  const fieldOptions = [...new Set(poolGames.map((g) => g.field).filter(Boolean))].sort();
  const timeOptions = [...new Set(poolGames.map((g) => g.scheduled_time).filter(Boolean))].sort();
  const filtering = Boolean(filter.field || filter.time);
  const matches = (g) =>
    (!filter.field || g.field === filter.field) && (!filter.time || g.scheduled_time === filter.time);
  const gamesFor = (letter) => poolGames.filter((g) => g.pool === letter && matches(g));
  // A pool with no game in the chosen slot is not shown as an empty card;
  // it is not part of the answer to "what is on Field 3 right now".
  const shownLetters = filtering ? letters.filter((l) => gamesFor(l).length > 0) : letters;
  const shownGames = shownLetters.reduce((n, l) => n + gamesFor(l).length, 0);

  return (
    <div className="card p-4 space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="h-section">Seed Brackets</h2>
        <span className="ml-auto text-[12.5px] text-afa-muted">
          {filtering
            ? `${shownGames} game${shownGames === 1 ? "" : "s"} in ${shownLetters.length} pool${
                shownLetters.length === 1 ? "" : "s"
              }`
            : `${letters.length} pool${letters.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {(fieldOptions.length > 1 || timeOptions.length > 1) && (
        <div className="flex gap-4 overflow-x-auto pb-0.5">
          <FilterChips
            label="Field"
            value={filter.field}
            options={fieldOptions}
            format={fieldAbbrev}
            onPick={(v) => setFilter((f) => ({ ...f, field: v }))}
          />
          <FilterChips
            label="Time"
            value={filter.time}
            options={timeOptions}
            format={shortTime}
            onPick={(v) => setFilter((f) => ({ ...f, time: v }))}
          />
        </div>
      )}

      {/* Every swap made this session, newest first, each one undoable.
          A change you cannot see you made is a change you cannot trust. */}
      {swaps.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-afa-navy/10 px-4 py-3">
            <h3 className="h-sub">Swaps this session</h3>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-afa-navy px-1.5 text-[11px] font-bold text-white">
              {swaps.length}
            </span>
          </div>
          {swaps.map((sw, i) => (
            <div key={sw.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 border-b border-afa-navy/10 px-4 py-3 last:border-0">
              <span className="text-right text-[11px] font-bold text-afa-muted tabular-nums">{swaps.length - i}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">
                  {sw.a.team} <span className="px-1 font-normal text-afa-muted">&#8644;</span> {sw.b.team}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-afa-muted">
                  <span><b className="font-semibold text-afa-ink/[0.66]">{sw.a.team}</b> {sw.a.from} &rarr; {sw.a.to}</span>
                  <span><b className="font-semibold text-afa-ink/[0.66]">{sw.b.team}</b> {sw.b.from} &rarr; {sw.b.to}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setUndoing(sw)}
                className="min-h-9 rounded-full border border-afa-ink/15 px-3.5 text-[12.5px] font-semibold text-afa-navy disabled:opacity-40"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {swappedSeedRefs.size > 0 && (
        <p className="text-xs font-bold text-afa-navy">
          Swapped — the highlighted rows below moved.
        </p>
      )}

      {/* Three pool cards per line on desktop, one per line on a phone
          (dispatch-brief-26) — these carry controls and must stay
          thumb-usable, so the grid only kicks in once there's room. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(372px,1fr))] gap-4 items-start">
        {shownLetters.map((letter) => (
          <PoolCard
            key={letter}
            letter={letter}
            pool={pools[letter]}
            order={orders[letter] ?? pools[letter].standings.map((t) => t.team)}
            slotBySeedRef={slotBySeedRef}

            swappedSeedRefs={swappedSeedRefs}
            proposedSeeds={
              proposal ? new Set([proposal.a.seedRef, proposal.b.seedRef].filter(Boolean)) : null
            }
            busy={busy}
            onReorder={handleReorder}
            onOpenPicker={setPicker}
            games={gamesFor(letter)}
            filtered={filtering}
            readOnly={readOnly}
            onGameSaved={() => {
              fetchPreview(orders);
              router.refresh();
            }}
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

      {/* The dotted line, drawn over the page so it can join two rows in
          different pool cards. */}
      {link && (
        <svg className="pointer-events-none fixed inset-0 z-40 h-screen w-screen" aria-hidden="true">
          <path d={link} fill="none" stroke="var(--afa-navy)" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.85" />
        </svg>
      )}

      {proposal && (
        <div role="alertdialog" aria-modal="true" aria-label="Confirm swap" className="fixed inset-x-0 bottom-0 z-50 bg-afa-navy text-white">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">Swap {proposal.a.team} and {proposal.b.team}?</p>
              <p className="text-sm text-white/70">
                {proposal.a.team} takes {proposal.a.to}. {proposal.b.team} takes {proposal.b.to}. Nothing is
                written until you confirm.
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setProposal(null)} disabled={busy} className="rounded-full border border-white/30 px-4 font-semibold">
                Cancel
              </button>
              <button type="button" data-swap-go onClick={commitSwap} disabled={busy} className="rounded-full bg-white px-4 font-semibold text-afa-navy disabled:opacity-50">
                {busy ? "Working…" : "Swap them"}
              </button>
            </div>
          </div>
        </div>
      )}

      {undoing && (
        <div role="alertdialog" aria-modal="true" aria-label="Confirm undo" className="fixed inset-x-0 bottom-0 z-50 bg-afa-navy text-white">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">Undo the swap of {undoing.a.team} and {undoing.b.team}?</p>
              <p className="text-sm text-white/70">
                {undoing.a.team} goes back to {undoing.a.from}. {undoing.b.team} goes back to {undoing.b.from}.
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setUndoing(null)} disabled={busy} className="rounded-full border border-white/30 px-4 font-semibold">
                Cancel
              </button>
              <button type="button" data-undo-go onClick={() => undoSwap(undoing)} disabled={busy} className="rounded-full bg-white px-4 font-semibold text-afa-navy disabled:opacity-50">
                {busy ? "Working…" : "Undo it"}
              </button>
            </div>
          </div>
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
                          if (!isCurrent) proposeSwap(p, opt);
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
