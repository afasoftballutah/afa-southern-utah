"use client";

import { useState } from "react";

// A field you change where you read it.
//
// JD, 2026-07-27: "make rating editable on click" / "can you give me the
// ability to modify M/F as well?"
//
// A <select> rather than a row of buttons: one tap on a phone, arrow keys on
// a laptop, and it is the control every director has already used in a
// spreadsheet. Buttons would need six per row and would turn a scannable
// table into a wall.
//
// Saves on change with no confirm. These are values you set and re-set —
// nothing follows from either that a second change cannot undo — and a prompt
// per player would make working down a roster of twelve unbearable. A
// rejected save puts the old value back, because a control that keeps a value
// the server refused is worse than one that visibly refuses.
export default function InlineSelect({ action, payload, valueKey, value, options, label }) {
  const [current, setCurrent] = useState(value ?? "");
  const [state, setState] = useState("idle");

  async function change(next) {
    const previous = current;
    setCurrent(next);
    setState("saving");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action, [valueKey]: next || null }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      setTimeout(() => setState("idle"), 900);
    } catch {
      setCurrent(previous);
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <select
      value={current}
      onChange={(e) => change(e.target.value)}
      aria-label={label}
      // appearance-none drops the native arrow, which is what makes a select
      // in a table cell tall and wide. It still opens on click.
      className={
        "w-full appearance-none rounded bg-transparent border text-center text-[15px] leading-none py-1 px-0 cursor-pointer " +
        (state === "error"
          ? "border-afa-red text-afa-red"
          : state === "saving"
            ? "border-afa-navy/30 text-afa-muted"
            : current
              ? "border-transparent hover:border-afa-navy/30 text-afa-ink"
              : "border-transparent hover:border-afa-navy/30 text-afa-muted")
      }
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
