"use client";

import { useEffect, useState } from "react";

// A slim button in a table cell that opens a small panel over the page.
//
// JD, 2026-07-27: "put the buttons in the first row, keep them slim so they
// fit, and put 'merge duplicate' under the name, since thats where it's
// relevant."
//
// The panel floats rather than expanding the row, because a form inside a
// table cell either breaks the grid or squeezes into a column. The BUTTON
// stays in the column that makes it make sense — merge under the name,
// move under the team — which is the part that matters.
// `confirmText` is a TEMPLATE, not a function — a server component cannot
// hand a callback to a client one. {name} is replaced with the chosen option.
export default function RowAction({ label, title, note, options, placeholder, confirmText, payload, action, valueKey }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const chosen = options.find((o) => o.id === choice);

  async function go() {
    const message = (confirmText ?? "Go ahead?").replace("{name}", chosen?.label ?? "");
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action, [valueKey]: choice }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That did not work");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (options.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-label text-afa-navy underline decoration-afa-navy/30 underline-offset-2 min-h-0 py-0"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-sm p-4 space-y-3 dense-controls"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-strong">{title}</p>
              <button type="button" className="t-label underline min-h-0 py-0" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {note && <p className="t-meta">{note}</p>}
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-[15px]"
            >
              <option value="">{placeholder}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn w-full" disabled={busy || !choice} onClick={go}>
              {busy ? "Working…" : label}
            </button>
            {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
