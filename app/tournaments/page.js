import Link from "next/link";
import { getSeasonListByRegion, formatDateRange, formatFee } from "@/lib/data";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";

export const revalidate = 30;

export const metadata = { title: "Tournaments — AFA Southern Utah" };

// A poster_url still pointing at the 2026 season-schedule flyer is the
// shared placeholder every row was seeded with, not a real per-event
// poster — no thumbnail for those (afa-dispatch-brief-2.md).
const PLACEHOLDER_POSTER = "posters/2026-schedule.jpg";

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
            <h2 className="font-display text-lg text-afa-navy/80 mb-2 flex items-center gap-2">
              {group.label}
              <Chip variant="muted">
                {group.tournaments.length}{" "}
                {group.tournaments.length === 1 ? "event" : "events"}
              </Chip>
            </h2>
            <div className="space-y-2">
              {/* Southern Utah tournaments run brackets/registration on this
                  site; other regions are published schedule only — the
                  row is plain text, not a link, until that region has a
                  page of its own to link to. */}
              {group.tournaments.map((t) =>
                group.region === "southern_utah" ? (
                  <Link key={t.id} href={`/tournaments/${t.slug}`} className="block group">
                    <Card className="hover:border-afa-navy/50">
                      <TournamentRow t={t} linked />
                    </Card>
                  </Link>
                ) : (
                  <Card key={t.id}>
                    <TournamentRow t={t} />
                  </Card>
                )
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function TournamentRow({ t, linked }) {
  const hasRealPoster = t.poster_url && !t.poster_url.includes(PLACEHOLDER_POSTER);
  const divisionChips = t.divisions_offered
    ? t.divisions_offered
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
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
        {divisionChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {divisionChips.map((d) => (
              <Chip key={d}>{d}</Chip>
            ))}
          </div>
        )}
      </div>
      {hasRealPoster && (
        <img
          src={t.poster_url}
          alt={`${t.name} poster`}
          className="w-14 h-14 shrink-0 rounded object-cover"
        />
      )}
    </div>
  );
}
