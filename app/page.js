import Link from "next/link";
import {
  getHeroTournament,
  getLastCompletedTournamentResults,
  getRecentScores,
  formatDateRange,
  formatFee,
} from "@/lib/data";
import Matchup from "@/components/ui/Matchup";
import { formatFieldTime } from "@/lib/bracket/tree";
import Card from "@/components/ui/Card";
import Door from "@/components/ui/Door";
import Poster from "@/components/ui/Poster";

export const revalidate = 30;

// Home is a hub, not a poster frame (JD ruling 2026-07-23, from the Navarro
// pattern): the mascot owns the top as the identity moment, and under him
// sit obvious task-shaped doors — next tournament, schedules, rules,
// register. Per-event posters live on each tournament's own page.
export default async function Home() {
  const [{ tournament, confirmed }, lastResults, recentScores] = await Promise.all([
    getHeroTournament(),
    getLastCompletedTournamentResults(),
    getRecentScores(5),
  ]);

  // Which tournament does this results section actually describe?
  const hasPlacements = (lastResults?.divisions ?? []).some(
    (d) => (d.placements ?? []).length > 0
  );
  const resultsTournamentName = hasPlacements
    ? lastResults?.name
    : (recentScores[0]?.tournamentName ?? tournament?.name ?? lastResults?.name ?? null);

  return (
    <div className="space-y-6">
      {/* The mascot — front page, always. Cropped to the eagle, name/facts
          never over the art. Same rounded-lg/border treatment Poster uses
          for its default eagle, so the two read as one family. */}
      <section className="max-w-md mx-auto">
        <Poster posterUrl={null} className="h-52 sm:h-72" />
      </section>

      {/* Obvious places to go. The next tournament is the featured door. */}
      <section className="max-w-md mx-auto space-y-3">
        {tournament ? (
          <Link href={`/tournaments/${tournament.slug}`} className="block hover:opacity-95">
            <Card variant="navy">
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
            </Card>
          </Link>
        ) : (
          <div className="block bg-afa-navy/10 text-afa-ink rounded-lg p-4">
            <p className="text-sm">Nothing on the calendar yet — check back.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Door href="/tournaments" title="Schedules" sub="All regions, all dates" />
          <Door href="/rules" title="Rules" sub="How we play" />
        </div>

        <Link
          href="/register"
          className="block bg-afa-red text-white font-bold text-lg rounded-lg p-4 text-center"
        >
          Register a Team
        </Link>
      </section>

      <div className="chalk-line" />

      {/* Scores beat an empty promise (JD, 2026-07-24). "Check back after
          the next tournament" was exactly wrong during a live one, where
          finals land every hour.
          The NAME over this section must be the tournament the content
          actually belongs to (JD, 2026-07-24). It used to always name the
          last COMPLETED tournament, so during a live weekend it read "Heat
          Stroker" (July 10-11, finished) above scores coming from "Coed
          Heat Stroker" (happening now) — right data, wrong name. Order of
          preference: real placements win, then whichever tournament the
          recent scores came from, then the one on deck. */}
      <section className="max-w-md mx-auto">
        <h2 className="text-xl font-bold text-afa-navy mb-3">
          {hasPlacements ? "Last Results" : "Recent Scores"}
        </h2>
        {resultsTournamentName && (
          <p className="font-semibold text-afa-navy mb-2">{resultsTournamentName}</p>
        )}
        {hasPlacements ? (
          <ResultsGallery tournament={lastResults} recentScores={recentScores} showName={false} />
        ) : recentScores.length > 0 ? (
          <RecentScores scores={recentScores} />
        ) : (
          <p className="text-afa-ink/70">
            No scores yet — they appear here as games finish.
          </p>
        )}
      </section>
    </div>
  );
}

// A result on the home page used to be a dead end (JD, 2026-07-26:
// "people expect to be able to click into them and see the game"). Each
// one now opens its own division, on the stage that game belongs to, with
// the game itself picked out of the drawing.
function resultHref(g) {
  if (!g.tournamentSlug || !g.divisionId) return null;
  const base = `/tournaments/${g.tournamentSlug}/division/${g.divisionId}`;
  if (g.pool) return `${base}?pool=${encodeURIComponent(g.pool)}&pg=${g.id}`;
  if (g.round) return `${base}?game=${g.round}`;
  return base;
}

function RecentScores({ scores }) {
  return (
    <div className="space-y-2">
      {scores.map((g) => {
        const href = resultHref(g);
        const card = (
          <Matchup
            caption={[formatFieldTime(g), g.divisionName, g.label].filter(Boolean).join(" · ")}
            team1={g.team1}
            team2={g.team2}
            score1={g.score1}
            score2={g.score2}
            isFinal
          />
        );
        return href ? (
          <Link
            key={g.id}
            href={href}
            className="block rounded-lg transition hover:brightness-[.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40"
          >
            {card}
          </Link>
        ) : (
          <div key={g.id}>{card}</div>
        );
      })}
    </div>
  );
}

function ResultsGallery({ tournament, recentScores = [], showName = true }) {
  const divisionsWithPlacements = (tournament.divisions ?? []).filter(
    (d) => (d.placements ?? []).length > 0
  );
  return (
    <div className="space-y-4">
      {showName && <p className="font-semibold text-afa-navy">{tournament.name}</p>}
      {divisionsWithPlacements.length === 0 ? (
        recentScores.length > 0 ? (
          <RecentScores scores={recentScores} />
        ) : (
          <p className="text-afa-ink/70 text-sm">
            No scores yet — they appear here as games finish.
          </p>
        )
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
