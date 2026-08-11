"use client";

/**
 * Print the current list/table (whatever filters are active in the DOM).
 * Browser “Save as PDF” is the path to a PDF.
 */
export default function PrintListButton({ label = "Print PDF" }) {
  return (
    <button
      type="button"
      className="btn-transient shrink-0 print:hidden"
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
