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
 * One-line scores: type in the box, or dial with +/− when the row is
 * active. A check confirms once both sides have a number. A saved row
 * stays locked until it's tapped again.
 */
export default function ScoreEntry({
  game,
  kind = "bracket",
  team1Name,
  team2Name,
  onSaved,
  startActive = false,
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
  const [active, setActive] = useState(Boolean(startActive) && !saved);

  const dirty =
    String(a) !== String(game.team1_score ?? "") || String(b) !== String(game.team2_score ?? "");
  const ready = a !== "" && b !== "";

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
      setActive(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (saved && !editing) {
    return (
      <button
        type="button"
        className="sk-score sk-score--locked"
        aria-label={`Edit score ${game.team1_score}–${game.team2_score}`}
        onClick={() => {
          setEditing(true);
          setActive(true);
        }}
      >
        <span className="sk-score__value">{game.team1_score}</span>
        <span className="sk-score__value">{game.team2_score}</span>
      </button>
    );
  }

  function onBox(side, value) {
    const next = digits(value);
    if (side === "a") setA(next);
    else setB(next);
    setActive(true);
  }

  const showConfirm = ready && (dirty || !saved);
  const showDone = saved && editing && !dirty;

  return (
    <span className={"sk-score" + (active ? " is-active" : "")}>
      <ScoreBox
        name={team1Name}
        value={a}
        active={active}
        busy={busy}
        onChange={(v) => onBox("a", v)}
        onStep={(d) => {
          setA((v) => bump(v, d));
          setActive(true);
        }}
        onFocus={() => setActive(true)}
      />
      <ScoreBox
        name={team2Name}
        value={b}
        active={active}
        busy={busy}
        onChange={(v) => onBox("b", v)}
        onStep={(d) => {
          setB((v) => bump(v, d));
          setActive(true);
        }}
        onFocus={() => setActive(true)}
      />
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
          onClick={() => {
            setEditing(false);
            setActive(false);
          }}
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

function ScoreBox({ name, value, active, busy, onChange, onStep, onFocus }) {
  return (
    <span className="sk-score__dial">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${name} score`}
        className="sk-score__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        disabled={busy}
        maxLength={2}
      />
      {active ? (
        <span className="sk-score__steps">
          <button
            type="button"
            className="sk-score__step"
            aria-label={`Decrease ${name} score`}
            disabled={busy}
            tabIndex={-1}
            onClick={() => onStep(-1)}
          >
            −
          </button>
          <button
            type="button"
            className="sk-score__step"
            aria-label={`Increase ${name} score`}
            disabled={busy}
            tabIndex={-1}
            onClick={() => onStep(1)}
          >
            +
          </button>
        </span>
      ) : null}
    </span>
  );
}
