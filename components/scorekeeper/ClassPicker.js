"use client";

import { useState } from "react";
import { directorPost } from "./DirectorForm";

// Rating a person, or entering a team at a class. Same control both times,
// because it is the same decision at two scales.
//
// No confirm dialog here. A class is a value you change and change back —
// unlike a move or a merge, nothing else follows from it — and a prompt on
// every rating would make rating a whole roster miserable.
export default function ClassPicker({ label, classes, value, action, payload, hint }) {
  const [current, setCurrent] = useState(value ?? "");
  const [state, setState] = useState("idle");

  async function change(next) {
    const previous = current;
    setCurrent(next);
    setState("saving");
    const res = await directorPost({ ...payload, action, classId: next || null });
    if (res.error) {
      setCurrent(previous);
      setState("error");
      return;
    }
    setState("saved");
    setTimeout(() => setState("idle"), 1200);
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-strong">{label}</p>
        {state !== "idle" && (
          <span className="t-label">
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Did not save"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[{ id: "", name: "Not rated" }, ...classes].map((c) => (
          <button
            key={c.id || "none"}
            type="button"
            onClick={() => change(c.id)}
            className={
              "px-4 py-2 rounded-lg t-label border min-w-[4rem] " +
              (current === c.id
                ? "bg-afa-navy text-white border-afa-navy"
                : "border-afa-navy/20 text-afa-muted")
            }
          >
            {c.name}
          </button>
        ))}
      </div>
      {hint && <p className="t-meta">{hint}</p>}
    </div>
  );
}
