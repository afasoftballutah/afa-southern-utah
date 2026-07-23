import Link from "next/link";
import { getSeasonListByRegion, formatDateRange, formatFee } from "@/lib/data";

export const revalidate = 30;

export const metadata = { title: "Tournaments — AFA Southern Utah" };

export default async function TournamentsPage() {
  const groups = await getSeasonListByRegion();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-afa-navy">Tournaments</h1>
      {groups.length === 0 ? (
        <p className="text-afa-ink/70">Nothing on the calendar yet — check back.</p>
      ) : (
        groups.map((group) => (
          <section key={group.region}>
            <h2 className="font-display text-lg text-afa-navy/80 mb-2">
              {group.label}
            </h2>
            <div>
              {group.tournaments.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="chalk-line" />}
                  {/* Southern Utah tournaments run brackets/registration on this
                      site; other regions are published schedule only — the
                      row is plain text, not a link, until that region has a
                      page of its own to link to. */}
                  {group.region === "southern_utah" ? (
                    <Link href={`/tournaments/${t.slug}`} className="block py-2 group">
                      <TournamentRow t={t} linked />
                    </Link>
                  ) : (
                    <div className="block py-2">
                      <TournamentRow t={t} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function TournamentRow({ t, linked }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3
          className={`font-display text-xl text-afa-navy ${linked ? "group-hover:underline" : ""}`}
        >
          {t.name}
        </h3>
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
    </>
  );
}
