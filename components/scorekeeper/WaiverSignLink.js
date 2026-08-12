"use client";

import Link from "next/link";
import {
  formatSignAuditTitle,
  formatSignRecord,
} from "@/lib/sign-audit";

/**
 * Director tool for a player's waiver seat:
 * - unsigned → link to their sign page
 * - signed → quiet “ok” plus when / from where when we have it
 */
export default function WaiverSignLink({
  href,
  signed = false,
  signedAt = null,
  signedPlace = null,
  signedVia = null,
  signedIp = null,
  className = "",
  compact = false,
}) {
  if (signed) {
    const record = formatSignRecord({ signedAt, signedPlace });
    const title = formatSignAuditTitle({
      signedAt,
      signedPlace,
      signedVia,
      signedIp,
    });
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
        title={title}
      >
        <span className="tick text-[0.95em]" aria-hidden>
          ☑
        </span>
        {!compact ? <span>Signed</span> : null}
        {record ? (
          <span
            className={
              compact
                ? "normal-case tracking-normal font-semibold text-[11px]"
                : "t-meta font-normal text-afa-go"
            }
          >
            {record}
          </span>
        ) : !compact ? null : (
          <span className="sr-only">Signed</span>
        )}
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
