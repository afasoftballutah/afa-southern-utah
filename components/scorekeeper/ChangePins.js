"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";

/**
 * Director-only: set separate PINs for control center vs field scorekeeper.
 * Opens as a modal so it doesn’t wreck the Control Center layout.
 */
export default function ChangePins() {
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState("scorekeeper");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasField, setHasField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function close() {
    if (busy) return;
    setOpen(false);
    setError("");
    setDone("");
    setCurrentPin("");
    setNewPin("");
    setConfirm("");
  }

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
        body: JSON.stringify({ currentPin, newPin, which }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save PIN");
      setDone(
        which === "scorekeeper"
          ? "Scorekeeper PIN saved."
          : "Director PIN saved."
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

  return (
    <>
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

      {open && (
        <Modal
          title="Staff PINs"
          subtitle="Director and field scorekeeper can use different codes."
          onClose={close}
          width="max-w-md"
          footer={
            <>
              <button
                type="button"
                className="btn-transient"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action"
                disabled={busy}
                onClick={save}
              >
                {busy ? "Saving…" : "Save PIN"}
              </button>
            </>
          }
        >
          <form onSubmit={save} className="space-y-4" id="staff-pins-form">
            {/* Which door */}
            <div>
              <p className="t-label mb-2">Change which PIN</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "scorekeeper",
                    title: "Scorekeeper",
                    hint: "Field · scores",
                  },
                  {
                    id: "director",
                    title: "Director",
                    hint: "Control center",
                  },
                ].map((opt) => {
                  const on = which === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setWhich(opt.id);
                        setDone("");
                        setError("");
                      }}
                      className={
                        "rounded-lg border-2 px-3 py-2.5 text-left transition-colors " +
                        (on
                          ? "border-afa-navy bg-afa-navy/[0.06]"
                          : "border-afa-navy/15 bg-white hover:border-afa-navy/30")
                      }
                    >
                      <span
                        className={
                          "block text-sm font-bold " +
                          (on ? "text-afa-navy" : "text-afa-ink")
                        }
                      >
                        {opt.title}
                      </span>
                      <span className="block t-meta text-[11px] mt-0.5">
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              {hasField === false && (
                <p className="t-meta text-[12px] mt-2 rounded-md bg-afa-soft-gray px-2.5 py-1.5">
                  No field PIN yet — scorekeeper still uses the director PIN
                  until you set one.
                </p>
              )}
              {hasField === true && (
                <p className="t-meta text-[12px] mt-2">
                  Field PIN is set (separate from director).
                </p>
              )}
            </div>

            {/* Fields */}
            <div className="space-y-3 rounded-lg border border-afa-navy/10 bg-afa-navy/[0.02] p-3">
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
                  autoFocus
                />
                <span className="t-meta text-[11px] mt-1 block">
                  Always required — proves you’re the director.
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="form-label">
                    New {which === "scorekeeper" ? "field" : "director"} PIN
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    className="form-field"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="4–8 digits"
                    required
                  />
                </label>
                <label className="block">
                  <span className="form-label">Confirm</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    className="form-field"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Again"
                    required
                  />
                </label>
              </div>
            </div>

            {error && (
              <p className="t-meta text-afa-red font-semibold">{error}</p>
            )}
            {done && (
              <p className="t-meta font-semibold text-emerald-800">{done}</p>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
