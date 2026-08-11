import Link from "next/link";

/**
 * Thin mode strip: Director (red) or Scorekeeper (green).
 * Always clear which desk you're on.
 */
export default function StaffViewBar({ mode }) {
  const isDirector = mode === "director";
  const label = isDirector ? "Director view" : "Scorekeeper view";
  const otherHref = isDirector ? "/scorekeeper" : "/director";
  const otherLabel = isDirector ? "Scorekeeper" : "Director";

  return (
    <div
      className={
        "staff-view-bar print:hidden " +
        (isDirector ? "staff-view-bar--director" : "staff-view-bar--scorekeeper")
      }
      role="status"
      aria-label={label}
    >
      <span className="staff-view-bar__label">{label}</span>
      <Link href={otherHref} className="staff-view-bar__switch">
        Switch to {otherLabel}
      </Link>
    </div>
  );
}
