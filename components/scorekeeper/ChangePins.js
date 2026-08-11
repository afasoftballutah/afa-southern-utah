"use client";

import { useEffect, useState } from "react";

/**
 * Director-only: set separate PINs for control center vs field scorekeeper.
 */
export default function ChangePins() {
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState("scorekeeper"); // default: set field PIN
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasField, setHasField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/scorekeeper/change-pin")
      .then((r) => r.json())
      .then((j) => setHasField(Boolean(j.hasFieldPin)))
      .catch(() => setHasField(null));
  }, [open]);

  async function save(e) {
    e.preventDefault();
    setError("");
    setDone("");
    if (newPin !== confirm) {
      setError("New PIN and confirm do not match");
      return;
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      setError("New PIN must be 4–8 digits");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/scorekeeper/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPin,
          newPin,
          which,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save PIN");
      setDone(
        which === "scorekeeper"
          ? "Scorekeeper (field) PIN updated."
          : "Director PIN updated."
      );
      setCurrentPin("");
      setNewPin("");
      setConfirm("");
      setHasField(Boolean(json.hasFieldPin));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-transient text-sm"
        onClick={() => {
          setOpen(true);
          setError("");
          setDone("");
        }}
      >
        Staff PINs
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3 max-w-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="t-strong">Staff PINs</p>
          <p className="t-meta text-[12px]">
            Director and scorekeeper can use different PINs. You must enter the
            current <strong>director</strong> PIN to change either one.
          </p>
          {hasField === false && (
            <p className="t-meta text-[12px] text-afa-red font-semibold mt-1">
              No field PIN yet — scorekeeper still accepts the director PIN until
              you set one below.
            </p>
          )}
          {hasField === true && (
            <p className="t-meta text-[12px] mt-1">Field PIN is set (separate from director).</p>
          )}
        </div>
        <button
          type="button"
          className="t-label underline text-afa-muted"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      <form onSubmit={save} className="space-y-3">
        <fieldset>
          <legend className="t-label mb-1.5">Which PIN to change</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={
                "pill " +
                (which === "scorekeeper"
                  ? "bg-afa-navy text-white border-afa-navy"
                  : "")
              }
              onClick={() => setWhich("scorekeeper")}
            >
              Scorekeeper (field)
            </button>
            <button
              type="button"
              className={
                "pill " +
                (which === "director"
                  ? "bg-afa-navy text-white border-afa-navy"
                  : "")
              }
              onClick={() => setWhich("director")}
            >
              Director
            </button>
          </div>
        </fieldset>

        <label className="block">
          <span className="form-label">Current director PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            className="form-field"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="form-label">
            New {which === "scorekeeper" ? "scorekeeper" : "director"} PIN
            (4–8 digits)
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="form-field"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="form-label">Confirm new PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="form-field"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>

        {error && (
          <p className="t-meta text-afa-red font-semibold">{error}</p>
        )}
        {done && (
          <p className="t-meta text-emerald-800 font-semibold">{done}</p>
        )}

        <button type="submit" className="btn-action" disabled={busy}>
          {busy ? "Saving…" : "Save PIN"}
        </button>
      </form>
    </div>
  );
}
