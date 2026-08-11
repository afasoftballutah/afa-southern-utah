/**
 * Bordered group tying the official-ID reminder to the legal name / address fields.
 */
export default function LegalIdBox({
  children,
  /** Extra line under the main must-match copy */
  detail = null,
  className = "",
  title = "Legal name & address",
}) {
  return (
    <div
      className={
        "rounded-lg border-2 border-afa-navy/30 bg-afa-navy/[0.04] p-3 space-y-3 " +
        className
      }
    >
      <div className="space-y-1">
        <p className="t-label text-afa-navy tracking-wide">{title}</p>
        <p className="text-sm text-afa-ink/80 break-words whitespace-normal leading-snug">
          Legal name and address must match a driver&rsquo;s license or other
          official ID.
        </p>
        {detail ? (
          <p className="t-meta break-words whitespace-normal leading-snug">
            {detail}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
