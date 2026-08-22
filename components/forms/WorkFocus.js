"use client";

import { useEffect } from "react";

/**
 * Focus the active work surface: outlined panel, scrim + dimmed desk behind.
 * Used by RoomShell and plain director forms (docs, news).
 */
export default function WorkFocus({ children, onScrimClick, className = "" }) {
  useEffect(() => {
    document.body.classList.add("work-focus-active");
    return () => document.body.classList.remove("work-focus-active");
  }, []);

  return (
    <div className={"work-focus w-full " + className}>
      <div
        className={
          "work-focus__scrim print:hidden" +
          (onScrimClick ? " work-focus__scrim--clickable" : "")
        }
        aria-hidden
        onClick={onScrimClick}
      />
      <div className="work-focus__panel rounded-xl bg-white w-full">
        {children}
      </div>
    </div>
  );
}
