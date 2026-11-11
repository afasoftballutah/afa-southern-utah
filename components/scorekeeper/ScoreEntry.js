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

function Caret({ dir }) {
  const up = dir === "up";
  return (
    <svg viewBox="0 0 12 8" width="10" height="6" aria-hidden="true" focusable="false">
      {up ? (
        <path d="M6 1.2 L11 6.8 H1 Z" fill="currentColor" />
      ) : (
        <path d="M1 1.2 H11 L6 6.8 Z" fill="currentColor" />
      )}
    </svg>
  );
}

/**
 * Compact score boxes until the row is active. Then a standard stepper:
 * the number on the left, up/down arrows stacked on the right edge of
 * the same box. A check confirms once both sides have a number. A
 * saved row stays locked until it's tapped again.
 */
export default function ScoreEntry({
  game,
  kind = "bracket",
  team1Name,
  team2Name,
  onSaved,
  active = false,
  onActivate,
}) {
  const api = ENDPOINTS[kind] ?? ENDPOINTS.bracket;
  const saved =
    game.status === "final" && game.team1_score != null && game.team2_score != null;
  const [a, setA] = useState(game.team1_score ?? "");
  const [b, setB] = useState(game.team2_score ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(false);

  const locked = saved && !active;
  const dirty =
    String(a) !== String(game.team1_score ?? "") || String(b) !== String(game.team2_score ?? "");
  const ready = a !== "" && b !== "";
  const showConfirm = active && ready && (dirty || !saved);
  const showDone = saved && active && !dirty;

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
      onActivate?.(null);
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function activate() {
    if (!active) onActivate?.();
  }

  function onBox(side, value) {
    activate();
    const next = digits(value);
    if (side === "a") setA(next);
    else setB(next);
  }

  function onStep(side, delta) {
    activate();
    if (side === "a") setA((v) => bump(v, delta));
    else setB((v) => bump(v, delta));
  }

  return (
    <span className={"sk-score" + (active ? " is-active" : "") + (locked ? " is-locked" : "")}>
      <ScoreBox
        name={team1Name}
        value={a}
        active={active}
        locked={locked}
        busy={busy}
        onChange={(v) => onBox("a", v)}
        onStep={(d) => onStep("a", d)}
        onActivate={activate}
      />
      <ScoreBox
        name={team2Name}
        value={b}
        active={active}
        locked={locked}
        busy={busy}
        onChange={(v) => onBox("b", v)}
        onStep={(d) => onStep("b", d)}
        onActivate={activate}
      />
      {active ? (
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
              onClick={() => onActivate?.(null)}
            >
              ✓
            </button>
          ) : null}
          {saved ? (
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

function ScoreBox({ name, value, active, locked, busy, onChange, onStep, onActivate }) {
  return (
    <span
      className={"sk-score__tile" + (active ? " is-active" : "") + (locked ? " is-locked" : "")}
      onClick={onActivate}
    >
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${name} score`}
        className="sk-score__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onActivate}
        readOnly={locked}
        disabled={busy}
        maxLength={2}
      />
      {active ? (
        <span className="sk-score__spin">
          <button
            type="button"
            className="sk-score__step sk-score__step--up"
            aria-label={`Increase ${name} score`}
            disabled={busy}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onStep(1);
            }}
          >
            <Caret dir="up" />
          </button>
          <button
            type="button"
            className="sk-score__step sk-score__step--down"
            aria-label={`Decrease ${name} score`}
            disabled={busy}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1);
            }}
          >
            <Caret dir="down" />
          </button>
        </span>
      ) : null}
    </span>
  );
}
