"use client";

import { useEffect } from "react";

// One dialog for the whole control center.
//
// JD, 2026-07-27: "the popups are hideous." They were. The action button was
// rendering OUTSIDE the card and over the table — .btn is inline-flex and a
// <select> is inline-block, so the two flowed inline and the button
// overflowed its own dialog. Three hand-rolled overlays also meant three
// different paddings, headers and shadows.
//
// Structure is header / body / footer, each a block, so nothing can escape:
// the footer is a flex row and the body is a column.
export default function Modal({ title, subtitle, onClose, children, footer, width = "max-w-md" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling under the dialog.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-afa-ink/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={
          "w-full " +
          width +
          " bg-white rounded-xl shadow-[0_24px_60px_-12px_rgba(22,35,61,0.45)] overflow-hidden"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-afa-navy/10">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="t-heading break-words">{title}</p>
            {subtitle && (
              <p className="t-meta mt-0.5 break-words whitespace-normal">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="t-label text-afa-muted hover:text-afa-navy min-h-0 py-0 shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 bg-afa-navy/[0.03] border-t border-afa-navy/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
