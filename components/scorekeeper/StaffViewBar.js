import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionRole } from "@/lib/scorekeeper-auth";

/**
 * Thin mode strip — color and label follow who is logged in, not which URL.
 * Director session = red; scorekeeper session = green.
 * Director Home lives here (not on each page header).
 */
export default async function StaffViewBar({ mode }) {
  const role = getSessionRole(await cookies());
  const identity = role ?? (mode === "director" ? "director" : "scorekeeper");
  const isDirector = identity === "director";

  const label = isDirector ? "Director" : "Scorekeeper";
  const showSwitch = role === "director";
  const onDirectorDesk = mode === "director";
  const otherHref = onDirectorDesk ? "/scorekeeper" : "/director";
  const otherLabel = onDirectorDesk ? "Scorekeeper room" : "Control Center";

  return (
    <div
      className={
        "staff-view-bar print:hidden " +
        (isDirector ? "staff-view-bar--director" : "staff-view-bar--scorekeeper")
      }
      role="status"
      aria-label={`${label} session`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <span className="staff-view-bar__label">{label}</span>
        {onDirectorDesk && (
          <Link href="/director" className="staff-view-bar__home">
            Director Home
          </Link>
        )}
        {!onDirectorDesk && (
          <Link href="/scorekeeper" className="staff-view-bar__home">
            Scorekeeper Home
          </Link>
        )}
      </div>
      {showSwitch && (
        <Link href={otherHref} className="staff-view-bar__switch">
          Switch to {otherLabel}
        </Link>
      )}
    </div>
  );
}
