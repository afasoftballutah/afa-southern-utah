// Meter — registration fill meter (component grammar, phase 1).
// Presentational only: takes count/min as props, fetches nothing. Never
// red, never gold — the fill is always navy, watching isn't acting.

export default function Meter({ count, min }) {
  const atOrOver = count >= min;
  const pct = Math.min(100, min > 0 ? (count / min) * 100 : 100);

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-afa-navy">
          {count} of {min} teams
        </span>
        <span className={atOrOver ? "text-afa-navy" : "text-afa-muted"}>
          {atOrOver ? "field full" : `needs ${min - count} more`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-afa-navy/10 mt-1">
        <div className="h-1.5 rounded-full bg-afa-navy" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
