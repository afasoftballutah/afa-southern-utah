"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import PosterCarousel from "@/components/PosterCarousel";
import HomeRecentResults from "@/components/HomeRecentResults";
import {
  getRegionPrefSnapshot,
  getRegionPrefServerSnapshot,
  subscribeRegionPref,
} from "@/lib/region-pref";

/**
 * Home dash + poster deck filtered by the site-wide region map preference.
 * Server builds full payloads; this only chooses which slice to show.
 * Defaults each region (and the all-regions view) to its **next** tournament.
 */
export default function HomeRegionContent({
  posterSlides = [],
  lastByRegion = {},
  upcomingByRegion = {},
  resultEventsByRegion = {},
  /** Region of the next global upcoming event — used when no map pick. */
  defaultRegion = "southern_utah",
}) {
  const pref = useSyncExternalStore(
    subscribeRegionPref,
    getRegionPrefSnapshot,
    getRegionPrefServerSnapshot
  );

  // Explicit map pick filters one region. Clear/deselect → all regions again.
  const filtered = Boolean(pref);

  const slides = useMemo(() => {
    if (!filtered) return posterSlides;
    return posterSlides.filter((s) => s.region === pref);
  }, [posterSlides, pref, filtered]);

  // Dash content must track select/deselect — not stick on defaultRegion after clear.
  const lastEvent = useMemo(() => {
    if (filtered) return lastByRegion[pref] ?? null;
    // All regions: most recent "last" by region order of next event, prefer any non-null
    // Prefer defaultRegion's last, else first available in REGION-ish order of keys
    if (lastByRegion[defaultRegion]) return lastByRegion[defaultRegion];
    for (const e of Object.values(lastByRegion)) {
      if (e) return e;
    }
    return null;
  }, [filtered, pref, lastByRegion, defaultRegion]);

  const upcomingEvents = useMemo(() => {
    if (filtered) return upcomingByRegion[pref] ?? [];
    // Merge all regions, soonest first, cap 3
    const merged = Object.values(upcomingByRegion).flatMap((list) => list ?? []);
    return merged
      .slice()
      .sort((a, b) => {
        // when is display text; prefer slug order from posterSlides startDate if needed
        const ia = posterSlides.findIndex((s) => s.id === a.id);
        const ib = posterSlides.findIndex((s) => s.id === b.id);
        if (ia >= 0 && ib >= 0) return ia - ib;
        return String(a.when ?? "").localeCompare(String(b.when ?? ""));
      })
      .slice(0, 3);
  }, [filtered, pref, upcomingByRegion, posterSlides]);

  const resultEvents = useMemo(() => {
    if (filtered) {
      return (
        resultEventsByRegion[pref] ??
        resultEventsByRegion[defaultRegion] ??
        []
      );
    }
    return Object.values(resultEventsByRegion).flatMap((list) => list ?? []);
  }, [filtered, pref, resultEventsByRegion, defaultRegion]);

  // Lock card geometry to the *widest / tallest* region so switching stars
  // does not reflow the dash (empty regions would otherwise shrink the cards).
  const layoutLock = useMemo(() => {
    let maxUpcoming = 0;
    let maxWhen = 10;
    let maxName = 12;
    let maxWhere = 16;
    let maxResultsLabel = 18;
    let hasAnyLast = false;

    for (const list of Object.values(upcomingByRegion)) {
      const rows = list ?? [];
      maxUpcoming = Math.max(maxUpcoming, rows.length);
      for (const e of rows) {
        maxWhen = Math.max(maxWhen, String(e.when ?? "").length);
        maxName = Math.max(maxName, String(e.name ?? "").length);
        maxWhere = Math.max(
          maxWhere,
          [e.where, e.fee, e.gg].filter(Boolean).join(" · ").length
        );
      }
    }
    for (const e of Object.values(lastByRegion)) {
      if (!e) continue;
      hasAnyLast = true;
      maxWhen = Math.max(maxWhen, String(e.when ?? "").length);
      maxName = Math.max(maxName, String(e.name ?? "").length);
      maxWhere = Math.max(
        maxWhere,
        [e.where, e.fee, e.gg].filter(Boolean).join(" · ").length
      );
    }
    for (const list of Object.values(resultEventsByRegion)) {
      for (const e of list ?? []) {
        const label = e.when ? `${e.when} · ${e.name}` : e.name;
        maxResultsLabel = Math.max(maxResultsLabel, String(label ?? "").length);
      }
    }

    return {
      maxUpcoming: Math.max(maxUpcoming, 1),
      maxWhen,
      maxName,
      maxWhere,
      maxResultsLabel,
      hasAnyLast,
    };
  }, [upcomingByRegion, lastByRegion, resultEventsByRegion]);

  const dashStyle = {
    ["--home-upcoming-n"]: layoutLock.maxUpcoming,
    ["--home-when-ch"]: layoutLock.maxWhen,
    ["--home-name-ch"]: layoutLock.maxName,
    ["--home-where-ch"]: layoutLock.maxWhere,
    ["--home-results-label-ch"]: layoutLock.maxResultsLabel,
  };

  return (
    <>
      {slides.length > 0 ? (
        <PosterCarousel
          key={pref || "all"}
          slides={slides}
          resetKey={pref || "all"}
        />
      ) : (
        <p className="home-dash__empty" style={{ textAlign: "center", padding: "1rem" }}>
          {filtered
            ? "No flyers for this region yet — tap the star again for all regions."
            : "No flyers yet."}
        </p>
      )}

      <section
        className="home-dash home-dash--two home-dash--region-lock"
        aria-label="Season snapshot"
        style={dashStyle}
      >
        <article className="home-dash__card">
          {/* Always reserve last-tournament block height if any region has one */}
          {(lastEvent || layoutLock.hasAnyLast) && (
            <>
              <h2>Last Tournament</h2>
              <div className="home-events home-events--last">
                {lastEvent ? (
                  <Link
                    href={`/tournaments/${lastEvent.slug}`}
                    className="home-event home-event--completed"
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
                    <span className="home-event__results-pill">Results</span>
                  </Link>
                ) : (
                  <div
                    className="home-event home-event--completed home-event--placeholder"
                    aria-hidden="true"
                  >
                    <span className="home-event__when">&nbsp;</span>
                    <span className="home-event__main">
                      <span className="home-event__name">&nbsp;</span>
                      <span className="home-event__where">&nbsp;</span>
                    </span>
                    <span className="home-event__results-pill">Results</span>
                  </div>
                )}
              </div>
            </>
          )}

          <h2 className={lastEvent || layoutLock.hasAnyLast ? "home-events__section-title" : undefined}>
            Upcoming Events
          </h2>
          <div className="home-events home-events--upcoming-lock">
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((ev) => (
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
              ))
            ) : (
              <p className="home-dash__empty">
                {lastEvent
                  ? "No upcoming events posted yet."
                  : "Nothing on the calendar yet."}
              </p>
            )}
          </div>
          <Link href="/tournaments" className="home-events__more">
            Show full list
          </Link>
        </article>

        <HomeRecentResults
          key={pref || "all"}
          events={resultEvents}
        />
      </section>
    </>
  );
}
