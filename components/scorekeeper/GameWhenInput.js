/**
 * Game start. If the division already has a play day, only the time.
 */
export default function GameWhenInput({
  playDay = null,
  value,
  onChange,
  className = "w-full border border-afa-navy/30 rounded px-2 py-2 text-sm",
  label = null,
}) {
  const input = (
    <input
      type={playDay ? "time" : "datetime-local"}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
