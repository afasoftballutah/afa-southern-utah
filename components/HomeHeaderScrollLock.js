"use client";

import { useEffect } from "react";

/**
 * Classic sticky home header: always fixed at the top; content scrolls under.
 * “Locks in” (solid bar) once the poster carousel reaches the header.
 */
export default function HomeHeaderScrollLock() {
  useEffect(() => {
    const header = document.querySelector(".site-header");
    if (!header) return;

    let deck = document.querySelector(".poster-deck");
    let raf = 0;

    const apply = () => {
      raf = 0;
      deck = deck || document.querySelector(".poster-deck");
      if (!deck) {
        header.classList.remove("site-header--locked");
        return;
      }
      const headerBottom = header.getBoundingClientRect().bottom;
      const deckTop = deck.getBoundingClientRect().top;
      // Solid once the carousel meets the fixed header
      if (deckTop <= headerBottom + 1) {
        header.classList.add("site-header--locked");
      } else {
        header.classList.remove("site-header--locked");
      }
    };

    const onScrollOrResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    const mo = new MutationObserver(onScrollOrResize);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      header.classList.remove("site-header--locked");
    };
  }, []);

  return null;
}
