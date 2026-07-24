// Chip — small label pill (component grammar, phase 1). Division pills,
// day tags, status, event counts. muted variant reads quieter — a count
// or footnote, not a fact worth navy weight.

const VARIANTS = {
  default: "border-afa-navy/25 text-afa-navy",
  muted: "border-afa-muted text-afa-muted",
};

export default function Chip({ variant = "default", className = "", children }) {
  const colors = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <span
      className={[
        "inline-block text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border bg-white",
        colors,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
