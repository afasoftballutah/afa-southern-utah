"use client";

import { useState } from "react";
import Modal from "./Modal";

// A slim link in a table cell that opens one dialog.
//
// The BUTTON stays in the column that makes it make sense — merge under the
// name, switch team under the person's own columns — which is the part that
// carries the meaning. The form itself floats, because a form inside a table
// cell either breaks the grid or squeezes into a column.
export default function RowAction({
  label,
  title,
  note,
  options,
  placeholder,
  confirmText,
  payload,
  action,
  valueKey,
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (options.length === 0) return null;
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
        <Modal
          title={title}
          subtitle={note}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={busy || !choice} onClick={go}>
                {busy ? "Working…" : label}
              </button>
            </>
          }
        >
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="block w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-[15px]"
          >
            <option value="">{placeholder}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
        </Modal>
      )}
    </>
  );
}
