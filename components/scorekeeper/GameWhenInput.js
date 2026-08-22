/**
 * Game start. If the division already has a play day, only the time.
 * Empty stays empty. Opening the picker seeds :00 so a phone clock is
 * not stuck on now's minutes; nothing is saved until they pick a time.
 */
import { defaultGameWhenInput } from "@/lib/league-time";

export default function GameWhenInput({
  playDay = null,
  value,
  onChange,
  className = "w-full border border-afa-navy/30 rounded px-2 py-2 text-sm",
  label = null,
}) {
  const seed = defaultGameWhenInput(playDay);
  const input = (
    <input
      type={playDay ? "time" : "datetime-local"}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => {
        if (!value) e.currentTarget.value = seed;
      }}
      onBlur={(e) => {
        if (!value) e.currentTarget.value = "";
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
