"use client";

import { useState } from "react";
import { formatPlayDayLabel } from "@/lib/league-time";

/**
 * Inline play-day date for one division. Saves day_date + auto day_label;
 * children of the division are updated server-side.
 */
export default function DivisionPlayDay({
  divisionId,
  label,
  dayDate = null,
  minDate = null,
  maxDate = null,
}) {
  const [value, setValue] = useState(dayDate ? String(dayDate).slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chip, setChip] = useState(
    dayDate ? formatPlayDayLabel(String(dayDate).slice(0, 10)) : null
  );

  async function save(next) {
    const day = next || null;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setDivisionPlayDay",
          divisionId,
          dayDate: day,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setValue(json.dayDate ? String(json.dayDate).slice(0, 10) : "");
      setChip(json.dayLabel || null);
    } catch (err) {
      setError(err.message);
      setValue(dayDate ? String(dayDate).slice(0, 10) : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5 min-w-0">
      <input
        type="date"
        aria-label={`Play day for ${label}`}
        value={value}
        min={minDate || undefined}
        max={maxDate || undefined}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          save(next);
        }}
        className={
          "w-[9.5rem] rounded-lg bg-white border text-[13px] leading-none py-1 px-1.5 " +
          (error
            ? "border-afa-red text-afa-red"
            : "border-afa-navy/25 hover:border-afa-navy/50 focus:border-afa-navy text-afa-ink")
        }
      />
      {chip ? (
        <span className="t-meta text-[11px] tabular-nums">{chip}</span>
      ) : (
        <span className="t-meta text-[11px] text-afa-muted">Not set</span>
      )}
      {error ? (
        <span className="t-meta text-[11px] text-afa-red max-w-[9.5rem]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
