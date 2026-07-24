"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import { formatDateRange, formatFee, isRealPoster, isGroupName } from "@/lib/data";

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
    const d = new Date(`${t.start_date}T00:00:00`);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map.has(key)) map.set(key, { year: d.getFullYear(), month: d.getMonth(), tournaments: [] });
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

  function choose(next) {
    setExplicitView(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }

  const upcomingByRegion = groups
    .map((g) => ({ ...g, tournaments: g.tournaments.filter((t) => t.status !== "complete") }))
    .filter((g) => g.tournaments.length > 0)
    .map((g) => ({ ...g, tournaments: [...g.tournaments].sort(byStartDateAsc) }));

  const pastByRegion = groups
    .map((g) => ({ ...g, tournaments: g.tournaments.filter((t) => t.status === "complete") }))
    .filter((g) => g.tournaments.length > 0)
    .map((g) => ({ ...g, tournaments: [...g.tournaments].sort(byStartDateDesc) }));

  const pastCount = pastByRegion.reduce((sum, g) => sum + g.tournaments.length, 0);

  const upcomingByMonth = groupByMonth(
    groups
      .flatMap((g) =>
        g.tournaments
          .filter((t) => t.status !== "complete")
          .map((t) => ({ ...t, regionLabel: g.label }))
      )
      .sort(byStartDateAsc)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => choose("region")}
          className={`font-semibold ${view === "region" ? "text-afa-navy underline" : "text-afa-ink/50"}`}
        >
          By region
        </button>
        <span className="text-afa-ink/30">|</span>
        <button
          type="button"
          onClick={() => choose("month")}
          className={`font-semibold ${view === "month" ? "text-afa-navy underline" : "text-afa-ink/50"}`}
        >
          By month
        </button>
      </div>

      {view === "region" ? <RegionView groups={upcomingByRegion} /> : <MonthView months={upcomingByMonth} />}

      {pastCount > 0 && (
        <div>
          <div className="chalk-line" />
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-sm font-semibold text-afa-ink/60 hover:text-afa-navy"
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

function RegionView({ groups }) {
  if (groups.length === 0) {
    return <p className="text-afa-ink/70">Nothing on the calendar yet — check back.</p>;
  }
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.region}>
          <h2 className="font-display text-lg text-afa-navy/80 mb-2 flex items-center gap-2">
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
            <h2 className="font-display text-lg text-afa-navy/80 mb-2">
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

function TournamentRowCard({ t, showRegionChip }) {
  // Southern Utah tournaments run brackets/registration on this site;
  // other regions are published schedule only — plain text, not a link,
  // until that region has a page of its own (unchanged rule).
  const linked = t.region === "southern_utah";
  const row = <TournamentRow t={t} linked={linked} showRegionChip={showRegionChip} />;
  if (linked) {
    return (
      <Link href={`/tournaments/${t.slug}`} className="block group">
        <Card className="hover:border-afa-navy/50">{row}</Card>
      </Link>
    );
  }
  return <Card>{row}</Card>;
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
          className="w-14 h-14 shrink-0 rounded object-cover"
        />
      )}
    </div>
  );
}
