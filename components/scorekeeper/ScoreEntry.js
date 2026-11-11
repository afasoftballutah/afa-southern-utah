"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

const ENDPOINTS = {
  bracket: {
    url: (id) => `/api/scorekeeper/games/${id}/score`,
    body: (a, b) => ({ team1Score: Number(a), team2Score: Number(b) }),
  },
  pool: {
    url: (id) => `/api/scorekeeper/pool-games/${id}/score`,
    body: (a, b) => ({ team1_score: Number(a), team2_score: Number(b) }),
  },
};

/**
 * Two large numeric boxes and a Save that appears only once a number changes.
 * Clear lives behind a confirm on a finished game.
 */
export default function ScoreEntry({ game, kind = "bracket", team1Name, team2Name, onSaved }) {
  const api = ENDPOINTS[kind] ?? ENDPOINTS.bracket;
  const [a, setA] = useState(game.team1_score ?? "");
  const [b, setB] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(false);

  const dirty =
    String(a) !== String(game.team1_score ?? "") || String(b) !== String(game.team2_score ?? "");
  const ready = a !== "" && b !== "";
  const final = game.status === "final";

  async function post(payload) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.url(game.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save score");
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <span className="sk-score">
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${team1Name} score`}
        className="sk-score__input"
        value={a}
        onChange={(e) => setA(e.target.value)}
        disabled={busy}
      />
      <span className="sk-score__dash" aria-hidden="true">
        –
      </span>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${team2Name} score`}
        className="sk-score__input"
        value={b}
        onChange={(e) => setB(e.target.value)}
        disabled={busy}
      />
      {dirty && ready && (
        <button type="button" className="sk-score__save" disabled={busy} onClick={() => post(api.body(a, b))}>
          {busy ? "…" : "Save"}
        </button>
      )}
      {final && !dirty && (
        <button type="button" className="sk-score__clear" disabled={busy} onClick={() => setAsk(true)}>
          Clear
        </button>
      )}
      {error ? <span className="t-meta text-afa-red font-semibold">{error}</span> : null}
      {ask && (
        <ConfirmDialog
          title={`${team1Name} v ${team2Name}`}
          message={`Clear ${game.team1_score}–${game.team2_score}? Any later game already showing this result goes back to waiting.`}
          confirmLabel="Clear it"
          busy={busy}
          onConfirm={() => {
            setAsk(false);
            post({ clear: true });
          }}
          onCancel={() => setAsk(false)}
        />
      )}
    </span>
  );
}
