"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The tournament slug in a public tournament URL, or null. */
export function tournamentSlugFromPath(pathname) {
  const m = /^\/tournaments\/([^/]+)/.exec(pathname || "");
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * The bar's wordmark. A client component so client-side navigation from
 * the home page (or any other route) onto a tournament page actually
 * updates the title — a server SiteHeader in the root layout stays at
 * whatever the first request rendered, and ISR can bake "AFA SlowPitch"
 * when middleware's x-pathname is missing at prerender (JD, 2026-11-11).
 * `?team=` is not involved; the pick lives in localStorage.
 */
export default function SiteWordmark({ tournaments = [] }) {
  const pathname = usePathname() || "";
  const slug = tournamentSlugFromPath(pathname);
  const name = slug ? tournaments.find((t) => t.slug === slug)?.name : null;
  if (name && slug) {
    return (
      <Link href={`/tournaments/${slug}`} className="site-wordmark">
        {name}
      </Link>
    );
  }
  return (
    <Link href="/" className="site-wordmark">
      AFA SlowPitch
    </Link>
  );
}
