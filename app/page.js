import Link from "next/link";
import {
  getHeroTournament,
  getLastCompletedTournamentResults,
  formatDateRange,
  formatFee,
} from "@/lib/data";

export const revalidate = 30;

export default async function Home() {
  const [{ tournament, confirmed }, lastResults] = await Promise.all([
    getHeroTournament(),
    getLastCompletedTournamentResults(),
  ]);

  return (
    <div className="space-y-8">
      <section>
        {!confirmed && (
          <p className="mb-3 font-semibold text-afa-navy">
            2026 schedule coming soon — check back.
          </p>
        )}
        {tournament ? (
          <PosterHero tournament={tournament} placeholder={!confirmed} />
        ) : (
          <p className="text-afa-ink/70">Nothing on the calendar yet — check back.</p>
        )}
      </section>

      <div className="chalk-line" />

      <section>
        <h2 className="text-xl font-bold text-afa-navy mb-3">Last Results</h2>
        {lastResults ? (
          <ResultsGallery tournament={lastResults} />
        ) : (
          <p className="text-afa-ink/70">No results yet — check back after the next tournament.</p>
        )}
      </section>

      <div className="chalk-line" />

      <section className="text-center py-4">
        <Link
          href="/register"
          className="inline-block bg-afa-red text-white font-bold text-lg px-8 py-4 rounded-lg"
        >
          Register a Team
        </Link>
      </section>
    </div>
  );
}

function PosterHero({ tournament, placeholder }) {
  // Placeholder (reference-only) hero sits deliberately smaller and quieter
  // than a real confirmed event would — it's a "here's what one looks like,"
  // not the main event (Lacy, cosmetic fix 2026-07-21).
  const posterWidth = placeholder ? "max-w-xs" : "max-w-md";
  const titleSize = placeholder ? "text-xl" : "text-3xl";
  const dlSize = placeholder ? "text-xs" : "text-sm";

  return (
    <div className="space-y-3">
      {tournament.poster_url && (
        <div className={`poster-frame ${posterWidth} mx-auto`}>
          <img src={tournament.poster_url} alt={`${tournament.name} poster`} loading="eager" />
        </div>
      )}
      <div className="text-center">
        <h1 className={`font-display ${titleSize} text-afa-navy`}>{tournament.name}</h1>
        {placeholder && (
          <p className="text-xs text-afa-ink/60 mt-1">
            Shown for reference — last year&rsquo;s poster, not a live date.
          </p>
        )}
      </div>
      <dl className={`grid grid-cols-2 gap-x-4 gap-y-1 ${dlSize} ${posterWidth} mx-auto`}>
        <dt className="font-semibold">Dates</dt>
        <dd>{formatDateRange(tournament.start_date, tournament.end_date)}</dd>
        <dt className="font-semibold">Venue</dt>
        <dd>{tournament.venue_name}</dd>
        {tournament.entry_fee_cents != null && (
          <>
            <dt className="font-semibold">Entry Fee</dt>
            <dd>{formatFee(tournament.entry_fee_cents)}</dd>
          </>
        )}
        {tournament.game_guarantee && (
          <>
            <dt className="font-semibold">Game Guarantee</dt>
            <dd>{tournament.game_guarantee}</dd>
          </>
        )}
        {tournament.divisions_offered && (
          <>
            <dt className="font-semibold">Divisions</dt>
            <dd>{tournament.divisions_offered}</dd>
          </>
        )}
      </dl>
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
