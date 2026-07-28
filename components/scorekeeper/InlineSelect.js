"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// A field you change where you read it — and it asks before it changes.
//
// JD, 2026-07-27: "make rating editable on click" / "can you give me the
// ability to modify M/F as well?" / "can we have basic confirms for changes
// (any)?"
//
// I had argued against confirming here, on the grounds that rating a roster
// of twelve would be miserable. He asked for it anyway, and he is the one
// doing it twenty times a morning: a wrong rating changes which class a team
// is eligible for, and silence is the wrong default for that.
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
      <select
        value={current}
        onChange={(e) => setPending(e.target.value)}
        aria-label={label}
        // appearance-none drops the native arrow, which is what makes a
        // select in a table cell tall and wide. It still opens on click.
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

      {pending !== null && (
        <ConfirmDialog
          title={`Change ${label}`}
          message={`Set ${label} for ${subject} to ${wording(pending)}? It is currently ${wording(current)}.`}
          confirmLabel="Change it"
          busy={busy}
          onConfirm={() => save(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
