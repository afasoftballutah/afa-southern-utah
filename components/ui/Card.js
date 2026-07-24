// Card — the ticket/program-entry family (component grammar, phase 1).
// default: thin navy top rule, the box family established in the bracket
// tree spec. navy: solid navy ground, no top rule — the navy IS the weight.

const VARIANTS = {
  default: "bg-white border border-afa-navy/15 border-t-2 border-t-afa-navy rounded-lg p-4",
  navy: "bg-afa-navy text-white rounded-lg p-4",
};

export default function Card({ variant = "default", className = "", children }) {
  const base = VARIANTS[variant] ?? VARIANTS.default;
  return <div className={[base, className].filter(Boolean).join(" ")}>{children}</div>;
}
