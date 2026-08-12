"use client";

import { useState } from "react";
import SoftField, { FixedSummary, PageDots } from "@/components/forms/SoftField";
import WorkFocus from "@/components/forms/WorkFocus";

/**
 * Room flow chrome — one shared shell for create paths
 * (register, umpires, tournaments, teams…).
 *
 * Metaphor: door (first ask) → rooms → exit same door (Close).
 * Not the home nav `Door` component.
 */

/**
 * Soft field for room forms. Label always on.
 * optional text → placeholder "optional" inside the field.
 * optional date/time → " · optional" on the label (native date UI cannot host a placeholder).
 * required is enforced by Continue disabled, not a stamp under every field.
 */
export function RoomField({
  label,
  explainer,
  optional = false,
  required: _required = false,
  hint: _hint,
  className = "",
  inputClassName = "form-field",
  list,
  inputMode,
  type,
  ...rest
}) {
  const isDateLike =
    type === "date" || type === "time" || type === "datetime-local";
  // Text: "optional" in the box. Date: never overlay — only mark the label.
  const shownLabel =
    optional && isDateLike ? `${label} · optional` : label;
  let tip = optional && !isDateLike ? "optional" : explainer;
  if (!optional && tip === label) tip = undefined;
  return (
    <div className={"min-w-0 " + className}>
      <SoftField
        label={shownLabel}
        explainer={tip}
        inputClassName={inputClassName}
        list={list}
        inputMode={inputMode}
        type={type}
        {...rest}
      />
    </div>
  );
}

/**
 * Select with the same quiet label as RoomField.
 * Optional: empty option reads "optional" when value is blank.
 * Pass className for fixed widths (gender, rating, dates that shouldn't stretch).
 */
export function RoomSelect({
  label,
  optional = false,
  value,
  onChange,
  children,
  className = "",
  selectClassName = "form-field",
}) {
  return (
    <label className={"block min-w-0 " + className}>
      <span className="t-label block mb-1 min-h-[1rem] leading-4">{label}</span>
      <select
        className={
          selectClassName +
          " w-full " +
          (optional && !value ? "text-afa-muted" : "")
        }
        value={value ?? ""}
        onChange={onChange}
        aria-label={optional ? `${label} (optional)` : label}
      >
        {children}
      </select>
    </label>
  );
}

/**
 * Hall: prior answers as one quiet line — not a labeled card.
 * Values only; Edit sits on the right.
 */
export function RoomHall({ lines, onEdit, editLabel = "Edit" }) {
  const shown = (lines || []).filter((l) => l?.value);
  if (shown.length === 0) return null;
  return (
    <div className="flex items-baseline gap-2 min-w-0 text-sm">
      <p className="font-semibold text-afa-navy truncate min-w-0">
        {shown.map((l) => l.value).join(" · ")}
      </p>
      {onEdit && (
        <button
          type="button"
          className="t-label underline text-afa-muted shrink-0"
          onClick={onEdit}
        >
          {editLabel}
        </button>
      )}
    </div>
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
          <p className="font-bold text-afa-navy">
            {title}
            {roomTitle ? (
              <span className="font-normal text-afa-muted">
                {" · "}
                {roomTitle}
                {showDots ? ` ${page}/${totalPages}` : ""}
              </span>
            ) : null}
          </p>
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
        <div className="px-4 pt-2">
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
          <p className="t-meta leading-snug">{welcome}</p>
        )}

        {children}

        <div className="flex flex-wrap items-center gap-2 pt-1">
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

  // No overflow-hidden here — WorkFocus panel scrolls tall multi-room flows.
  const frameClass = "rounded-xl bg-white max-w-md w-full " + className;

  const panel = asForm ? (
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
  ) : (
    <div className={frameClass}>{body}</div>
  );

  return (
    <WorkFocus onScrimClick={requestClose} className="max-w-md">
      {panel}
    </WorkFocus>
  );
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

// Keep FixedSummary available for non-hall uses if any import via RoomShell.
export { FixedSummary };
