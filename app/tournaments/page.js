import Link from "next/link";
import { getSeasonList, formatDateRange, formatFee } from "@/lib/data";

export const revalidate = 30;

export const metadata = { title: "Tournaments — AFA Southern Utah" };

export default async function TournamentsPage() {
  const tournaments = await getSeasonList();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-afa-navy">Tournaments</h1>
      {tournaments.length === 0 ? (
        <p className="text-afa-ink/70">No tournaments on file yet.</p>
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tournaments/${t.slug}`}
                className="block bg-white rounded-lg shadow border border-afa-navy/10 p-4 hover:border-afa-red"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-afa-navy">{t.name}</h2>
                  {t.is_placeholder && (
                    <span className="text-xs font-bold bg-yellow-100 text-yellow-900 px-2 py-1 rounded">
                      PLACEHOLDER
                    </span>
                  )}
                </div>
                <p className="text-sm text-afa-ink/80 mt-1">
                  {formatDateRange(t.start_date, t.end_date)} &middot;{" "}
                  {t.venue_name}
                  {t.entry_fee_cents != null &&
                    ` · ${formatFee(t.entry_fee_cents)}`}
                </p>
                {t.divisions_offered && (
                  <p className="text-sm text-afa-ink/60 mt-1">
                    {t.divisions_offered}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
