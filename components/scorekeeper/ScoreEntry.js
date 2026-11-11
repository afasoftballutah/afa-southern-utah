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

function digits(value) {
  if (value === "" || value == null) return "";
  return String(value).replace(/[^\d]/g, "");
}

function bump(value, delta) {
  const n = value === "" ? 0 : Number(value);
  const next = (Number.isFinite(n) ? n : 0) + delta;
  return String(Math.max(0, Math.min(99, next)));
}

/**
 * Scoreboard tiles: [− 5 +]. The number can be typed. −/+ always sit
 * inside the box. A check in a reserved slot confirms once both sides
 * have a number. A saved row stays locked until it's tapped again.
 */
export default function ScoreEntry({
  game,
  kind = "bracket",
  team1Name,
  team2Name,
  onSaved,
}) {
  const api = ENDPOINTS[kind] ?? ENDPOINTS.bracket;
  const saved =
    game.status === "final" && game.team1_score != null && game.team2_score != null;
  const [a, setA] = useState(game.team1_score ?? "");
  const [b, setB] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(false);
  const [editing, setEditing] = useState(!saved);

  const locked = saved && !editing;
  const dirty =
    String(a) !== String(game.team1_score ?? "") || String(b) !== String(game.team2_score ?? "");
  const ready = a !== "" && b !== "";
  const showConfirm = !locked && ready && (dirty || !saved);
  const showDone = saved && editing && !dirty;

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
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function unlock() {
    if (locked) setEditing(true);
  }

  function onBox(side, value) {
    unlock();
    const next = digits(value);
    if (side === "a") setA(next);
    else setB(next);
  }

  function onStep(side, delta) {
    unlock();
    if (side === "a") setA((v) => bump(v, delta));
    else setB((v) => bump(v, delta));
  }

  return (
    <span className={"sk-score" + (locked ? " is-locked" : "")}>
      <ScoreBox
        name={team1Name}
        value={a}
        locked={locked}
        busy={busy}
        onChange={(v) => onBox("a", v)}
        onStep={(d) => onStep("a", d)}
        onFocus={unlock}
      />
      <ScoreBox
        name={team2Name}
        value={b}
        locked={locked}
        busy={busy}
        onChange={(v) => onBox("b", v)}
        onStep={(d) => onStep("b", d)}
        onFocus={unlock}
      />
      <span className="sk-score__confirm-slot">
        {showConfirm ? (
          <button
            type="button"
            className="sk-score__confirm"
            aria-label="Confirm score"
            disabled={busy}
            onClick={() => post(api.body(a, b))}
          >
            {busy ? "…" : "✓"}
          </button>
        ) : showDone ? (
          <button
            type="button"
            className="sk-score__confirm is-done"
            aria-label="Done editing"
            onClick={() => setEditing(false)}
          >
            ✓
          </button>
        ) : null}
        {saved && editing ? (
          <button
            type="button"
            className="sk-score__clear"
            disabled={busy}
            onClick={() => setAsk(true)}
          >
            Clear
          </button>
        ) : null}
      </span>
      {error ? <span className="sk-score__error">{error}</span> : null}
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

function ScoreBox({ name, value, locked, busy, onChange, onStep, onFocus }) {
  return (
    <span className={"sk-score__tile" + (locked ? " is-locked" : "")}>
      <button
        type="button"
        className="sk-score__step"
        aria-label={`Decrease ${name} score`}
        disabled={busy}
        tabIndex={locked ? -1 : 0}
        onClick={() => onStep(-1)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${name} score`}
        className="sk-score__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        readOnly={locked}
        disabled={busy}
        maxLength={2}
      />
      <button
        type="button"
        className="sk-score__step"
        aria-label={`Increase ${name} score`}
        disabled={busy}
        tabIndex={locked ? -1 : 0}
        onClick={() => onStep(1)}
      >
        +
      </button>
    </span>
  );
}
