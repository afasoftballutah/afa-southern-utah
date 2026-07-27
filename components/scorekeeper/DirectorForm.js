"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// One form shape for the whole control center: a heading, plain-language
// fields, one button. Collapsed behind its own heading so a page opens as a
// list, not as a wall of inputs — a director reads before they type.
//
// JD, 2026-07-27: "very obvious, very consistent fonts and UI/UX... like a
// 7th grader could use it."

export function Field({ label, hint, children, width }) {
  return (
    <label className={"block " + (width ?? "")}>
      <span className="t-label block mb-1">{label}</span>
      {children}
      {hint && <span className="t-meta block mt-1">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className="w-full border border-afa-navy/30 rounded-lg px-3 py-3 text-base"
    />
  );
}

export function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full border border-afa-navy/30 rounded-lg px-3 py-3 text-base"
    >
      {children}
    </select>
  );
}

/**
 * Money in, cents out. A director types 300 or $300 or 300.00 and means the
 * same thing; the column stores cents. Empty means "not set", which is NOT
 * the same as zero and must stay null so the public page keeps the line off.
 */
export function toCents(value) {
  const raw = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  if (cents == null) return "";
  return String(cents / 100);
}

/** Collapsible panel with a single submit. `onSubmit` returns an error string or null. */
// `row` lays the fields out on one line instead of stacking them. JD,
// 2026-07-27: "when we add a division, it should be a single line, not a
// stacked vertical list." A form of four short fields down the page is a
// scroll for no reason.
export default function DirectorForm({ heading, note, submitLabel, confirmMessage, onSubmit, children, row = false, open: initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(false);

  async function go() {
    setAsk(false);
    setBusy(true);
    setError("");
    try {
      const message = await onSubmit();
      if (message) setError(message);
    } catch (err) {
      setError(err.message || "That did not work");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-quiet w-full" onClick={() => setOpen(true)}>
        {heading}
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-strong">{heading}</p>
        <button type="button" className="t-label underline text-afa-muted" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {note && <p className="t-meta">{note}</p>}
      {row ? (
        <div className="flex flex-wrap items-end gap-3 dense-controls">{children}</div>
      ) : (
        children
      )}
      <button
        type="button"
        className={row ? "btn" : "btn w-full"}
        disabled={busy}
        onClick={() => (confirmMessage ? setAsk(true) : go())}
      >
        {busy ? "Saving…" : submitLabel}
      </button>
      {ask && (
        <ConfirmDialog
          title={heading}
          message={confirmMessage}
          confirmLabel={submitLabel}
          busy={busy}
          onConfirm={go}
          onCancel={() => setAsk(false)}
        />
      )}
      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
    </div>
  );
}

/** Every director write goes through here, so failures read the same way. */
export async function directorPost(payload) {
  const res = await fetch("/api/scorekeeper/directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error || "That did not work" };
  return json;
}
