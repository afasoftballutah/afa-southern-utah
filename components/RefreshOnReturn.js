"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { shouldRefreshOnReturn } from "@/lib/refresh-on-return";

// Coming back to this tab after more than a minute away counts as opening
// the page again: one router.refresh(). Nothing else — no polling, no
// timers, no subscription (lib/refresh-on-return.js). Render once per page.
export default function RefreshOnReturn() {
  const router = useRouter();
  const hiddenAt = useRef(null);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current;
      hiddenAt.current = null;
      if (shouldRefreshOnReturn(away, Date.now())) router.refresh();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return null;
}
