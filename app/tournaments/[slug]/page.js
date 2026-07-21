import { notFound } from "next/navigation";
import {
  getTournamentBySlug,
  formatDateRange,
  formatFee,
} from "@/lib/data";

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

  return (
    <div className="space-y-6">
      {tournament.poster_url && (
        <img
          src={tournament.poster_url}
          alt={`${tournament.name} poster`}
          className="w-full h-auto rounded-lg shadow"
        />
      )}

      <div>
        <h1 className="text-2xl font-black text-afa-navy">
          {tournament.name}
        </h1>
        {tournament.is_placeholder && (
          <p className="inline-block mt-1 bg-yellow-100 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
            PLACEHOLDER DATA — shown for reference, not a live event
          </p>
        )}
      </div>

      <dl className="bg-white rounded-lg shadow border border-afa-navy/10 p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
        <div className="bg-white rounded-lg shadow border border-afa-navy/10 p-4">
          <h2 className="font-bold text-afa-navy mb-2">Contacts</h2>
          <ul className="text-sm space-y-1">
            {tournament.contacts.map((c, i) => (
              <li key={i}>
                {c.name}
                {c.phone ? ` — ${c.phone}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-xl font-black text-afa-navy mb-3">
          Results
        </h2>
        {(tournament.divisions ?? []).every(
          (d) => (d.placements ?? []).length === 0
        ) ? (
          <p className="text-afa-ink/70 text-sm">
            No results posted for this event yet.
          </p>
        ) : (
          <div className="space-y-4">
            {tournament.divisions.map((division) =>
              division.placements.length === 0 ? null : (
                <div
                  key={division.id}
                  className="bg-white rounded-lg shadow border border-afa-navy/10 p-4"
                >
                  <p className="font-semibold text-afa-navy">
                    {division.name}
                  </p>
                  <ul className="text-sm mt-2 space-y-2">
                    {division.placements.map((p) => (
                      <li key={p.id} className="flex items-center gap-3">
                        {p.photo_url && (
                          <img
                            src={p.photo_url}
                            alt={`${p.team_name} — ${p.place}`}
                            className="w-16 h-16 object-cover rounded"
                          />
                        )}
                        <span>
                          {p.place === "champion" ? "Champion" : "Runner-Up"}:{" "}
                          <span className="font-semibold">{p.team_name}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
