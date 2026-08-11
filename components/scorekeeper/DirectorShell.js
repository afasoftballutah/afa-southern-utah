import Link from "next/link";

// One frame for every director page, so nothing is ever in a new place.
//
// JD, 2026-07-27: "think of it as a master control center and it has to be
// super intuitive... these are people used to using pen and paper and
// printouts. We need to keep it like a 7th grader could use it, very obvious,
// very consistent fonts and UI/UX."
//
// The rules this enforces, and they are the whole point:
//   - Every page has the same header, in the same place, with a way back.
//   - The title says what you are looking at, in plain words.
//   - A count is always visible, so "is this everything?" never needs asking.
//   - Nothing here invents a font size or a colour. t-title, t-heading,
//     t-body, t-meta, t-label and .card only.
export default function DirectorShell({
  title,
  count,
  inline,
  back = "/director",
  /** Override link text. Default: "Director Home" (or "Scorekeeper" from field room). */
  backLabel,
  children,
  action,
}) {
  const label =
    backLabel ??
    (back === "/scorekeeper" ? "Scorekeeper" : "Director Home");

  return (
    <div className="space-y-3">
      {/* One line: who this is, the facts about them, and the way back. A
          stacked header pushed the first real row of data below the fold on
          a laptop for no gain (JD, 2026-07-27: "not sure why all of this
          isnt on the same line?"). It wraps only when the screen is too
          narrow to hold it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
          <h1 className="t-title">{title}</h1>
          {count != null && <span className="t-meta whitespace-nowrap">{count}</span>}
          {inline}
        </div>
        {back && (
          <Link href={back} className="btn-transient shrink-0">
            {label}
          </Link>
        )}
      </div>
      {action}
      {children}
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
