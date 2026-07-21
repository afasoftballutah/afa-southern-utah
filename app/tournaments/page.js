import Link from "next/link";
import { getSeasonList, formatDateRange, formatFee } from "@/lib/data";

export const revalidate = 30;

export const metadata = { title: "Tournaments — AFA Southern Utah" };

export default async function TournamentsPage() {
  const tournaments = await getSeasonList();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-afa-navy">Tournaments</h1>
      {tournaments.length === 0 ? (
        <p className="text-afa-ink/70">Nothing on the calendar yet — check back.</p>
      ) : (
        <div>
          {tournaments.map((t, i) => (
            <div key={t.id}>
              {i > 0 && <div className="chalk-line" />}
              <Link href={`/tournaments/${t.slug}`} className="block py-2 group">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-xl text-afa-navy group-hover:underline">
                    {t.name}
                  </h2>
                  {t.is_placeholder && (
                    <span className="text-xs font-bold text-afa-ink/50 shrink-0">
                      placeholder
                    </span>
                  )}
                </div>
                <p className="text-sm text-afa-ink/80 mt-1">
                  {formatDateRange(t.start_date, t.end_date)} &middot; {t.venue_name}
                  {t.entry_fee_cents != null && ` · ${formatFee(t.entry_fee_cents)}`}
                </p>
                {t.divisions_offered && (
                  <p className="text-sm text-afa-ink/60 mt-1">{t.divisions_offered}</p>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
