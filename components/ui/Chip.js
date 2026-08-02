// Chip — small permanent-info label.
// Color law: default = blue permanent fact; muted = quieter permanent meta.

const VARIANTS = {
  default: "chip chip--info",
  muted: "chip chip--muted",
};

export default function Chip({ variant = "default", className = "", children }) {
  const tone = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <span className={[tone, className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}
