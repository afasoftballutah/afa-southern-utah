import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionRole } from "@/lib/scorekeeper-auth";

/**
 * Thin mode strip — color and label follow who is logged in, not which URL.
 * Director session = red; scorekeeper session = green.
 * Before PIN, fall back to the desk layout you’re standing in.
 */
export default async function StaffViewBar({ mode }) {
  const role = getSessionRole(await cookies());
  // Logged-in role wins; pre-PIN uses the layout (director vs scorekeeper door).
  const identity = role ?? (mode === "director" ? "director" : "scorekeeper");
  const isDirector = identity === "director";

  const label = isDirector ? "Director" : "Scorekeeper";
  const showSwitch = role === "director";
  // On control center → switch to field; on field → switch home.
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
      <span className="staff-view-bar__label">{label}</span>
      {showSwitch && (
        <Link href={otherHref} className="staff-view-bar__switch">
          Switch to {otherLabel}
        </Link>
      )}
    </div>
  );
}
