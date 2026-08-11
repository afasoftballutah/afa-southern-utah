"use client";

/**
 * Always-visible label + optional placeholder tip.
 * Date/time and short fields need a permanent label — hiding it until
 * focus made empty rows look unlabeled (JD).
 */
export default function SoftField({
  label,
  explainer,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  list,
  className = "",
  inputClassName = "form-field",
}) {
  return (
    <label className={"block " + className}>
      <span className="t-label block mb-1 min-h-[1rem] leading-4">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        list={list}
        value={value ?? ""}
        onChange={onChange}
        placeholder={explainer}
        className={inputClassName + " w-full"}
      />
    </label>
  );
}

export function FixedSummary({ lines = [], onEdit, editLabel = "Edit" }) {
  const shown = lines.filter((l) => l?.value);
  if (shown.length === 0) return null;
  return (
    <div className="rounded-lg bg-afa-soft-gray/80 border border-afa-navy/10 px-3 py-2.5 space-y-1">
      {shown.map((l) => (
        <div key={l.label} className="flex gap-2 text-sm">
          <span className="t-meta shrink-0 w-16">{l.label}</span>
          <span className="font-semibold text-afa-navy">{l.value}</span>
        </div>
      ))}
      {onEdit && (
        <button
          type="button"
          className="t-label underline text-afa-navy mt-1"
          onClick={onEdit}
        >
          {editLabel}
        </button>
      )}
    </div>
  );
}

export function PageDots({ page, total = 3 }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const id = i + 1;
        return (
          <div
            key={id}
            className={
              "h-1 flex-1 rounded-full " +
              (id === page
                ? "bg-afa-navy"
                : id < page
                  ? "bg-afa-navy/40"
                  : "bg-afa-navy/10")
            }
          />
        );
      })}
    </div>
  );
}
