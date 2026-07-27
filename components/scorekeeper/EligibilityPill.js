"use client";

import { useState } from "react";
import Modal from "./Modal";

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
        // .pill first, so it is the same shape and height as every other row
        // action; the utilities after it only recolour. Its own rounded-full
        // button was a <button> without .pill, so the global 44px thumb-target
        // rule applied and a two-letter label came out as a circle.
        className={
          "pill " +
          (ok
            ? "bg-afa-go/10 border-afa-go/40 text-afa-go"
            : "bg-afa-red border-afa-red text-white")
        }
      >
        {label}
      </button>

      {open && (
        <Modal
          title={teamName}
          subtitle={[
            enteredClass ? `Entered as ${enteredClass}` : "Not entered at a class",
            suggestedClass ? `roster fits ${suggestedClass}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          onClose={() => setOpen(false)}
        >
          <div className={"rounded-lg p-3 space-y-1 " + (ok ? "bg-afa-go/[0.08]" : "bg-afa-red/10")}>
            <p className={classOk ? "t-body" : "t-strong"}>
              <span className="tick">{classOk ? "☑" : "☐"}</span>{" "}
              {enteredClass ?? suggestedClass ?? "Class"} allows {check?.limit ?? "this roster"}
              {!classOk && check.over.length > 0 && ` — too many ${check.over.join(", ")}`}
            </p>
            {composition && (composition.minMen != null || composition.minWomen != null) && (
              <p className={compOk ? "t-body" : "t-strong"}>
                <span className="tick">{compOk ? "☑" : "☐"}</span> Needs {composition.minMen ?? 0} men
                and {composition.minWomen ?? 0} women — has {composition.men} and {composition.women}
                {composition.unknown > 0 && `, ${composition.unknown} not recorded`}
              </p>
            )}
          </div>

          <ul className="divide-y divide-black/5 max-h-[45vh] overflow-y-auto">
            {roster.map((m) => {
              const flagged = !classOk && check.over.includes(m.rating);
              return (
                <li
                  key={m.id}
                  className={
                    "flex items-center justify-between gap-3 px-2 py-1.5 " +
                    (flagged ? "bg-afa-red/10 rounded" : "")
                  }
                >
                  <span className="t-body truncate">{m.name}</span>
                  <span className="shrink-0 flex items-center gap-3">
                    <span className={"t-label " + (m.gender ? "text-afa-navy" : "text-afa-muted")}>
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
        </Modal>
      )}
    </>
  );
}
