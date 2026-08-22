/**
 * Game start. If the division already has a play day, only the time.
 * Empty fields show 8:00 so a phone clock opens on the hour, not on now's minutes.
 */
import { defaultGameWhenInput } from "@/lib/league-time";

export default function GameWhenInput({
  playDay = null,
  value,
  onChange,
  className = "w-full border border-afa-navy/30 rounded px-2 py-2 text-sm",
  label = null,
}) {
  const shown = value || defaultGameWhenInput(playDay);
  const input = (
    <input
      type={playDay ? "time" : "datetime-local"}
      className={className}
      value={shown}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => {
        if (!value) onChange(shown);
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
