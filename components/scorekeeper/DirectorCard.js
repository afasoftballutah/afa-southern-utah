import Link from "next/link";

// The one card. Every director surface is made of these, so a card always
// means the same thing: a title, what it is, and the numbers that matter.
//
// JD, 2026-07-27: "I think we need cards instead of these lists... Tournaments,
// Teams, Players - those are the things the director needs to fool with and
// drill into."
//
// A row list makes you read left to right and hold the column headings in
// your head. A card puts the name first and the numbers underneath it, which
// is how a printout reads and how these directors already think.
//
// Nothing here invents a size or a colour: t-title, t-heading, t-body,
// t-meta, t-label and .card only.
export default function DirectorCard({ href, title, subtitle, stats = [], footer, tone }) {
  const body = (
    <div
      className={
        "card p-4 h-full flex flex-col gap-3 " +
        (tone === "quiet" ? "opacity-60 " : "") +
        (href ? "hover:border-afa-navy/40" : "")
      }
    >
      <div className="min-w-0">
        <p className="t-heading truncate">{title}</p>
        {subtitle && <p className="t-meta truncate">{subtitle}</p>}
      </div>

      {stats.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-auto">
          {stats.map((s) => (
            <div key={s.label}>
              <p className={"t-strong " + (s.alert ? "text-afa-red" : "")}>{s.value}</p>
              <p className="t-label">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {footer && <p className="t-meta">{footer}</p>}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}

/** Cards in a responsive grid. One column on a phone, which is where a
 *  director actually stands. */
export function CardGrid({ children }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}
