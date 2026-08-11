"use client";

import { useState } from "react";
import SoftField, { FixedSummary, PageDots } from "@/components/forms/SoftField";

/**
 * Room flow chrome — one shared shell for create paths
 * (register, umpires, tournaments, teams…).
 *
 * Metaphor: door (first ask) → rooms → exit same door (Close).
 * Not the home nav `Door` component.
 */

/** Soft field + optional/required hint under the input. */
export function RoomField({
  label,
  explainer,
  optional = false,
  required = false,
  hint,
  className = "",
  ...rest
}) {
  const baseExplainer =
    explainer ||
    (optional ? `${label} (optional)` : label);
  const foot =
    hint ||
    (optional ? "Optional" : required ? "Required" : null);
  // Required = bold navy; optional = light muted (easy to scan which matters).
  const labelClass = optional
    ? "font-normal text-afa-muted"
    : required
      ? "font-bold text-afa-navy"
      : "font-semibold text-afa-navy";
  const footClass = optional
    ? "text-[11px] font-normal tracking-wide uppercase text-afa-muted/80"
    : "text-[11px] font-bold tracking-wide uppercase text-afa-navy";
  return (
    <div className={"space-y-0.5 min-w-0 " + className}>
      <SoftField
        label={label}
        explainer={baseExplainer}
        labelClassName={labelClass}
        {...rest}
      />
      {foot && <p className={footClass}>{foot}</p>}
    </div>
  );
}

/** Hall: prior answers strip. Re-export with room-flow name. */
export function RoomHall({ lines, onEdit, editLabel = "Edit" }) {
  return (
    <FixedSummary lines={lines} onEdit={onEdit} editLabel={editLabel} />
  );
}

/**
 * Shared create-flow frame.
 *
 * @param {object} props
 * @param {string} props.title — flow title ("Add umpire")
 * @param {string} [props.roomTitle] — current room ("Name & contact")
 * @param {number|null} [props.page] — 1-based; null hides dots (edit / single)
 * @param {number} [props.totalPages=1]
 * @param {React.ReactNode} [props.hall]
 * @param {string} [props.welcome] — one sentence under header
 * @param {string} [props.error]
 * @param {React.ReactNode} props.children
 * @param {() => void} props.onClose — exit door
 * @param {boolean} [props.dirty] — if true, Close confirms discard
 * @param {() => void} [props.onBack]
 * @param {string} [props.primaryLabel="Continue"]
 * @param {boolean} [props.primaryDisabled]
 * @param {"submit"|"button"} [props.primaryType="submit"]
 * @param {() => void} [props.onPrimary]
 * @param {boolean} [props.showSkip]
 * @param {() => void} [props.onSkip]
 * @param {string} [props.skipLabel="Skip"]
 * @param {boolean} [props.busy]
 * @param {boolean} [props.asForm=true] — wrap in <form>
 * @param {(e) => void} [props.onSubmit]
 * @param {string} [props.closeLabel="Close"]
 * @param {string} [props.className]
 */
export default function RoomShell({
  title,
  roomTitle,
  page = null,
  totalPages = 1,
  hall = null,
  welcome = null,
  error = "",
  children,
  onClose,
  dirty = false,
  onBack = null,
  primaryLabel = "Continue",
  primaryDisabled = false,
  primaryType = "submit",
  onPrimary = null,
  showSkip = false,
  onSkip = null,
  skipLabel = "Skip",
  busy = false,
  asForm = true,
  onSubmit,
  closeLabel = "Close",
  className = "",
}) {
  const [askDiscard, setAskDiscard] = useState(false);
  const showDots = page != null && totalPages > 1;

  function requestClose() {
    if (dirty) {
      setAskDiscard(true);
      return;
    }
    onClose?.();
  }

  function confirmDiscard() {
    setAskDiscard(false);
    onClose?.();
  }

  const body = (
    <>
      <div className="px-4 py-3 border-b border-afa-navy/10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-afa-navy">{title}</p>
          {roomTitle && (
            <p className="t-meta text-xs mt-0.5">
              {roomTitle}
              {showDots ? ` · ${page} of ${totalPages}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          className="t-label underline text-afa-muted shrink-0"
          onClick={requestClose}
        >
          {closeLabel}
        </button>
      </div>

      {showDots && (
        <div className="px-4 pt-3">
          <PageDots page={page} total={totalPages} />
        </div>
      )}

      <div className="p-4 space-y-3">
        {error && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {hall}

        {welcome && (
          <p className="text-sm text-afa-ink/75 leading-relaxed">{welcome}</p>
        )}

        {children}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {onBack && (
            <button
              type="button"
              className="btn-transient"
              onClick={onBack}
              disabled={busy}
            >
              Back
            </button>
          )}
          {showSkip && onSkip && (
            <button
              type="button"
              className="btn-transient"
              onClick={onSkip}
              disabled={busy}
            >
              {skipLabel}
            </button>
          )}
          <button
            type={primaryType}
            className="btn-action ml-auto"
            disabled={busy || primaryDisabled}
            onClick={primaryType === "button" ? onPrimary : undefined}
          >
            {busy ? "…" : primaryLabel}
          </button>
        </div>
      </div>

      {askDiscard && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-discard-title"
        >
          <div className="card w-full max-w-sm p-4 space-y-3 bg-white shadow-lg">
            <p id="room-discard-title" className="t-strong">
              Discard what you entered?
            </p>
            <p className="t-meta">
              Nothing has been saved yet. Close anyway?
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="btn-transient"
                onClick={() => setAskDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="btn-action"
                onClick={confirmDiscard}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const frameClass =
    "rounded-xl border border-afa-navy/15 bg-white shadow-sm overflow-hidden max-w-md " +
    className;

  if (asForm) {
    return (
      <form
        className={frameClass}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
        noValidate
      >
        {body}
      </form>
    );
  }

  return <div className={frameClass}>{body}</div>;
}

/**
 * Collapsed handle that opens a room flow (list stays clean).
 */
export function RoomFlowTrigger({ label, onClick, className = "btn-transient w-full" }) {
  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
  );
}
