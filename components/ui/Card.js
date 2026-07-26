// Card — the one surface.
//
// It floats. It does not draw a rule to prove it is a card: the dark top
// border that used to sit on every card on every page was a stripe
// announcing itself (JD, 2026-07-26: "AI tell"). The lift is the same one
// the bracket's own game cards carry, so one grammar covers both.
//
// The look itself lives in .card in globals.css — this only chooses the
// ground and the padding.

const VARIANTS = {
  default: "card p-4",
  navy: "card p-4 bg-afa-navy text-white",
};

export default function Card({ variant = "default", className = "", children, ...rest }) {
  const base = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <div className={[base, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
