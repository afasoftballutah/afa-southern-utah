"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// A field you change where you read it. View is the value; tap to pick.
//
// JD, 2026-07-27: "make rating editable on click" / "can you give me the
// ability to modify M/F as well?" / "can we have basic confirms for changes
// (any)?"
export default function InlineSelect({
  action,
  payload,
  valueKey,
  value,
  options,
  label,
  subject,
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const pendingRef = useRef(null);

  async function save(next) {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action, [valueKey]: next || null }),
      });
      if (!res.ok) throw new Error();
      setCurrent(next);
      pendingRef.current = null;
      setEditing(false);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 2500);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const wording = (v) => (v ? v : "not set");

  return (
    <>
      {editing ? (
        <select
          value={current}
          autoFocus
          onChange={(e) => {
            pendingRef.current = e.target.value;
            setPending(e.target.value);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (pendingRef.current === null) setEditing(false);
            }, 0);
          }}
          aria-label={label}
          className={
            "w-full appearance-none rounded-lg bg-white border text-center text-[14px] leading-none py-1 px-1 cursor-pointer " +
            (failed
              ? "border-afa-red text-afa-red"
              : current
                ? "border-afa-navy/25 hover:border-afa-navy/50 text-afa-ink"
                : "border-afa-navy/25 hover:border-afa-navy/50 text-afa-muted")
          }
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          aria-label={label}
          onClick={() => setEditing(true)}
          className={
            "w-full rounded-lg text-center text-[14px] leading-none py-1 px-1 hover:bg-afa-navy/5 " +
            (failed
              ? "text-afa-red"
              : current
                ? "text-afa-ink"
                : "text-afa-muted")
          }
        >
          {current || "—"}
        </button>
      )}

      {pending !== null && (
        <ConfirmDialog
          title={`Change ${label}`}
          message={`Set ${label} for ${subject} to ${wording(pending)}? It is currently ${wording(current)}.`}
          confirmLabel="Change it"
          busy={busy}
          onConfirm={() => save(pending)}
          onCancel={() => {
            pendingRef.current = null;
            setPending(null);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
