"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import {
  formatDateRange,
  formatFee,
  isRealPoster,
  isGroupName,
  schedulePosterForRegion,
  REGION_LABEL,
} from "@/lib/data";
import { parseLeagueDateOnly } from "@/lib/league-time";
import {
  getRegionPrefSnapshot,
  getRegionPrefServerSnapshot,
  subscribeRegionPref,
} from "@/lib/region-pref";

const STORAGE_KEY = "afa-tournaments-view";

// Same localStorage-via-useSyncExternalStore pattern as the bracket
// Bracket|List toggle (components/bracket/BracketTree.js) — avoids a
// hydration mismatch reading localStorage directly during render.
function subscribeStorage(callback) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getStoredView() {
  return window.localStorage.getItem(STORAGE_KEY);
}
function getStoredViewServer() {
  return null;
}

const MONTH_LABEL = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function byStartDateAsc(a, b) {
  return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0;
}
function byStartDateDesc(a, b) {
  return -byStartDateAsc(a, b);
}

function groupByMonth(tournaments) {
  const map = new Map();
  for (const t of tournaments) {
    const d = parseLeagueDateOnly(t.start_date);
    if (!d) continue;
    const key = `${d.year}-${d.month}`;
    if (!map.has(key)) map.set(key, { year: d.year, month: d.month, tournaments: [] });
    map.get(key).tournaments.push(t);
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

/**
 * Upcoming-first + By region | By month tabs + past expander
 * (dispatch-brief-3). Server component (app/tournaments/page.js) fetches
 * via getSeasonListByRegion and passes the grouped result straight
 * through — all sorting/grouping/filtering here works off data already on
 * the page, no client-side fetch.
 */
export default function TournamentBrowser({ groups }) {
  const [explicitView, setExplicitView] = useState(null);
  const storedView = useSyncExternalStore(subscribeStorage, getStoredView, getStoredViewServer);
  const view = explicitView ?? (storedView === "month" ? "month" : "region");
  const [showPast, setShowPast] = useState(false);
  const regionPref = useSyncExternalStore(
    subscribeRegionPref,
    getRegionPrefSnapshot,
    getRegionPrefServerSnapshot
  );

  function choose(next) {
    setExplicitView(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }

  // Honor home map filter: only that region’s groups when set.
  const scopedGroups = useMemo(() => {
    if (!regionPref) return groups;
    return groups.filter((g) => g.region === regionPref);
  }, [groups, regionPref]);

  // Past is derived: status is rarely written, so a finished tournament
  // (games settled, moot if-games excluded) counts as past even when the
  // row still says "upcoming". status === "complete" still covers older
  // seed rows with no game data.
  const isPast = (t) => t.status === "complete" || t.finished === true;

  // Public upcoming = has a real event poster. Others stay listed but
  // greyed (not linked / not registerable) until a flyer is posted.
  const isPublic = (t) => isRealPoster(t);

  const upcomingPublicByRegion = scopedGroups
    .map((g) => ({
      ...g,
      tournaments: g.tournaments.filter((t) => !isPast(t) && isPublic(t)),
    }))
    .filter((g) => g.tournaments.length > 0)
    .map((g) => ({ ...g, tournaments: [...g.tournaments].sort(byStartDateAsc) }));

  const upcomingUnpublished = scopedGroups
    .flatMap((g) =>
      g.tournaments
        .filter((t) => !isPast(t) && !isPublic(t))
        .map((t) => ({ ...t, regionLabel: g.label }))
    )
    .sort(byStartDateAsc);

  const pastByRegion = scopedGroups
    .map((g) => ({ ...g, tournaments: g.tournaments.filter(isPast) }))
    .filter((g) => g.tournaments.length > 0)
    .map((g) => ({ ...g, tournaments: [...g.tournaments].sort(byStartDateDesc) }));

  const pastCount = pastByRegion.reduce((sum, g) => sum + g.tournaments.length, 0);

  const upcomingByMonth = groupByMonth(
    scopedGroups
      .flatMap((g) =>
        g.tournaments
          .filter((t) => !isPast(t) && isPublic(t))
          .map((t) => ({ ...t, regionLabel: g.label }))
      )
      .sort(byStartDateAsc)
  );

  return (
    <div className="space-y-6">
      {regionPref ? (
        <p className="t-meta">
          Filtered to <strong>{REGION_LABEL[regionPref] ?? regionPref}</strong>
          {" · "}
          <Link href="/#region-map" className="underline">
            Change on the map
          </Link>
        </p>
      ) : null}

      {/* View switch — same footprint; selected = info (blue), idle = transient */}
      <div className="seg-view" role="group" aria-label="Group tournaments by">
        <button
          type="button"
          onClick={() => choose("region")}
          className={view === "region" ? "btn-info" : "btn-transient"}
          aria-pressed={view === "region"}
        >
          By region
        </button>
        <button
          type="button"
          onClick={() => choose("month")}
          className={view === "month" ? "btn-info" : "btn-transient"}
          aria-pressed={view === "month"}
        >
          By month
        </button>
      </div>

      {view === "region" ? (
        <RegionView groups={upcomingPublicByRegion} />
      ) : (
        <MonthView months={upcomingByMonth} />
      )}

      {upcomingUnpublished.length > 0 && (
        <UnpublishedScheduleBlock tournaments={upcomingUnpublished} />
      )}

      {pastCount > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="btn-transient"
          >
            {showPast ? "Hide past tournaments" : `Past tournaments (${pastCount})`}
          </button>
          {showPast && (
            <div className="mt-4">
              <RegionView groups={pastByRegion} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Greyed calendar of events without flyers + overall schedule image(s). */
function UnpublishedScheduleBlock({ tournaments }) {
  const regions = [...new Set(tournaments.map((t) => t.region))];
  const scheduleUrls = [
    ...new Set(regions.map((r) => schedulePosterForRegion(r)).filter(Boolean)),
  ];

  return (
    <section className="tournament-unpublished" aria-label="Coming soon">
      <h2 className="t-heading mb-1">Coming soon</h2>
      <p className="t-meta mb-3">
        On the calendar — flyer and registration open when the poster posts.
      </p>
      <div className="tournament-unpublished__box">
        <ul className="tournament-unpublished__list">
          {tournaments.map((t) => (
            <li key={t.id} className="tournament-unpublished__row">
              <span className="tournament-unpublished__name">{t.name}</span>
              <span className="tournament-unpublished__meta">
                {[formatDateRange(t.start_date, t.end_date), t.venue_name, t.regionLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="tournament-unpublished__badge" aria-hidden="true">
                Poster pending
              </span>
              {/* Non-working register control — visible but disabled */}
              <button
                type="button"
                className="btn-action tournament-unpublished__reg"
                disabled
                title="Registration opens when the tournament flyer is posted"
              >
                Register
              </button>
            </li>
          ))}
        </ul>
        {scheduleUrls.length > 0 && (
          <div className="tournament-unpublished__schedules">
            <p className="t-label mb-2">Overall schedule</p>
            {scheduleUrls.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="tournament-unpublished__schedule-link"
              >
                <img src={src} alt="Season schedule" className="tournament-unpublished__schedule" />
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RegionView({ groups }) {
  if (groups.length === 0) {
    return <p className="text-afa-ink/70">Nothing on the calendar yet — check back.</p>;
  }
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.region}>
          <h2 className="t-heading mb-2 flex items-center gap-2">
            {group.label}
            <Chip variant="muted">
              {group.tournaments.length} {group.tournaments.length === 1 ? "event" : "events"}
            </Chip>
          </h2>
          <div className="space-y-2">
            {group.tournaments.map((t) => (
              <TournamentRowCard key={t.id} t={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MonthView({ months }) {
  if (months.length === 0) {
    return <p className="text-afa-ink/70">Nothing on the calendar yet — check back.</p>;
  }
  let prevYear = null;
  return (
    <div className="space-y-6">
      {months.map(({ year, month, tournaments }) => {
        const showYear = year !== prevYear;
        prevYear = year;
        return (
          <section key={`${year}-${month}`}>
            <h2 className="t-heading mb-2">
              {MONTH_LABEL[month]}
              {showYear ? ` ${year}` : ""}
            </h2>
            <div className="space-y-2">
              {tournaments.map((t) => (
                <TournamentRowCard key={t.id} t={t} showRegionChip={t.regionLabel} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}


/** Trophy + team + division, capped at 3 with "+N more". */
function ChampionLine({ champions }) {
  const list = champions ?? [];
  if (list.length === 0) return null;
  const shown = list.slice(0, 3);
  const more = list.length - shown.length;
  return (
    <div className="mt-1.5 space-y-0.5">
      {shown.map((c) => (
        <p
          key={`${c.divisionName}-${c.team}`}
          className="text-sm font-semibold text-afa-ink/85"
        >
          <span aria-hidden="true">🏆</span> {c.team}
          <span className="font-normal text-afa-ink/55"> · {c.divisionName}</span>
        </p>
      ))}
      {more > 0 && (
        <p className="text-xs font-semibold text-afa-muted">+{more} more</p>
      )}
    </div>
  );
}

function TournamentRowCard({ t, showRegionChip }) {
  // Public detail pages only for events with a real poster. Southern Utah
  // + poster → linked lobby; everything else is static list copy.
  // Full lobby only for events this app runs (Southern Utah home base, plus
  // Fredonia which we still host even though it’s listed under AZ).
  const homeBase =
    t.region_raw === "southern_utah" ||
    t.slug === "2026-coed-fredonia" ||
    (t.region_raw == null && t.region === "southern_utah");
  const linked = homeBase && isRealPoster(t);
  const row = <TournamentRow t={t} linked={linked} showRegionChip={showRegionChip} />;
  if (linked) {
    return (
      <Link href={`/tournaments/${t.slug}`} className="block group tournament-row">
        {row}
      </Link>
    );
  }
  return <div className="tournament-row tournament-row--static">{row}</div>;
}

function TournamentRow({ t, linked, showRegionChip }) {
  const hasRealPoster = isRealPoster(t);
  const rawDivisionChips = t.divisions_offered
    ? t.divisions_offered.split(",").map((d) => d.trim()).filter(Boolean)
    : [];
  // Groups line (dispatch-brief-6, TASK D, JD ruling) — the tournament's
  // division rows (today: Men's/Women's/Coed) as a quiet small-caps label,
  // not chips. Chips below stay the divisions (Rec/E/D/Open...).
  const groupNames = (t.divisions ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((d) => d.display_name ?? d.name);

  // No double-speak: chips render only entries that AREN'T group names.
  // If nothing survives, the group line above already carries that
  // information — no chips row — UNLESS there are no division rows
  // either, in which case fall back to the unfiltered list so the card
  // never loses information entirely.
  const filteredDivisionChips = rawDivisionChips.filter((d) => !isGroupName(d));
  const divisionChips =
    filteredDivisionChips.length > 0
      ? filteredDivisionChips
      : groupNames.length > 0
        ? []
        : rawDivisionChips;

  // Facts line (JD ruling, dispatch-brief-3): date · venue · fee · GG.
  const factsParts = [formatDateRange(t.start_date, t.end_date), t.venue_name];
  if (t.entry_fee_cents != null) factsParts.push(formatFee(t.entry_fee_cents));
  if (t.game_guarantee) factsParts.push(t.game_guarantee);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`font-display text-xl text-afa-navy ${linked ? "group-hover:underline" : ""}`}
          >
            {t.name}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {showRegionChip && <Chip variant="muted">{showRegionChip}</Chip>}
            {t.is_placeholder && (
              <span className="text-xs font-bold text-afa-ink/50">placeholder</span>
            )}
          </div>
        </div>
        <p className="text-sm text-afa-ink/80 mt-1">{factsParts.join(" · ")}</p>
        <ChampionLine champions={t.champions} />
        {groupNames.length > 0 && (
          <p className="text-[11px] font-bold uppercase tracking-wide text-afa-muted mt-1.5">
            {groupNames.join(" · ")}
          </p>
        )}
        {divisionChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {divisionChips.map((d) => (
              <Chip key={d}>{d}</Chip>
            ))}
          </div>
        )}
      </div>
      {hasRealPoster && (
        <img
          src={t.poster_url}
          alt={`${t.name} poster`}
          className="tournament-row__poster"
        />
      )}
    </div>
  );
}
