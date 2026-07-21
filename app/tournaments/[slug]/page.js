import { notFound } from "next/navigation";
import {
  getTournamentBySlug,
  formatDateRange,
  formatFee,
} from "@/lib/data";
import BracketTree from "@/components/bracket/BracketTree";

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `${tournament.name} — AFA Southern Utah` : "Tournament" };
}

export default async function TournamentDetailPage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const noResults = (tournament.divisions ?? []).every((d) => (d.placements ?? []).length === 0);
  const bracketDivisions = (tournament.divisions ?? []).filter((d) => (d.brackets ?? []).length > 0);

  return (
    <div className="space-y-6">
      {tournament.poster_url && (
        <div className="poster-frame max-w-md mx-auto">
          <img src={tournament.poster_url} alt={`${tournament.name} poster`} />
        </div>
      )}

      <div className="text-center">
        <h1 className="font-display text-3xl text-afa-navy">{tournament.name}</h1>
        {tournament.is_placeholder && (
          <p className="text-sm text-afa-ink/60 mt-1">
            Shown for reference — last year&rsquo;s poster, not a live date.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="font-semibold">Dates</dt>
        <dd>{formatDateRange(tournament.start_date, tournament.end_date)}</dd>
        <dt className="font-semibold">Venue</dt>
        <dd>
          {tournament.venue_name}
          {tournament.venue_address ? `, ${tournament.venue_address}` : ""}
        </dd>
        {tournament.entry_fee_cents != null && (
          <>
            <dt className="font-semibold">Entry Fee</dt>
            <dd>{formatFee(tournament.entry_fee_cents)}</dd>
          </>
        )}
        {tournament.deposit_cents != null && (
          <>
            <dt className="font-semibold">Deposit</dt>
            <dd>{formatFee(tournament.deposit_cents)}</dd>
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
        {tournament.fb_album_url && (
          <>
            <dt className="font-semibold">Photos</dt>
            <dd>
              <a
                href={tournament.fb_album_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-afa-navy"
              >
                Facebook album
              </a>
            </dd>
          </>
        )}
      </dl>

      {Array.isArray(tournament.contacts) && tournament.contacts.length > 0 && (
        <>
          <div className="chalk-line" />
          <div>
            <h2 className="text-lg font-bold text-afa-navy mb-2">Contacts</h2>
            <ul className="text-sm space-y-1">
              {tournament.contacts.map((c, i) => (
                <li key={i}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="chalk-line" />

      <div>
        <h2 className="text-lg font-bold text-afa-navy mb-3">Results</h2>
        {noResults ? (
          <p className="text-afa-ink/70 text-sm">No results yet — check back after the next tournament.</p>
        ) : (
          <div className="space-y-4">
            {tournament.divisions.map((division) =>
              division.placements.length === 0 ? null : (
                <div key={division.id} className="chalk-panel">
                  <p className="font-semibold text-afa-navy mb-2">{division.name}</p>
                  <div className="grid grid-cols-2 gap-4">
                    {["champion", "runner_up"].map((place) => {
                      const p = division.placements.find((x) => x.place === place);
                      if (!p) return null;
                      return (
                        <figure key={place} className="text-center">
                          {p.photo_url && (
                            <img src={p.photo_url} alt={p.team_name} className="w-full h-auto rounded" />
                          )}
                          <figcaption className="text-sm mt-1">
                            {place === "champion" ? "Champion" : "Runner-Up"} — {p.team_name}
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {bracketDivisions.length > 0 && (
        <>
          <div className="chalk-line" />
          <div>
            <h2 className="text-lg font-bold text-afa-navy mb-3">Bracket</h2>
            <div className="space-y-8">
              {bracketDivisions.map((division) => (
                <div key={division.id}>
                  <p className="font-semibold text-afa-navy mb-2">{division.name}</p>
                  <BracketTree division={division} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
