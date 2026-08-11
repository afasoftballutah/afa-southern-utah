"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const DIRECTOR_ADD_SLOT_ID = "director-add-slot";

/**
 * Green create button — portal into DirectorShell’s top-right slot so every
 * list page puts “+ Add …” in the same place (next to Director Home).
 */
export function AddButton({ children, onClick, disabled, type = "button", className = "" }) {
  return (
    <button
      type={type}
      className={"btn-add shrink-0 " + className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Renders children into #director-add-slot when mounted. */
export function DirectorAddPortal({ children }) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    setEl(document.getElementById(DIRECTOR_ADD_SLOT_ID));
  }, []);
  if (!el || children == null) return null;
  return createPortal(children, el);
}
