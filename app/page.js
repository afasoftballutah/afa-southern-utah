import Link from "next/link";
import {
  getHeroTournament,
  getLastCompletedTournamentResults,
  formatDateRange,
  formatFee,
} from "@/lib/data";

export const revalidate = 30;

// Home is a hub, not a poster frame (JD ruling 2026-07-23, from the Navarro
// pattern): the mascot owns the top as the identity moment, and under him
// sit obvious task-shaped doors — next tournament, schedules, rules,
// register. Per-event posters live on each tournament's own page.
export default async function Home() {
  const [{ tournament, confirmed }, lastResults] = await Promise.all([
    getHeroTournament(),
    getLastCompletedTournamentResults(),
  ]);

  return (
    <div className="space-y-8">
      {/* The mascot — front page, always. Cropped to the eagle, name/facts
          never over the art. */}
      <section className="max-w-md mx-auto">
        <div className="overflow-hidden rounded-lg">
          <img
            src="/afa-mascot.jpg"
            alt=""
            aria-hidden="true"
            loading="eager"
            className="w-full h-52 sm:h-72 object-cover object-top"
          />
        </div>
      </section>

      {/* Obvious places to go. The next tournament is the featured door. */}
      <section className="max-w-md mx-auto space-y-3">
        {tournament ? (
          <Link
            href={`/tournaments/${tournament.slug}`}
            className="block bg-afa-navy text-white rounded-lg p-4 hover:opacity-95"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-white/70">
              {confirmed ? "Next Tournament" : "Most Recent"}
            </p>
            <p className="font-display text-2xl mt-1">{tournament.name}</p>
            <p className="text-sm text-white/90 mt-1">
              {formatDateRange(tournament.start_date, tournament.end_date)} &middot;{" "}
              {tournament.venue_name}
              {tournament.entry_fee_cents != null &&
                ` · ${formatFee(tournament.entry_fee_cents)}`}
              {tournament.game_guarantee && ` · ${tournament.game_guarantee}`}
            </p>
          </Link>
        ) : (
          <div className="block bg-afa-navy/10 text-afa-ink rounded-lg p-4">
            <p className="text-sm">Nothing on the calendar yet — check back.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/tournaments"
            className="block bg-white border border-afa-navy/20 rounded-lg p-4 text-center hover:border-afa-navy/50"
          >
            <p className="font-bold text-afa-navy">Schedules</p>
            <p className="text-xs text-afa-ink/60 mt-1">All regions, all dates</p>
          </Link>
          <Link
            href="/rules"
            className="block bg-white border border-afa-navy/20 rounded-lg p-4 text-center hover:border-afa-navy/50"
          >
            <p className="font-bold text-afa-navy">Rules</p>
            <p className="text-xs text-afa-ink/60 mt-1">How we play</p>
          </Link>
        </div>

        <Link
          href="/register"
          className="block bg-afa-red text-white font-bold text-lg rounded-lg p-4 text-center"
        >
          Register a Team
        </Link>
      </section>

      <div className="chalk-line" />

      <section>
        <h2 className="text-xl font-bold text-afa-navy mb-3">Last Results</h2>
        {lastResults ? (
          <ResultsGallery tournament={lastResults} />
        ) : (
          <p className="text-afa-ink/70">
            No results yet — check back after the next tournament.
          </p>
        )}
      </section>
    </div>
  );
}

function ResultsGallery({ tournament }) {
  const divisionsWithPlacements = (tournament.divisions ?? []).filter(
    (d) => (d.placements ?? []).length > 0
  );
  return (
    <div className="space-y-4">
      <p className="font-semibold text-afa-navy">{tournament.name}</p>
      {divisionsWithPlacements.length === 0 ? (
        <p className="text-afa-ink/70 text-sm">No results yet — check back after the next tournament.</p>
      ) : (
        divisionsWithPlacements.map((division) => (
          <div key={division.id} className="chalk-panel">
            <p className="font-semibold text-sm text-afa-navy mb-2">{division.name}</p>
            <div className="grid grid-cols-2 gap-4">
              {["champion", "runner_up"].map((place) => {
                const p = division.placements.find((x) => x.place === place);
                if (!p) return null;
                return (
                  <figure key={place} className="text-center">
                    {p.photo_url && (
                      <img
                        src={p.photo_url}
                        alt={`${p.team_name}`}
                        className="w-full h-auto rounded"
                      />
                    )}
                    <figcaption className="text-sm mt-1">
                      {place === "champion" ? "Champion" : "Runner-Up"} — {p.team_name}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
