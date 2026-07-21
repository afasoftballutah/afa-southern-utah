import Link from "next/link";
import {
  getUpcomingTournament,
  getLastCompletedTournamentResults,
  formatDateRange,
  formatFee,
} from "@/lib/data";

export const revalidate = 30;

export default async function Home() {
  const [upcoming, lastResults] = await Promise.all([
    getUpcomingTournament(),
    getLastCompletedTournamentResults(),
  ]);

  return (
    <div className="space-y-10">
      <section>
        {upcoming ? (
          <UpcomingCard tournament={upcoming} />
        ) : (
          <NoUpcomingCard />
        )}
      </section>

      <section>
        <h2 className="text-xl font-black text-afa-navy mb-3">
          Last Tournament&rsquo;s Results
        </h2>
        {lastResults ? (
          <ResultsCard tournament={lastResults} />
        ) : (
          <p className="text-afa-ink/70">
            No results on file yet. Once a tournament wraps up, champions and
            runners-up show up here.
          </p>
        )}
      </section>

      <section className="text-center py-6">
        <Link
          href="/register"
          className="inline-block bg-afa-red text-white font-bold text-lg px-8 py-4 rounded-lg shadow"
        >
          Register a Team
        </Link>
      </section>
    </div>
  );
}

function UpcomingCard({ tournament }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden border border-afa-navy/10">
      {tournament.poster_url && (
        // Plain <img>, not next/image — keeps the free-tier story simple:
        // no dependency on Vercel's image-transform quota, ever.
        <img
          src={tournament.poster_url}
          alt={`${tournament.name} poster`}
          className="w-full h-auto"
          loading="eager"
        />
      )}
      <div className="p-4 space-y-2">
        <h1 className="text-2xl font-black text-afa-navy">
          {tournament.name}
        </h1>
        {tournament.is_placeholder && (
          <p className="inline-block bg-yellow-100 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
            PLACEHOLDER DATA — 2026 schedule pending from the director
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
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
    </div>
  );
}

function NoUpcomingCard() {
  return (
    <div className="bg-white rounded-lg shadow border border-afa-navy/10 p-6 text-center space-y-3">
      <h1 className="text-xl font-black text-afa-navy">
        2026 schedule coming soon
      </h1>
      <p className="text-afa-ink/80">
        The next tournament isn&rsquo;t posted yet. Check{" "}
        <Link href="/tournaments" className="underline font-semibold">
          Tournaments
        </Link>{" "}
        for last year&rsquo;s lineup as a reference for what&rsquo;s coming.
      </p>
    </div>
  );
}

function ResultsCard({ tournament }) {
  const divisionsWithPlacements = (tournament.divisions ?? []).filter(
    (d) => (d.placements ?? []).length > 0
  );
  return (
    <div className="bg-white rounded-lg shadow border border-afa-navy/10 p-4 space-y-4">
      <h3 className="font-bold text-afa-navy">{tournament.name}</h3>
      {divisionsWithPlacements.length === 0 ? (
        <p className="text-afa-ink/70 text-sm">
          Results haven&rsquo;t been posted for this event yet.
        </p>
      ) : (
        divisionsWithPlacements.map((division) => (
          <div key={division.id} className="border-t border-afa-navy/10 pt-3">
            <p className="font-semibold text-sm text-afa-navy">
              {division.name}
            </p>
            <ul className="text-sm mt-1 space-y-1">
              {division.placements.map((p) => (
                <li key={p.id}>
                  {p.place === "champion" ? "Champion" : "Runner-Up"}:{" "}
                  <span className="font-semibold">{p.team_name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
