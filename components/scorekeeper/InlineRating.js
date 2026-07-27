"use client";

import { useState } from "react";

// Rating, editable where you read it.
//
// JD, 2026-07-27: "make rating editable on click."
//
// A <select> rather than a row of buttons: it is one tap on a phone, one
// click plus arrow keys on a laptop, and it is the control every director has
// already used in a spreadsheet. Buttons would need six of them per row and
// would turn a scannable table into a wall.
//
// Saves on change with no confirm. A rating is a value you set and re-set —
// nothing follows from it that a second change cannot undo — and a prompt per
// player would make rating a roster of twelve unbearable.
const OPTIONS = ["A", "B", "C", "D", "E"];

export default function InlineRating({ playerId, value }) {
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
        body: JSON.stringify({ action: "setPlayerRating", playerId, rating: next || null }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      setTimeout(() => setState("idle"), 900);
    } catch {
      // Put it back. A control that silently keeps a value the server
      // rejected is worse than one that visibly refuses.
      setCurrent(previous);
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <select
      value={current}
      onChange={(e) => change(e.target.value)}
      aria-label="Rating"
      className={
        "w-full rounded px-1 py-1 text-[15px] text-center bg-transparent border " +
        (state === "error"
          ? "border-afa-red text-afa-red"
          : state === "saving"
            ? "border-afa-navy/30 text-afa-muted"
            : current
              ? "border-transparent hover:border-afa-navy/30 text-afa-navy font-semibold"
              : "border-transparent hover:border-afa-navy/30 text-afa-muted")
      }
    >
      <option value="">—</option>
      {OPTIONS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
