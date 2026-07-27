"use client";

import { useEffect, useState } from "react";

// OK or Check. Tap it to see the roster.
//
// JD, 2026-07-27, on the paragraph this replaces: "this is claude nonsense
// speak. Give me a visual alert pill that says 'OK' or 'Check' and when
// clicked on shows the issue in a popup roster list."
//
// A director scanning twenty teams needs one glyph per team, not a sentence
// each. The sentence is still there — it just waits until someone asks, and
// when they do, the answer is the ROSTER with the offending players marked,
// because that is the thing they are about to act on.
export default function EligibilityPill({ teamName, enteredClass, suggestedClass, check, composition, roster }) {
  const [open, setOpen] = useState(false);

  // Escape closes it. A modal you cannot dismiss with the keyboard is a modal
  // that traps someone mid-task.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // One pill, two questions: is this roster legal for the class, and does it
  // have enough men and women for the division. Either failing means Check.
  const classOk = check?.ok !== false;
  const compOk = composition?.ok !== false;
  const ok = classOk && compOk;
  const label = ok ? "OK" : "Check";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "px-3 py-1 rounded-full t-label border " +
          (ok
            ? "bg-afa-navy/5 border-afa-navy/20 text-afa-navy"
            : "bg-afa-red text-white border-afa-red")
        }
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-md max-h-[85vh] overflow-y-auto p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="team-name text-lg">{teamName}</p>
                <p className="t-meta">
                  {enteredClass ? `Entered as ${enteredClass}` : "Not entered at a class"}
                  {suggestedClass && ` · roster fits ${suggestedClass}`}
                </p>
              </div>
              <button type="button" className="t-label underline shrink-0" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <div className={"rounded-lg p-3 space-y-1 " + (ok ? "bg-afa-navy/[0.05]" : "bg-afa-red/10")}>
              <p className={classOk ? "t-body" : "t-strong"}>
                {classOk ? "☑" : "☐"} {enteredClass ?? suggestedClass ?? "Class"} allows{" "}
                {check?.limit ?? "this roster"}
                {!classOk && check.over.length > 0 && ` — too many ${check.over.join(", ")}`}
              </p>
              {composition && (composition.minMen != null || composition.minWomen != null) && (
                <p className={compOk ? "t-body" : "t-strong"}>
                  {compOk ? "☑" : "☐"} Needs {composition.minMen ?? 0} men and{" "}
                  {composition.minWomen ?? 0} women — has {composition.men} and {composition.women}
                  {composition.unknown > 0 && `, ${composition.unknown} not recorded`}
                </p>
              )}
            </div>

            <ul className="divide-y divide-black/5">
              {roster.map((m) => {
                const flagged = !classOk && check.over.includes(m.rating);
                return (
                  <li
                    key={m.id}
                    className={
                      "flex items-center justify-between gap-3 px-1 py-2 " +
                      (flagged ? "bg-afa-red/10 rounded" : "")
                    }
                  >
                    <span className="t-body truncate">{m.name}</span>
                    <span className="shrink-0 flex items-center gap-2">
                      <span
                        className={
                          "t-label " +
                          (m.gender ? "text-afa-navy" : "text-afa-muted")
                        }
                      >
                        {m.gender ?? "—"}
                      </span>
                      <span
                        className={
                          "t-label w-16 text-right " +
                          (flagged ? "text-afa-red" : m.rating ? "text-afa-navy" : "text-afa-muted")
                        }
                      >
                        {m.rating ?? "unranked"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
