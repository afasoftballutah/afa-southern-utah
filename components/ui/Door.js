// Door — the tappable navigation card (component grammar, phase 1).
// A Link wrapping a default Card; the whole card is the tap target.

import Link from "next/link";
import Card from "./Card";

export default function Door({ href, title, sub }) {
  return (
    <Link href={href} className="block min-h-11">
      <Card className="h-full hover:border-afa-navy/50">
        <p className="font-bold text-afa-navy">{title}</p>
        {sub && <p className="text-xs text-afa-ink/60 mt-1">{sub}</p>}
      </Card>
    </Link>
  );
}
