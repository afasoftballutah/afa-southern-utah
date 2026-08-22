"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DrawnBracket from "@/components/bracket/DrawnBracket";
import { LEAGUE_TZ } from "@/lib/bracket/tree";
import { formatGameWhenInput, parseGameWhenInput } from "@/lib/league-time";
import GameWhenInput from "./GameWhenInput";

// BracketEditor — the director's bracket. Same drawing the public sees,
// but tapping a game opens it for editing instead of showing what happens
// if you win it. One renderer, two verbs.
//
// Everything it writes already had a route: scores go through
// games/[id]/score (which propagates the winner forward via
// lib/bracket/propagate.js), field and time through games/[id]. Nothing
// here invents a new write path, and nothing here can change the bracket's
// SHAPE — who feeds whom is transcribed from the league's printed bracket
// and is not a director's call at a ballpark.

const PLACEHOLDER_RE = /^(Winner|Loser) of Game \d+$/;
const isPlaceholder = (n) => !!n && PLACEHOLDER_RE.test(n);

function whenLabel(iso) {
  if (!iso) return "no time set";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", timeZone: LEAGUE_TZ }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: LEAGUE_TZ })
  );
}

/**
 * Two games on the same field at the same minute cannot both happen.
 * Computed across EVERY game the director can see at once — all three
 * bracket stages, not just the one on screen — because the clash that
 * bites is Gold and Silver both claiming Field 4 at 9pm, and you would
 * never catch that looking at one bracket.
 */
function findConflicts(allGames) {
  const bySlot = new Map();
  for (const g of allGames) {
    if (!g.field || !g.scheduled_time) continue;
    const key = `${String(g.field).trim().toLowerCase()}@${g.scheduled_time}`;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(g);
  }
  const clashing = [];
  for (const [, group] of bySlot) if (group.length > 1) clashing.push(group);
  return clashing;
}

