import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionRole } from "@/lib/scorekeeper-auth";

/**
 * Thin mode strip: Director (red) or Scorekeeper (green).
 * Field-only scorekeepers do not get “Switch to Director” — they can’t enter.
 * Directors on the field room can switch back to Control Center.
 */
export default async function StaffViewBar({ mode }) {
  const isDirector = mode === "director";
  const label = isDirector ? "Director view" : "Scorekeeper view";
  const role = getSessionRole(await cookies());
  // Field PIN sessions: label only. Directors can hop either way.
  const showSwitch = role === "director";

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
      {showSwitch && (
        <Link href={otherHref} className="staff-view-bar__switch">
          Switch to {otherLabel}
        </Link>
      )}
    </div>
  );
}
