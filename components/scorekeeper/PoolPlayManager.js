"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const POOL_LETTERS = ["A", "B", "C", "D", "E", "F"];

// Pool play (dispatch-brief-7) — separate, self-contained stage from the
// bracket engine (BracketManager untouched). Patterned on BracketManager's
// fetch/submit style: no optimistic magic, save, refetch, render.
export default function PoolPlayManager({ divisionId, poolGames }) {
  if (!poolGames || poolGames.length === 0) return null;

  const byPool = {};
  for (const g of poolGames) (byPool[g.pool] ??= []).push(g);

  return (
    <div className="chalk-panel space-y-4">
      <h2 className="font-bold text-afa-navy">Pool Play</h2>
      {POOL_LETTERS.filter((letter) => byPool[letter]?.length).map((letter) => (
        <div key={letter} className="space-y-2">
          <h3 className="text-sm font-bold text-afa-navy">Pool {letter}</h3>
          <div className="space-y-2">
            {byPool[letter].map((g) => (
              <PoolGameRow key={g.id} game={g} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PoolGameRow({ game }) {
  const router = useRouter();
  const [score1, setScore1] = useState(game.team1_score ?? "");
  const [score2, setScore2] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isFinal = game.status === "final";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/pool-games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1_score: Number(score1), team2_score: Number(score2) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save score");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/pool-games/${game.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not clear score");
      setScore1("");
      setScore2("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-afa-navy/10 rounded p-3 space-y-2">
      <p className="text-sm font-semibold">
        {game.team1_name} vs {game.team2_name}
      </p>
      <div className="grid grid-cols-2 gap-2 items-end">
        <label className="block">
          <span className="block text-xs font-semibold mb-1">{game.team1_name}</span>
          <input
            type="number"
            inputMode="numeric"
            className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg"
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
            className="w-full border border-afa-navy/30 rounded px-2 py-2 text-lg"
            value={score2}
            onChange={(e) => setScore2(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          disabled={busy || score1 === "" || score2 === ""}
          onClick={save}
          className="bg-afa-navy text-white font-bold py-3 rounded-lg disabled:opacity-40"
        >
          Save
        </button>
        {isFinal && (
          <button
            type="button"
            disabled={busy}
            onClick={clear}
            className="border border-afa-navy/30 text-afa-navy font-bold py-3 rounded-lg disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="text-afa-ink font-bold underline text-sm">{error}</p>}
    </div>
  );
}
