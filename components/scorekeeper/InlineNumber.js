"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// A number you change where you read it. View is the number; tap to type.
//
// JD, 2026-07-27: "add columns M W ... after division. make them updatable."
export default function InlineNumber({ value, label, subject, action, valueKey, payload, width = "w-10" }) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  async function save(next) {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action,
          [valueKey]: next === "" ? null : Number(next),
        }),
      });
      if (!res.ok) throw new Error();
      setCurrent(next);
      setEditing(false);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 2500);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <>
      {editing ? (
        <input
          inputMode="numeric"
          value={current}
          aria-label={label}
          autoFocus
          onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            if (String(current) !== String(value ?? "")) setPending(current);
            else setEditing(false);
          }}
          className={
            width +
            " rounded-lg bg-white border text-center text-[14px] leading-none py-1 px-1 " +
            (failed
              ? "border-afa-red text-afa-red"
              : "border-afa-navy/25 hover:border-afa-navy/50 focus:border-afa-navy text-afa-ink")
          }
        />
      ) : (
        <button
          type="button"
          aria-label={label}
          onClick={() => setEditing(true)}
          className={
            width +
            " rounded-lg text-center text-[14px] leading-none py-1 px-1 tabular-nums hover:bg-afa-navy/5 " +
            (failed
              ? "text-afa-red"
              : current === "" || current == null
                ? "text-afa-muted"
                : "text-afa-ink")
          }
        >
          {current === "" || current == null ? "—" : current}
        </button>
      )}
      {pending !== null && (
        <ConfirmDialog
          title={`Change ${label}`}
          message={`${subject} needs ${pending === "" ? "no" : pending} ${label.toLowerCase()}? It is ${value == null ? "not set" : value} now.`}
          confirmLabel="Change it"
          busy={busy}
          onConfirm={() => save(pending)}
          onCancel={() => {
            setCurrent(value ?? "");
            setPending(null);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
