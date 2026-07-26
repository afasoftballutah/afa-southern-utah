// Card — the ticket/program-entry family (component grammar, phase 1).
// default: thin navy top rule, the box family established in the bracket
// tree spec. navy: solid navy ground, no top rule — the navy IS the weight.

const VARIANTS = {
  // Floating, not ruled. The dark top border was on every card on
  // every page — a stripe announcing "this is a card" rather than
  // letting the card be one (JD, 2026-07-26: "AI tell"). Same lift
  // the bracket's own game cards have, so one grammar covers both.
  default:
    "bg-white rounded-xl p-4 shadow-[0_1px_2px_rgba(22,35,61,.05),0_10px_26px_-18px_rgba(22,35,61,.5)]",
  navy: "bg-afa-navy text-white rounded-xl p-4 shadow-[0_1px_2px_rgba(22,35,61,.05),0_10px_26px_-18px_rgba(22,35,61,.5)]",
};

export default function Card({ variant = "default", className = "", children }) {
  const base = VARIANTS[variant] ?? VARIANTS.default;
  return <div className={[base, className].filter(Boolean).join(" ")}>{children}</div>;
}
