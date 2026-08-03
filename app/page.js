import Link from "next/link";
import {
  getRecentCompletedTournaments,
  getSeasonListByRegion,
  withArchiveSummaries,
  formatFee,
  isRealPoster,
} from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { leagueToday } from "@/lib/tournament-state";
import { championshipGameOf } from "@/lib/bracket/if-game";
import { buildPosterDeckSlides } from "@/lib/poster-deck";
import Card from "@/components/ui/Card";
import MyTeamStrip from "@/components/MyTeamStrip";
import PosterCarousel from "@/components/PosterCarousel";
import HomeRecentResults from "@/components/HomeRecentResults";
import HomeHeaderScrollLock from "@/components/HomeHeaderScrollLock";

export const revalidate = 30;

// Home — Last Tournament + Upcoming Events | Recent Results.
// Upcoming is date-derived (end_date >= today). Never trust status —
// Heat Stroker stayed "upcoming" after it finished (spec-signup-flow).
export default async function Home() {
  const configured = isSupabaseConfigured();
  const [recentCompleted, rawSeasonGroups] = configured
    ? await Promise.all([
        getRecentCompletedTournaments(8),
        getSeasonListByRegion(),
      ])
    : [[], []];

  // Newest finished event (placements gallery + left-column “Last Tournament”)
  const lastResults = recentCompleted[0] ?? null;

  // finished + champions for poster deck (and any archive-aware home UI)
  const seasonGroups = configured
    ? await withArchiveSummaries(rawSeasonGroups)
    : [];

  const hasPlacements = (lastResults?.divisions ?? []).some(
    (d) => (d.placements ?? []).length > 0
  );

  const today = leagueToday();
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);
  const eventEnd = (t) => dateOnly(t.end_date) ?? dateOnly(t.start_date);
  const isPastByDate = (t) => {
    const end = eventEnd(t);
    return Boolean(end && end < today);
  };
  const isUpcomingByDate = (t) => {
    if (t?.is_placeholder) return false;
    const end = eventEnd(t);
    return Boolean(end && end >= today);
  };

  const southernAll =
    seasonGroups.find((g) => g.region === "southern_utah")?.tournaments ?? [];

  const posterSlides = buildPosterDeckSlides(seasonGroups, {
    today,
    formatWhen: formatDateRangeNoYear,
  });

  // Last finished: prefer archive helper; else latest past by end date.
  let lastTournament = lastResults;
  if (!lastTournament) {
    lastTournament =
      southernAll
        .filter(isPastByDate)
        .slice()
        .sort((a, b) => {
          const da = eventEnd(a) ?? "";
          const db = eventEnd(b) ?? "";
          return da < db ? 1 : da > db ? -1 : 0;
        })[0] ?? null;
  }

  const lastEvent = lastTournament
    ? {
        id: lastTournament.id,
        slug: lastTournament.slug,
        name: lastTournament.name,
        when: formatDateRangeNoYear(
          lastTournament.start_date,
          lastTournament.end_date
        ),
        where: lastTournament.venue_name,
        fee:
          lastTournament.entry_fee_cents != null
            ? formatFee(lastTournament.entry_fee_cents)
            : null,
        gg: lastTournament.game_guarantee,
      }
    : null;

  // Truly upcoming + real event poster only (no schedule placeholders).
  const upcomingEvents = southernAll
    .filter((t) => isUpcomingByDate(t) && isRealPoster(t))
    .slice()
    .sort((a, b) => {
      const da = String(a.start_date ?? "");
      const db = String(b.start_date ?? "");
      return da < db ? -1 : da > db ? 1 : 0;
    })
    .slice(0, 3)
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      when: formatDateRangeNoYear(t.start_date, t.end_date),
      where: t.venue_name,
      fee: t.entry_fee_cents != null ? formatFee(t.entry_fee_cents) : null,
      gg: t.game_guarantee,
    }));

  // Recent Results dropdown: finished events that have at least one final.
  const resultEvents = (recentCompleted.length > 0
    ? recentCompleted
    : lastTournament
      ? [lastTournament]
      : []
  )
    .map((t) => {
      const genderFinals = championshipsByGender(t);
      const hasFinal = GENDER_KEYS.some(
        (k) => (genderFinals[k] ?? []).length > 0
      );
      if (!hasFinal) return null;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        when: formatDateRangeNoYear(t.start_date, t.end_date),
        genderFinals,
      };
    })
    .filter(Boolean);

  return (
    <div className="home">
      <HomeHeaderScrollLock />
      {/* Hero is its own band; dash floats up over the foot (Imagine separation). */}
      <section className="home-hero" aria-label="AFA Southern Utah">
        <div
          className="home-hero__bg"
          role="img"
          aria-label="AFA eagle mascot on red rock desert"
        />
        <div className="home-hero__inner">
          <div className="home-hero__copy">
            <h1 className="home-hero__title">Softball as it should be</h1>
            <p className="home-hero__tagline">
              Great events, good times, family fun, best prizes, politics free.
            </p>
            <div className="home-hero__ctas">
              <Link href="/tournaments" className="home-cta home-cta--action">
                Tournaments
              </Link>
              <Link href="/register" className="home-cta home-cta--action">
                Register
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="home-dash-wrap">
        {posterSlides.length > 0 && <PosterCarousel slides={posterSlides} />}

        <div className="home-me">
          <MyTeamStrip />
        </div>

        <section className="home-dash home-dash--two" aria-label="Season snapshot">
          <article className="home-dash__card">
            {lastEvent && (
              <>
                <h2>Last Tournament</h2>
                <div className="home-events home-events--last">
                  <Link
                    href={`/tournaments/${lastEvent.slug}`}
                    className="home-event"
                  >
                    <span className="home-event__when">{lastEvent.when}</span>
                    <span className="home-event__main">
                      <span className="home-event__name">{lastEvent.name}</span>
                      <span className="home-event__where">
                        {[lastEvent.where, lastEvent.fee, lastEvent.gg]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="home-event__cta" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </div>
              </>
            )}

            <h2 className={lastEvent ? "home-events__section-title" : undefined}>
              Upcoming Events
            </h2>
            {upcomingEvents.length > 0 ? (
              <div className="home-events">
                {upcomingEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href={`/tournaments/${ev.slug}`}
                    className="home-event"
                  >
                    <span className="home-event__when">{ev.when}</span>
                    <span className="home-event__main">
                      <span className="home-event__name">{ev.name}</span>
                      <span className="home-event__where">
                        {[ev.where, ev.fee, ev.gg].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="home-event__cta" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="home-dash__empty">
                {lastEvent
                  ? "No upcoming events posted yet."
                  : "Nothing on the calendar yet."}
              </p>
            )}
            <Link href="/tournaments" className="home-events__more">
              Show full list
            </Link>
          </article>

          <HomeRecentResults events={resultEvents} />
        </section>

        {/* News — under dash; poster is the AFA “We Want You” piece */}
        <section id="news" className="home-news" aria-label="News">
        <h2 className="home-news__title">News</h2>
        <div className="home-news__poster-wrap">
          <a
            href="https://www.afasoftball.com"
            target="_blank"
            rel="noopener noreferrer"
            className="home-news__poster-link"
          >
            <img
              src="/afa-we-want-you.png"
              alt="AFA We Want You — play for AFA. America's recreational sport played as it should be."
              className="home-news__poster"
              width={800}
              height={1000}
            />
          </a>
          <div className="home-news__aside">
            <p className="home-news__aside-lead">We want you — to play for AFA.</p>
            <p className="home-news__aside-body">
              Ask about our leagues and tournaments in your area. Follow AFA
              Sports and AFA Nation on Facebook.
            </p>
            <ul className="home-news__aside-links">
              <li>
                <Link href="/register" className="home-cta home-cta--action">
                  Register a team
                </Link>
              </li>
              <li>
                <a
                  href="https://www.afasoftball.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="home-news__ext"
                >
                  afasoftball.com →
                </a>
              </li>
              <li>
                <a
                  href="https://www.afaslowpitch.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="home-news__ext"
                >
                  afaslowpitch.com →
                </a>
              </li>
            </ul>
          </div>
        </div>
        </section>
      </div>

      {hasPlacements && (
        <div className="home-body-extra">
          <h2 className="t-heading mb-3">Champions</h2>
          <ResultsGallery tournament={lastResults} showName={false} />
        </div>
      )}
    </div>
  );
}

const GENDER_KEYS = ["womens", "mens", "coed"];

/**
 * Every decided championship final, grouped by gender (Women's / Men's / Coed).
 * Gold / Silver / Bronze (and any other finished bracket under that gender)
 * each get their own matchup card — not only the top bracket.
 */
function championshipsByGender(tournament) {
  const out = { womens: [], mens: [], coed: [] };
  if (!tournament) return out;

  const divisions = tournament.divisions ?? [];
  const byId = new Map(divisions.map((d) => [d.id, d]));

  const genderOf = (d) => {
    if (d.gender === "womens" || d.gender === "mens" || d.gender === "coed") {
      return d.gender;
    }
    if (d.parent_division_id) {
      const p = byId.get(d.parent_division_id);
      if (p?.gender === "womens" || p?.gender === "mens" || p?.gender === "coed") {
        return p.gender;
      }
      const pn = String(p?.display_name ?? p?.name ?? "").toLowerCase();
      if (pn.includes("women")) return "womens";
      if (/\bmen/.test(pn) && !pn.includes("women")) return "mens";
      if (pn.includes("coed") || pn.includes("co-ed")) return "coed";
    }
    const n = String(d.display_name ?? d.name ?? "").toLowerCase();
    if (n.includes("women")) return "womens";
    if (/\bmen/.test(n) && !n.includes("women")) return "mens";
    if (n.includes("coed") || n.includes("co-ed")) return "coed";
    return null;
  };

  const bracketRank = (name) => {
    if (/^gold$/i.test(name)) return 0;
    if (/^silver$/i.test(name)) return 1;
    if (/^bronze$/i.test(name)) return 2;
    return 10;
  };

  const candidates = [];
  for (const d of divisions) {
    const game = championshipGameOf(d.games ?? []);
    if (!game) continue;
    const gender = genderOf(d);
    if (!gender) continue;
    const name = d.display_name ?? d.name ?? "";
    candidates.push({ d, game, gender, name });
  }

  for (const key of Object.keys(out)) {
    const pool = candidates
      .filter((c) => c.gender === key)
      .sort((a, b) => {
        const br = bracketRank(a.name) - bracketRank(b.name);
        if (br !== 0) return br;
        const so = (a.d.sort_order ?? 0) - (b.d.sort_order ?? 0);
        if (so !== 0) return so;
        return a.name.localeCompare(b.name);
      });

    out[key] = pool.map((pick) => {
      const g = pick.game;
      const tint = /^gold$/i.test(pick.name)
        ? "Gold"
        : /^silver$/i.test(pick.name)
          ? "Silver"
          : /^bronze$/i.test(pick.name)
            ? "Bronze"
            : null;
      // Always show bracket/division name (Gold, Silver, Coed, Men's D, …)
      const caption = pick.name || "Championship";
      return {
        key: pick.d.id,
        team1: g.team1_name,
        team2: g.team2_name,
        score1: g.team1_score,
        score2: g.team2_score,
        caption,
        divisionTint: tint,
        divisionName: pick.name,
      };
    });
  }
  return out;
}

/** Date range without year — home upcoming list only. */
function formatDateRangeNoYear(startDate, endDate) {
  if (!startDate) return "";
  const start = new Date(startDate + "T00:00:00");
  const end = new Date((endDate || startDate) + "T00:00:00");
  const opts = { month: "long", day: "numeric" };
  if (startDate === endDate || !endDate) {
    return start.toLocaleDateString("en-US", opts);
  }
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString("en-US", opts);
  return `${startStr}–${endStr}`;
}

function ResultsGallery({ tournament, showName = true }) {
  const divisionsWithPlacements = (tournament.divisions ?? []).filter(
    (d) => (d.placements ?? []).length > 0
  );
  return (
    <div className="space-y-4">
      {showName && <p className="t-strong">{tournament.name}</p>}
      {divisionsWithPlacements.length === 0 ? (
        <p className="home-dash__empty">No results posted yet.</p>
      ) : (
        divisionsWithPlacements.map((division) => (
          <Card key={division.id}>
            <p className="t-strong text-sm mb-2">{division.name}</p>
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
                      {place === "champion" ? "Champion" : "Runner-Up"} —{" "}
                      {p.team_name}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
