import Link from "next/link";
import { DIRECTOR_ADD_SLOT_ID } from "@/components/scorekeeper/DirectorAddSlot";
import PrintListButton from "@/components/scorekeeper/PrintListButton";

// One frame for every director page, so nothing is ever in a new place.
//
// JD, 2026-07-27: "think of it as a master control center and it has to be
// super intuitive... these are people used to using pen and paper and
// printouts. We need to keep it like a 7th grader could use it, very obvious,
// very consistent fonts and UI/UX."
//
// Header right: green + Add (portaled) · Print PDF · optional section Back.
// Director Home lives on the red staff bar, not here.
export default function DirectorShell({
  title,
  count,
  inline,
  /** Section back (e.g. Teams). Omit or "/director" — Home is on the red bar. */
  back = null,
  backLabel = "Back",
  add = null,
  /** Print current filtered list (browser Save as PDF). Default on. */
  print = true,
  /** When set, Print PDF prints this document (the official roster/waiver). */
  printHref = null,
  children,
  action,
  /** One tight header row: title + Print + Back, for the phone scorekeeper. */
  compact = false,
}) {
  const showSectionBack = Boolean(back) && back !== "/director";

  return (
    <div className={"director-desk" + (compact ? " director-desk--compact" : " space-y-3")}>
      <div className={"flex items-center justify-between print:block " + (compact ? "flex-nowrap gap-x-2" : "flex-wrap gap-x-5 gap-y-2")}>
        <div className={"flex items-baseline min-w-0 " + (compact ? "gap-x-2" : "flex-wrap gap-x-4 gap-y-1")}>
          <h1 className="t-title">{title}</h1>
          {count != null && (
            <span className="t-meta whitespace-nowrap">{count}</span>
          )}
          {inline}
        </div>
        <div className={"flex items-center shrink-0 print:hidden " + (compact ? "gap-1.5" : "flex-wrap gap-2")}>
          <span
            id={DIRECTOR_ADD_SLOT_ID}
            className="inline-flex items-center"
          />
          {add}
          {print && <PrintListButton href={printHref} />}
          {showSectionBack && (
            <Link href={back} className="btn-transient shrink-0">
              {backLabel}
            </Link>
          )}
        </div>
      </div>
      {action}
      <div className="director-print-body">{children}</div>
    </div>
  );
}

/**
 * The one row shape. Every list on every director page uses it, so a row
 * always means the same thing: a label on the left, a fact on the right, the
 * whole row is the tap target when there is somewhere to go.
 */
export function Row({ href, label, sub, right, rightSub }) {
  const inner = (
    <>
      <span className="min-w-0">
        <span className="t-body block truncate">{label}</span>
        {sub && <span className="t-meta block truncate">{sub}</span>}
      </span>
      <span className="shrink-0 text-right">
        {right && <span className="t-strong block">{right}</span>}
        {rightSub && <span className="t-meta block">{rightSub}</span>}
      </span>
    </>
  );
  const className =
    "flex items-center justify-between gap-3 px-4 py-3 min-h-[52px] w-full text-left";
  if (!href) return <div className={className}>{inner}</div>;
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

/** A list of Rows in a card. Empty says so in words, never as a blank box. */
export function RowList({ children, empty = "Nothing here yet." }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = !items || (Array.isArray(items) && items.length === 0);
  if (isEmpty) {
    return (
      <div className="card p-6 text-center">
        <p className="t-meta">{empty}</p>
      </div>
    );
  }
  return <ul className="card divide-y divide-black/5">{items}</ul>;
}