export default function BracketEditor({ stages, playDay = null }) {
  const router = useRouter();
  const [shownId, setShownId] = useState(stages?.[0]?.id ?? null);
  const [selected, setSelected] = useState(null); // game row
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ s1: "", s2: "", field: "", time: "" });

  const stage = stages?.find((s) => s.id === shownId) ?? stages?.[0] ?? null;
  const allGames = useMemo(() => (stages ?? []).flatMap((s) => s.games ?? []), [stages]);
  const clashes = useMemo(() => findConflicts(allGames), [allGames]);

  // Rounds to flag, but only for the bracket currently on screen — a
  // round number is only unique within its division.
  const conflictRounds = useMemo(() => {
    const ids = new Set(clashes.flat().map((g) => g.id));
    return new Set((stage?.games ?? []).filter((g) => ids.has(g.id)).map((g) => g.round));
  }, [clashes, stage]);

  function open(round) {
    const g = (stage?.games ?? []).find((x) => x.round === round);
    if (!g) return;
    setSelected(g);
    setError("");
    setDraft({
      s1: g.team1_score ?? "",
      s2: g.team2_score ?? "",
      field: g.field ?? "",
      time: formatGameWhenInput(g.scheduled_time, playDay),
    });
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: url.endsWith("/score") ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not save");
    return json;
  }

  async function saveScore() {
    setBusy(true);
    setError("");
    try {
      await post(`/api/scorekeeper/games/${selected.id}/score`, {
        team1Score: Number(draft.s1),
        team2Score: Number(draft.s2),
      });
      setSelected(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWhen() {
    setBusy(true);
    setError("");
    try {
      await post(`/api/scorekeeper/games/${selected.id}`, {
        field: draft.field || null,
        scheduledTime: parseGameWhenInput(draft.time, playDay)?.toISOString() ?? null,
      });
      setSelected(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Swapping two clashing games' times is the fix a director actually
  // reaches for, so it is one button rather than four edits.
  async function swapTimes(a, b) {
    setBusy(true);
    setError("");
    try {
      await post(`/api/scorekeeper/games/${a.id}`, {
        field: a.field,
        scheduledTime: b.scheduled_time,
      });
      await post(`/api/scorekeeper/games/${b.id}`, {
        field: b.field,
        scheduledTime: a.scheduled_time,
      });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!stages?.length) return <p className="text-sm text-afa-ink/60">No bracket games yet.</p>;

  const playable =
    selected && !isPlaceholder(selected.team1_name) && !isPlaceholder(selected.team2_name) &&
    selected.team1_name && selected.team2_name;

  return (
    <div className="space-y-3">
      {stages.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {stages.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={stage?.id === s.id}
              onClick={() => {
                setShownId(s.id);
                setSelected(null);
              }}
              className={[
                "rounded-lg px-3 text-xs font-bold uppercase tracking-wide",
                stage?.id === s.id ? "bg-afa-navy text-white" : "bg-afa-navy/5 text-afa-ink/70",
              ].join(" ")}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Clashes are stated ONCE, up top, across every stage — a director
          scrolling one bracket would never see that Gold and Silver both
          claim the same field at the same minute. */}
      {clashes.length > 0 && (
        <div className="rounded-xl border border-afa-red/30 bg-white p-3 space-y-2">
          <p className="text-sm font-bold text-afa-red">
            {clashes.length} field clash{clashes.length === 1 ? "" : "es"}
          </p>
          {clashes.map((group, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-afa-ink/70">
                {group[0].field} · {whenLabel(group[0].scheduled_time)} —{" "}
                {group.map((g) => `G${g.round}`).join(" and ")}
              </span>
              {group.length === 2 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => swapTimes(group[0], group[1])}
                  className="rounded-full border border-afa-navy/30 px-3 text-xs font-semibold text-afa-navy disabled:opacity-40"
                >
                  Swap their times
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm font-bold text-afa-ink underline">{error}</p>}

      {stage && (
        <DrawnBracket
          games={stage.games}
          division={stage.name}
          onSelectGame={open}
          selectedRound={selected?.round ?? null}
          conflictRounds={conflictRounds}
        />
      )}

      {/* The edit sheet. Scores and schedule save separately because they
          are different acts: a score finalises a game and propagates the
          winner forward, a time change never touches a result. */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-afa-navy/15 bg-white shadow-[0_-12px_40px_-14px_rgba(22,35,61,.35)]">
          <div className="mx-auto max-w-3xl space-y-3 p-4">
            <div className="flex items-baseline gap-2">
              <p className="font-bold text-afa-navy">Game {selected.round}</p>
              <p className="text-sm text-afa-ink/60">
                {stage.name} · {whenLabel(selected.scheduled_time)}
                {selected.field ? ` · ${selected.field}` : ""}
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto text-sm font-semibold text-afa-navy"
              >
                Close
              </button>
            </div>

            {playable ? (
              <div className="grid grid-cols-2 gap-2 items-end">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">{selected.team1_name}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded border border-afa-navy/30 px-2 text-lg"
                    value={draft.s1}
                    onChange={(e) => setDraft((d) => ({ ...d, s1: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">{selected.team2_name}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded border border-afa-navy/30 px-2 text-lg"
                    value={draft.s2}
                    onChange={(e) => setDraft((d) => ({ ...d, s2: e.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || draft.s1 === "" || draft.s2 === ""}
                  onClick={saveScore}
                  className="col-span-2 rounded-lg bg-afa-navy py-3 font-bold text-white disabled:opacity-40"
                >
                  {selected.status === "final" ? "Update score" : "Save score"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-afa-ink/60">
                Both teams have to be decided before this game can be scored.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold">Field</span>
                <input
                  className="w-full rounded border border-afa-navy/30 px-2"
                  value={draft.field}
                  onChange={(e) => setDraft((d) => ({ ...d, field: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold">Time</span>
                <GameWhenInput
                  playDay={playDay}
                  value={draft.time}
                  onChange={(time) => setDraft((d) => ({ ...d, time }))}
                  className="w-full rounded border border-afa-navy/30 px-2"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={saveWhen}
                className="col-span-2 rounded-lg border border-afa-navy/30 py-3 font-bold text-afa-navy disabled:opacity-40"
              >
                Save field &amp; time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
