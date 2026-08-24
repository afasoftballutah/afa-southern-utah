"use client";

/**
 * Game start. If the division already has a play day, only the time.
 * Empty stays empty until the field is opened. Opening seeds 8:00 so a
 * phone clock is on the hour. iOS does not fire change when you leave the
 * seed (first games are often 8:00) — blur commits whatever the picker has.
 */

import { useState } from "react";
import { defaultGameWhenInput } from "@/lib/league-time";

export default function GameWhenInput({
  playDay = null,
  value,
  onChange,
  className = "w-full border border-afa-navy/30 rounded px-2 py-2 text-sm",
  label = null,
}) {
  const seed = defaultGameWhenInput(playDay);
  const [open, setOpen] = useState(false);
  const shown = value || (open ? seed : "");

  function commit(raw) {
    const next = raw ?? "";
    if (next !== (value || "")) onChange(next);
  }

  const input = (
    <input
      type={playDay ? "time" : "datetime-local"}
      className={className}
      value={shown}
      onPointerDown={(e) => {
        if (value) return;
        e.currentTarget.value = seed;
        setOpen(true);
      }}
      onFocus={() => {
        if (!value) setOpen(true);
      }}
      onChange={(e) => {
        setOpen(true);
        onChange(e.target.value);
      }}
      onBlur={(e) => {
        commit(e.currentTarget.value);
        setOpen(false);
      }}
      aria-label={label || (playDay ? "Time" : "Date and time")}
    />
  );
  if (!label) return input;
  return (
    <label className="block min-w-0">
      <span className="t-label block mb-1">{playDay ? "Time" : "Date and time"}</span>
      {input}
    </label>
  );
}
