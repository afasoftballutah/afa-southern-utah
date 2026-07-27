import { notFound } from "next/navigation";
import Link from "next/link";
import { getTeamPageBySlug, formatDateRange } from "@/lib/data";
import { LEAGUE_TZ } from "@/lib/bracket/tree";
import Card from "@/components/ui/Card";
import MatchupCard from "@/components/ui/MatchupCard";

export const revalidate = 30;

function whenParts(scheduledTime) {
  if (!scheduledTime) return { whenDay: "", whenTime: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LEAGUE_TZ,
  }).formatToParts(new Date(scheduledTime));
  const get = (t) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return {
    whenDay: get("weekday"),
    whenTime: `${get("hour")}${min !== "00" ? ":" + min : ""} ${get("dayPeriod")}`,
  };
}

const fieldShort = (f) => (f ? String(f).replace(/^Field\s*/i, "F") : "");

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getTeamPageBySlug(slug);
  return { title: page ? `${page.name} — AFA Southern Utah` : "Team" };
}

export default async function TeamPage({ params }) {
  const { slug } = await params;
  const page = await getTeamPageBySlug(slug);
  if (!page) notFound();

  const multi = page.identities.length > 1;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="t-meta">
          <Link href="/tournaments" className="text-afa-navy underline decoration-afa-navy/30 underline-offset-2">
            Tournaments
          </Link>
        </p>
        <h1 className="team-name mt-1 text-3xl font-bold uppercase tracking-wide text-afa-navy">
          {page.name}
        </h1>
        {!multi && (
          <p className="t-body mt-1">
            {page.tournamentCount} {page.tournamentCount === 1 ? "tournament" : "tournaments"}
            {" \u00b7 "}
            {page.totalW}&ndash;{page.totalL}
          </p>
        )}
      </div>

      {page.identities.map((identity) => (
        <section key={identity.key ?? identity.label ?? "one"} className="space-y-3">
          {multi && (
            <div>
              <h2 className="t-heading">
                {identity.label ?? "Team"}
              </h2>
              <p className="t-body">
                {identity.tournaments.length}{" "}
                {identity.tournaments.length === 1 ? "tournament" : "tournaments"}
                {" \u00b7 "}
                {identity.totalW}&ndash;{identity.totalL}
              </p>
            </div>
          )}

          {identity.tournaments.map((card) => (
            <TournamentCard key={card.tournament?.id ?? card.stage} card={card} />
          ))}
        </section>
      ))}
    </div>
  );
}

function TournamentCard({ card }) {
  const t = card.tournament;
  if (!t) return null;
  const divName = card.division?.display_name ?? card.division?.name ?? "";
  let finishLine = card.stage;
  if (card.medal && card.place === 1) {
    // "🏆 Gold champion"
    finishLine = `${card.medal} ${divName} champion`.replace(/\s+/g, " ").trim();
  } else if (card.medal && card.placement) {
    finishLine = `${card.medal} ${card.placement}`.trim();
  } else if (card.placement) {
    finishLine = card.placement;
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/tournaments/${t.slug}`}
            className="font-display text-lg text-afa-navy hover:underline"
          >
            {t.name}
          </Link>
          <p className="t-meta">
            {formatDateRange(t.start_date, t.end_date)}
          </p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums text-afa-ink/80">
          {card.w}&ndash;{card.l}
        </p>
      </div>

      {finishLine && (
        <p className="text-sm font-semibold text-afa-ink/85">{finishLine}</p>
      )}

      {card.games.length === 0 ? (
        <p className="t-body">No games yet.</p>
      ) : (
        <div className="space-y-2">
          {card.games.map((g) => {
            const { whenDay, whenTime } = whenParts(g.scheduledTime);
            const href =
              g.tournamentSlug && g.divisionId
                ? g.pool
                  ? `/tournaments/${g.tournamentSlug}/division/${g.divisionId}?pool=${encodeURIComponent(g.pool)}&pg=${g.id}`
                  : g.round
                    ? `/tournaments/${g.tournamentSlug}/division/${g.divisionId}?game=${g.round}`
                    : `/tournaments/${g.tournamentSlug}/division/${g.divisionId}`
                : null;
            const body = (
              <MatchupCard
                meta={{ field: fieldShort(g.field), day: whenDay, time: whenTime }}
                caption={[g.divisionName, g.label].filter(Boolean).join(" \u00b7 ")}
                division={g.divisionName}
                team1={g.team1}
                team2={g.team2}
                score1={g.score1}
                score2={g.score2}
                isFinal={g.isFinal}
              />
            );
            return href ? (
              <Link
                key={g.id}
                href={href}
                className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40"
              >
                {body}
              </Link>
            ) : (
              <div key={g.id}>{body}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
