"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAGUE_TZ } from "@/lib/bracket/tree";

// Score entry for the three TRANSCRIBED brackets (Gold, Silver, Bronze —
// dispatch-brief-24). These divisions were transcribed straight off the
// league's printed bracket and deliberately have no `brackets` row, so
// BracketManager's "no bracket yet — Generate" screen would render for
// them (wrong, and its Generate button would try to build a NEW structure
// over live seeded games). This is a sibling component instead — it never
// creates, resizes, or reassigns a bracket, only scores the games that
// already exist and lets a save propagate forward via the existing
// app/api/scorekeeper/games/[id]/score route (unchanged scoring path,
// lib/bracket/propagate.js's propagateAfterFinalize).

const PLACEHOLDER_RE = /^(Winner|Loser) of Game \d+$/;
function isPlaceholder(name) {
  return !!name && PLACEHOLDER_RE.test(name);
}

function timeLabel(scheduledTime) {
  if (!scheduledTime) return null;
  const d = new Date(scheduledTime);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", timeZone: LEAGUE_TZ }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: LEAGUE_TZ })
  );
}

// Play order: scheduled_time, then printed game number (brief 24). Same
// time-grouped SHAPE as PoolPlayManager's groupByTime (dispatch-brief-21)
// duplicated in miniature — that component doesn't export its helpers, and
// this screen's within-group tie-break is the game number, not the field.
function groupByTime(games) {
  const byTime = new Map();
  for (const g of games) {
    const key = g.scheduled_time || null;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(g);
  }
  return [...byTime.entries()]
    .map(([time, groupGames]) => ({
      time,
      heading: time ? timeLabel(time) : "Time TBD",
      games: [...groupGames].sort((a, b) => a.round - b.round),
    }))
    .sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : Infinity;
      const tb = b.time ? new Date(b.time).getTime() : Infinity;
      return ta - tb;
    });
}

export default function BracketScores({ games }) {
  const router = useRouter();
  const groups = groupByTime(games ?? []);

  if (groups.length === 0) {
    return (
      <div className="chalk-panel">
        <p className="text-sm text-afa-ink/70">No bracket games yet.</p>
      </div>
    );
  }

  return (
    <div className="chalk-panel space-y-4">
      <h2 className="font-bold text-afa-navy">Bracket</h2>
      {groups.map((group) => (
        <div key={group.time ?? "__tbd__"} className="space-y-2">
          <h3 className="text-sm font-bold text-afa-navy">
            {group.heading}{" "}
            <span className="font-normal text-afa-ink/50">
              ({group.games.length} game{group.games.length === 1 ? "" : "s"})
            </span>
          </h3>
          <div className="space-y-2">
            {group.games.map((g) => (
              <BracketGameRow key={g.id} game={g} onChanged={() => router.refresh()} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BracketGameRow({ game, onChanged }) {
  const [score1, setScore1] = useState(game.team1_score ?? "");
  const [score2, setScore2] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const t1Ready = Boolean(game.team1_name) && !isPlaceholder(game.team1_name);
  const t2Ready = Boolean(game.team2_name) && !isPlaceholder(game.team2_name);
  const isFinal = game.status === "final";
  // Not-yet-playable: either side is still a feed placeholder ("Winner of
  // Game 5") rather than a real team — never offer inputs that would score
  // a phantom (brief 24, verification item 6).
  const playable = t1Ready && t2Ready && game.status === "pending";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Score: Number(score1), team2Score: Number(score2) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save score");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm(`Clear the score for Game ${game.round}? This also reverts any game that already shows this result.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not clear score");
      setScore1("");
      setScore2("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-afa-navy/10 rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-bold text-afa-navy">Game {game.round}</span>{" "}
          <span className="text-afa-ink/60">{game.field || "Field TBD"}</span>
        </p>
        {isFinal && (
          <span className="text-sm text-afa-ink/70">
            {game.team1_score}–{game.team2_score}
          </span>
        )}
      </div>

      <p className="text-sm font-semibold">
        {game.team1_name || "TBD"} vs {game.team2_name || "TBD"}
      </p>

      {!playable && !isFinal && (
        <p className="text-xs text-afa-ink/50">Not yet playable — waiting on an earlier game.</p>
      )}

      {playable && (
        <div className="grid grid-cols-2 gap-2 items-end">
          <label className="block">
            <span className="block text-xs font-semibold mb-1">{game.team1_name}</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg min-h-11"
              value={score1}
              onChange={(e) => setScore1(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1">{game.team2_name}</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg min-h-11"
              value={score2}
              onChange={(e) => setScore2(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy || score1 === "" || score2 === ""}
            onClick={save}
            className="col-span-2 bg-afa-navy text-white font-bold py-3 rounded-lg disabled:opacity-40 min-h-11"
          >
            Submit Score
          </button>
        </div>
      )}

      {isFinal && (
        <button
          type="button"
          disabled={busy}
          onClick={clear}
          className="border border-afa-navy/30 text-afa-navy font-bold py-3 rounded-lg disabled:opacity-40 w-full min-h-11"
        >
          Clear
        </button>
      )}

      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
    </div>
  );
}
