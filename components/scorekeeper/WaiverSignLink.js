"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Director tool: open or copy a player's personal waiver sign page.
 * Path is /register/sign/{token} — one link per roster seat; one signature
 * covers the whole tournament for that person.
 */
export default function WaiverSignLink({
  href,
  signed = false,
  className = "",
  compact = false,
}) {
  const [copied, setCopied] = useState(false);
  if (!href) return null;

  const pill =
    "inline-flex items-center justify-center rounded border border-afa-navy/25 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-afa-navy leading-none whitespace-nowrap hover:border-afa-navy/50";

  async function copy() {
    try {
      const abs =
        typeof window !== "undefined"
          ? new URL(href, window.location.origin).toString()
          : href;
      await navigator.clipboard.writeText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (compact) {
    return (
      <span className={"inline-flex items-center gap-0.5 " + className}>
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={pill}
          title={signed ? "Open signed waiver page" : "Open waiver for this player"}
        >
          {signed ? "Signed" : "Sign"}
        </Link>
        <button
          type="button"
          className={pill}
          onClick={copy}
          title="Copy sign link"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    );
  }

  return (
    <span className={"inline-flex flex-wrap items-center gap-1.5 " + className}>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="pill"
      >
        {signed ? "Open waiver" : "Sign waiver"}
      </Link>
      <button type="button" className="pill" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </span>
  );
}
