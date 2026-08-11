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
  // Legend above the list — what each option line means (omit when obvious)
  optionKey,
  // Empty-list copy (merge vs switch need different words)
  emptyMessage = "Nothing to pick.",
  // Count line under the list — full phrase after the number.
  // e.g. singular "person" / plural "people", or "team in this tournament"
  countSingular = "option",
  countPlural,
  confirmText,
  payload,
  action,
  valueKey,
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Empty list still shows the pill so the director knows Switch exists but
  // there is nowhere to send them (e.g. only one team in the tournament).
  const chosen = options.find((o) => o.id === choice);

  // Optional optgroups: options may carry `group` (e.g. division). Preserve
  // first-seen group order so a pre-sorted list stays stable.
  const grouped = (() => {
    const hasGroups = options.some((o) => o.group);
    if (!hasGroups) return null;
    const map = new Map();
    for (const o of options) {
      const g = o.group || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(o);
    }
    return [...map.entries()].map(([groupLabel, items]) => ({
      groupLabel,
      items,
    }));
  })();

  async function go() {
    // No second prompt: this dialog already states what will happen and puts
    // Cancel beside the button. Two confirms for one decision is noise.
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
        className="pill"
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
              <button type="button" className="btn-transient" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-action"
                disabled={busy || !choice || options.length === 0}
                onClick={go}
              >
                {busy ? "Working…" : label}
              </button>
            </>
          }
        >
          {options.length === 0 ? (
            <p className="t-meta">{emptyMessage}</p>
          ) : (
            <>
              <label className="block space-y-1">
                {optionKey ? (
                  <span className="t-label">{optionKey}</span>
                ) : null}
                <select
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  className="block w-full border border-afa-navy/30 rounded-lg px-3 py-2 text-[15px]"
                  size={Math.min(
                    14,
                    options.length + (grouped ? grouped.length : 0) + 1
                  )}
                >
                  <option value="">{placeholder}</option>
                  {grouped
                    ? grouped.map(({ groupLabel, items }) => (
                        <optgroup key={groupLabel} label={groupLabel}>
                          {items.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                </select>
              </label>
              <p className="t-meta text-xs mt-2">
                {options.length}{" "}
                {options.length === 1
                  ? countSingular
                  : countPlural || `${countSingular}s`}
                {chosen ? ` · selected: ${chosen.label}` : ""}
              </p>
            </>
          )}
          {error && (
            <p className="t-meta text-afa-red font-semibold mt-2">{error}</p>
          )}
        </Modal>
      )}
    </>
  );
}
