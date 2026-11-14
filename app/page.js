import Link from "next/link";
import {
  getRecentCompletedTournaments,
  getRecentResultTournaments,
  getSeasonListByRegion,
  withArchiveSummaries,
  formatFee,
  isPublicEvent,
  REGION_ORDER,
  canonicalRegion,
} from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isPastTournament } from "@/lib/tournament-state";
import { recentFinalsByGender, recentGamesByGender, RESULT_GENDER_KEYS } from "@/lib/home-recent";
import { buildPosterDeckSlides, nextTournament } from "@/lib/poster-deck";
import { venueParts } from "@/lib/director";
import { listPublishedNews, formatNewsDate, newsImageUrls } from "@/lib/news";
import Card from "@/components/ui/Card";
import MyTeamStrip from "@/components/MyTeamStrip";
import HomeHeaderScrollLock from "@/components/HomeHeaderScrollLock";
import RegionMap from "@/components/RegionMap";
import HomeRegionContent from "@/components/HomeRegionContent";

export const revalidate = 30;

// Home — Last Tournament + Upcoming Events | Recent Results.
// Upcoming / past come from tournamentPhase (lib/tournament-state): dates in
// the tournament's own zone, or every game final. Never trust status —
// Heat Stroker stayed "upcoming" after it finished (spec-signup-flow).
export default async function Home() {
  const configured = isSupabaseConfigured();
  const [recentCompleted, recentResults, rawSeasonGroups, newsPosts] = configured
    ? await Promise.all([
        getRecentCompletedTournaments(8),
        getRecentResultTournaments(8),
        getSeasonListByRegion(),
        listPublishedNews({ limit: 8 }),
      ])
    : [[], [], [], []];

  // Newest finished event (placements gallery + left-column “Last Tournament”)
  const lastResults = recentCompleted[0] ?? null;

  // finished + champions for poster deck (and any archive-aware home UI)
  const seasonGroups = configured
    ? await withArchiveSummaries(rawSeasonGroups)
    : [];

  const hasPlacements = (lastResults?.divisions ?? []).some(
    (d) => (d.placements ?? []).length > 0
  );

  // One clock for the whole page; each tournament reads it in its own zone.
  const today = new Date();
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);
  const eventEnd = (t) => dateOnly(t.end_date) ?? dateOnly(t.start_date);
  const isPastByDate = (t) => Boolean(eventEnd(t)) && isPastTournament(t, today);
  const isUpcomingByDate = (t) =>
    !t?.is_placeholder && Boolean(eventEnd(t)) && !isPastTournament(t, today);

  const posterSlides = buildPosterDeckSlides(seasonGroups, {
    today,
    formatWhen: formatDateRangeNoYear,
  });

  function toEventCard(t) {
    if (!t) return null;
    // Short venue for dense home cards ("Canyons", not "The Canyons Sports Complex")
    const venueShort = venueParts(t.venue_name, t.venue_address).name || t.venue_name;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      when: formatDateRangeNoYear(t.start_date, t.end_date),
      where: venueShort || null,
      fee: t.entry_fee_cents != null ? formatFee(t.entry_fee_cents) : null,
      gg: t.game_guarantee,
    };
  }

  // Per-region last / upcoming / results for the map filter.
  // Upcoming is always sorted next-first (soonest start).
  const lastByRegion = {};
  const upcomingByRegion = {};
  const resultEventsByRegion = {};

  for (const region of REGION_ORDER) {
    const list =
      seasonGroups.find((g) => g.region === region)?.tournaments ?? [];

    const lastT =
      list
        .filter(isPastByDate)
        .slice()
        .sort((a, b) => {
          const da = eventEnd(a) ?? "";
          const db = eventEnd(b) ?? "";
          return da < db ? 1 : da > db ? -1 : 0;
        })[0] ?? null;
    // Southern Utah prefers the recent-completed helper when available
    if (region === "southern_utah" && lastResults) {
      lastByRegion[region] = toEventCard(lastResults);
    } else {
      lastByRegion[region] = toEventCard(lastT);
    }

    upcomingByRegion[region] = list
      .filter((t) => isUpcomingByDate(t) && isPublicEvent(t))
      .slice()
      .sort((a, b) => {
        const da = String(a.start_date ?? "");
        const db = String(b.start_date ?? "");
        return da < db ? -1 : da > db ? 1 : 0;
      })
      .slice(0, 3)
      .map(toEventCard)
      .filter(Boolean);

    resultEventsByRegion[region] = [];
  }

  // Default region = where the next site-wide event is (not always Southern Utah)
  const globalNext =
    nextTournament(
      seasonGroups.flatMap((g) => g.tournaments ?? []),
      today
    ) ?? null;
  const defaultRegion = globalNext
    ? canonicalRegion(globalNext)
    : "southern_utah";

  // Recent Results: newest tournament with scored finals, including an
  // in-progress event (Worlds). Bucketed by region for the map filter.
  const resultSource =
    recentResults.length > 0
      ? recentResults
      : lastByRegion.southern_utah
        ? [lastResults].filter(Boolean)
        : [];
  for (const t of resultSource) {
    const genderFinals = recentFinalsByGender(t);
    const recentGames = recentGamesByGender(t);
    const hasFinal = RESULT_GENDER_KEYS.some(
      (k) => (genderFinals[k] ?? []).length > 0
    );
    if (!hasFinal) continue;
    const row = {
      id: t.id,
      slug: t.slug,
      name: t.name,
      when: formatDateRangeNoYear(t.start_date, t.end_date),
      startDate: t.start_date,
      genderFinals,
      recentGames,
    };
    const r = canonicalRegion(t);
    if (!resultEventsByRegion[r]) resultEventsByRegion[r] = [];
    resultEventsByRegion[r].push(row);
  }

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
        {/*
          Map is a direct child of the full-bleed hero so % / vw placement
          tracks the eagle/bat art, not the content-column gutter.
        */}
        <div id="region-map" className="home-hero__region">
          <RegionMap compact />
        </div>
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
        <HomeRegionContent
          posterSlides={posterSlides}
          lastByRegion={lastByRegion}
          upcomingByRegion={upcomingByRegion}
          resultEventsByRegion={resultEventsByRegion}
          defaultRegion={defaultRegion}
        />

        <div className="home-me">
          <MyTeamStrip />
        </div>

        {/* News — director posts + optional AFA poster branding */}
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
                src="/afa-we-want-you-v2.webp"
                alt="AFA We Want You — play for AFA. America's recreational sport played as it should be."
                className="home-news__poster"
                width={800}
                height={1000}
              />
            </a>
            <div className="home-news__aside">
              {newsPosts.length > 0 ? (
                <ul className="home-news__feed">
                  {newsPosts.map((p) => {
                    const images = newsImageUrls(p);
                    return (
                      <li key={p.id} className="home-news__item">
                        <p className="home-news__item-date">
                          {formatNewsDate(p.published_at)}
                        </p>
                        <p className="home-news__item-title">{p.title}</p>
                        <p className="home-news__item-body">{p.body}</p>
                        {images.length > 0 ? (
                          <ul
                            className={
                              images.length === 1
                                ? "home-news__gallery home-news__gallery--one"
                                : "home-news__gallery"
                            }
                          >
                            {images.map((src, i) => (
                              <li key={`${p.id}-img-${i}`}>
                                <a
                                  href={src}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="home-news__gallery-link"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt=""
                                    className="home-news__gallery-img"
                                    loading="lazy"
                                  />
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {p.link_url ? (
                          <a
                            href={p.link_url}
                            className="home-news__item-link"
                            {...(p.link_url.startsWith("http")
                              ? {
                                  target: "_blank",
                                  rel: "noopener noreferrer",
                                }
                              : {})}
                          >
                            {p.link_label || "Read more →"}
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <>
                  <p className="home-news__aside-lead">
                    We want you — to play for AFA.
                  </p>
                  <p className="home-news__aside-body">
                    Ask about our leagues and tournaments in your area. Follow
                    AFA Sports and AFA Nation on Facebook.
                  </p>
                </>
              )}
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
