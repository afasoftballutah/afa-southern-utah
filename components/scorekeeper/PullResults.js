"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "I need a button or something on /scorekeeper" (JD, 2026-07-26).
//
// Most tournaments a director enters scores here and there is nothing to
// pull — this only does anything for an event the league also runs on
// QuickScores. So it sits quietly at the top of the scorekeeper's own
// screen: one press, and it says plainly what it changed or that there
// was nothing to change.
export default function PullResults() {
  const router = useRouter();
  const [state, setState] = useState(null); // null | "running" | report

  async function run() {
    setState("running");
    try {
      const res = await fetch("/api/scorekeeper/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not pull results");
      setState(json);
      router.refresh();
    } catch (err) {
      setState({ errors: [err.message], applied: 0, changes: [], unmatched: [] });
    }
  }

  const report = state && state !== "running" ? state : null;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={state === "running"}
          onClick={run}
          className="min-h-11 rounded-lg border border-afa-navy/25 bg-white px-4 text-sm font-bold text-afa-navy disabled:opacity-50"
        >
          {state === "running" ? "Pulling…" : "Pull results from QuickScores"}
        </button>
        {report && (
          <span className="text-sm text-afa-ink/70">
            {report.errors?.length
              ? report.errors.join("; ")
              : report.applied
                ? `Added ${report.applied} result${report.applied === 1 ? "" : "s"}.`
                : "Already up to date."}
          </span>
        )}
      </div>

      {/* Say WHAT changed, not just how many. A score appearing on a
          public page without anyone naming it is how a wrong one hides. */}
      {report?.changes?.length > 0 && (
        <ul className="text-sm text-afa-ink/70">
          {report.changes.map((c, i) => (
            <li key={i}>
              {c.division} {c.game} &rarr; <b className="text-afa-ink">{c.now}</b>
            </li>
          ))}
        </ul>
      )}

      {/* Anything it could NOT place, said out loud. A quiet skip reads
          exactly like a clean run, which is how five results sat missing
          while it reported "Already up to date". */}
      {report?.unmatched?.length > 0 && (
        <ul className="text-sm text-afa-ink/70">
          {report.unmatched.map((u, i) => (
            <li key={i}>
              <b className="text-afa-ink">Skipped</b> {u.division} {u.game} &mdash; {u.why}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
