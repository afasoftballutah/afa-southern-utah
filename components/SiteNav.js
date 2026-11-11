"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import RegionPrefBadge from "@/components/RegionPrefBadge";

const LINKS = [
  { href: "/tournaments", label: "Tournaments" },
  { href: "/#news", label: "News" },
  { href: "/rules", label: "Rules" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <nav className="site-nav" aria-label="Site">
      <RegionPrefBadge />
      <div className="site-nav__links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="site-nav__link">
            {l.label}
          </Link>
        ))}
      </div>
      <div className="site-nav__menu" ref={wrapRef}>
        <button
          type="button"
          className="site-nav__toggle"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls={menuId}
          id={btnId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="site-nav__bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        {open ? (
          <div className="site-nav__dropdown" id={menuId} role="menu" aria-labelledby={btnId}>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="site-nav__dropdown-link"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
