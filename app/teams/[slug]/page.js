import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTeamPageBySlug } from "@/lib/team-page-data";
import { formatDateRange } from "@/lib/data";
import { LEAGUE_TZ, gameWhenShort } from "@/lib/bracket/tree";
import Card from "@/components/ui/Card";
import MatchupCard from "@/components/ui/MatchupCard";
import { shortField } from "@/lib/venues";
import { identityLabel } from "@/lib/teams";

export const revalidate = 30;

// In the game's own tournament zone; "2 PM PST" when not league time.
function whenParts(scheduledTime, timeZone) {
  const { day, time } = gameWhenShort(scheduledTime, timeZone ?? LEAGUE_TZ);
  return { whenDay: day, whenTime: time };
}

const fieldShort = (f) => shortField(f);

function seatSummary(seats) {
  const labels = [];
  const seen = new Set();
  for (const s of seats ?? []) {
    const label = s.divisionName || identityLabel(s.gender, s.className);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function tournamentNames(seats) {
  const names = [];
  const seen = new Set();
  for (const s of seats ?? []) {
    const key = s.tournamentId || s.tournamentName;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (s.tournamentName) names.push(s.tournamentName);
  }
  return names;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getTeamPageBySlug(slug);
  if (!page) return { title: "Team" };
  if (page.kind === "chooser") return { title: `${page.name} teams — AFA Southern Utah` };
  return { title: `${page.name} — AFA Southern Utah` };
}

export default async function TeamPage({ params }) {
  const { slug } = await params;
  const page = await getTeamPageBySlug(slug);
  if (!page) notFound();

  // Old manager / short-id slugs from the first version of this work
  // resolve to the same club; send them on to the readable URL.
  if (page.kind === "team" && page.slug && page.slug !== slug) {
    redirect(`/teams/${page.slug}`);
  }

  if (page.kind === "chooser") {
    return <ChooserPage page={page} />;
  }

  const subtitle = [
    page.label,
    page.managerName,
  ].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="t-meta">
          {page.sharedName ? (
            <Link href={`/teams/${page.nameSlug}`} className="btn-transient">
              ← All {page.name} teams
            </Link>
          ) : (
            <Link href="/tournaments" className="btn-transient">
              ← Tournaments
            </Link>
          )}
        </p>
        <h1 className="team-name mt-1 text-3xl font-bold uppercase tracking-wide text-afa-navy">
          {page.name}
        </h1>
        {page.sharedName && subtitle && <p className="t-body mt-1">{subtitle}</p>}
        <p className="t-body mt-1">
          {page.tournamentCount} {page.tournamentCount === 1 ? "tournament" : "tournaments"}
          {" \u00b7 "}
          {page.totalW}&ndash;{page.totalL}
        </p>
      </div>

      {page.identities.map((identity) => (
        <section key={identity.key ?? identity.label ?? "one"} className="space-y-3">
          {identity.tournaments.map((card) => (
            <TournamentCard key={card.tournament?.id ?? card.stage} card={card} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ChooserPage({ page }) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="t-meta">
          <Link href="/tournaments" className="btn-transient">
            ← Tournaments
          </Link>
        </p>
        <h1 className="team-name mt-1 text-3xl font-bold uppercase tracking-wide text-afa-navy">
          {page.name}
        </h1>
        <p className="t-body mt-1">
          {page.options.length} teams share this name. Pick one.
        </p>
      </div>

      <div className="space-y-3">
        {page.options.map((opt) => {
          const divisions = seatSummary(opt.seats);
          const events = tournamentNames(opt.seats);
          const count = opt.tournamentCount;
          return (
            <Link
              key={opt.id}
              href={opt.href}
              className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40"
            >
              <Card className="space-y-1">
                <p className="team-name font-display text-lg text-afa-navy">
                  {opt.name}
                </p>
                <p className="t-body">
                  {[opt.label, opt.managerName].filter(Boolean).join(" · ") || "Team"}
                </p>
                {divisions.length > 0 && !opt.label && (
                  <p className="t-meta">{divisions.join(" · ")}</p>
                )}
                <p className="t-meta">
                  {count} {count === 1 ? "tournament" : "tournaments"}
                  {events.length ? ` · ${events.join(", ")}` : ""}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
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
            const { whenDay, whenTime } = whenParts(g.scheduledTime, g.timeZone);
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
