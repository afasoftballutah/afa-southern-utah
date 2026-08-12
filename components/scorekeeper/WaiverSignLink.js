"use client";

import Link from "next/link";

/**
 * Director tool for a player's waiver seat:
 * - unsigned → link to their sign page
 * - signed → quiet “ok” (no link, no copy)
 */
export default function WaiverSignLink({
  href,
  signed = false,
  className = "",
  compact = false,
}) {
  if (signed) {
    return (
      <span
        className={
          "inline-flex items-center gap-1 text-afa-go " +
          (compact
            ? "text-[11px] font-bold uppercase tracking-wide"
            : "t-meta font-semibold") +
          " " +
          className
        }
        title="Waiver signed for this tournament"
      >
        <span className="tick text-[0.95em]" aria-hidden>
          ☑
        </span>
        {!compact ? <span>Signed</span> : null}
      </span>
    );
  }

  if (!href) {
    return <span className={"t-meta " + className}>—</span>;
  }

  const linkClass = compact
    ? "inline-flex items-center justify-center rounded border border-afa-navy/25 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-afa-navy leading-none whitespace-nowrap hover:border-afa-navy/50"
    : "pill";

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass + " " + className}
      title="Open waiver for this player to sign"
    >
      Sign
    </Link>
  );
}
