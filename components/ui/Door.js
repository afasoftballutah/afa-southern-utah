// Door — tappable navigation card.
// Color law: info (blue) = permanent destinations; transient (white + ink
// outline) = temporary paths; default stays a plain white card for anything
// that has not been classified yet.

import Link from "next/link";

const TONE = {
  // Permanent information
  info: "door door--info",
  // Transient information
  transient: "door door--transient",
  // Unclassified (legacy)
  default: "door",
};

export default function Door({ href, title, sub, tone = "default" }) {
  const surface = TONE[tone] ?? TONE.default;
  return (
    <Link href={href} className={`${surface} min-h-11`}>
      <p className="door__title">{title}</p>
      {sub && <p className="door__sub">{sub}</p>}
    </Link>
  );
}
