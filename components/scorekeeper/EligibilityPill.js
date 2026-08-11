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
export default function EligibilityPill({
  teamName,
  enteredClass,
  suggestedClass,
  check,
  composition,
  dualRoster,
  roster,
}) {
  const [open, setOpen] = useState(false);

  // Class legal, enough men/women, no suspended, no dual-roster flags.
  const classOk = check?.ok !== false;
  const compOk = composition?.ok !== false;
  const suspendedCount =
    composition?.suspendedCount ??
    (roster ?? []).filter((m) => m.suspended).length;
  const hasSuspended = suspendedCount > 0;
  const dualConflicts = dualRoster?.conflicts ?? [];
  const hasDual = dualConflicts.length > 0 || dualRoster?.ok === false;
  const ok = classOk && compOk && !hasSuspended && !hasDual;
  const label =
    ok
      ? "OK"
      : hasDual && classOk && compOk && !hasSuspended
        ? "Check"
        : hasSuspended && classOk && compOk && !hasDual
          ? "Susp."
          : "Check";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          <div
            className={
              "rounded-lg p-3 space-y-1 " +
              (ok ? "bg-afa-go/[0.08]" : "bg-afa-red/10")
            }
          >
            <p className={classOk ? "t-body" : "t-strong"}>
              <span className="tick">{classOk ? "☑" : "☐"}</span>{" "}
              {enteredClass ?? suggestedClass ?? "Class"} allows{" "}
              {check?.limit ?? "this roster"}
              {!classOk &&
                check.over.length > 0 &&
                ` — too many ${check.over.join(", ")}`}
            </p>
            {composition &&
              (composition.minMen != null || composition.minWomen != null) && (
                <p className={compOk ? "t-body" : "t-strong"}>
                  <span className="tick">{compOk ? "☑" : "☐"}</span> Needs{" "}
                  {composition.minMen ?? 0} men and {composition.minWomen ?? 0}{" "}
                  women — has {composition.men} and {composition.women}
                  {composition.unknown > 0 &&
                    `, ${composition.unknown} not recorded`}
                  {hasSuspended
                    ? ` (suspended excluded from count)`
                    : ""}
                </p>
              )}
            {hasSuspended && (
              <p className="t-strong">
                <span className="tick">☐</span> {suspendedCount} suspended
                player{suspendedCount === 1 ? "" : "s"} on roster — does not
                count toward requirements
              </p>
            )}
            {hasDual && (
              <p className="t-strong">
                <span className="tick">☐</span>{" "}
                {dualConflicts.length} player
                {dualConflicts.length === 1 ? "" : "s"} also on another
                same-gender team this tournament (Coed + Men/Women is OK)
              </p>
            )}
          </div>

          <ul className="divide-y divide-black/5 max-h-[45vh] overflow-y-auto">
            {roster.map((m) => {
              const dual =
                dualConflicts.find((c) => c.memberId === m.id) ||
                ((m.dualRosterTeams ?? []).length
                  ? {
                      memberId: m.id,
                      name: m.name,
                      otherTeams: m.dualRosterTeams,
                    }
                  : null);
              const flagged =
                !classOk && !m.suspended && check.over.includes(m.rating);
              const susp = Boolean(m.suspended);
              return (
                <li
                  key={m.id}
                  className={
                    "flex items-center justify-between gap-3 px-2 py-1.5 " +
                    (susp || dual || flagged ? "bg-afa-red/10 rounded" : "")
                  }
                >
                  <span className="t-body truncate min-w-0">
                    {m.name}
                    {susp ? (
                      <span className="t-meta text-afa-red font-semibold">
                        {" "}
                        · suspended
                      </span>
                    ) : null}
                    {dual ? (
                      <span className="t-meta text-afa-red font-semibold">
                        {" "}
                        · also on {dual.otherTeams.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 flex items-center gap-3">
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
                        (flagged || susp || dual
                          ? "text-afa-red"
                          : m.rating
                            ? "text-afa-navy"
                            : "text-afa-muted")
                      }
                    >
                      {susp
                        ? "susp."
                        : dual
                          ? "dual"
                          : m.rating ?? "unranked"}
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
