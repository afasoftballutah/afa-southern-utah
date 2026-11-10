import { notFound } from "next/navigation";
import Link from "next/link";
import { getTournamentBySlug, getTournamentSchedule } from "@/lib/data";
import { getTeamPageHrefMap } from "@/lib/team-page-data";
import { formatFieldTime } from "@/lib/bracket/tree";
import { tournamentTimeZone, zoneLabel } from "@/lib/zone";
import ScheduleBrowser from "@/components/ScheduleBrowser";
import TournamentTicker from "@/components/TournamentTicker";
import RefreshOnReturn from "@/components/RefreshOnReturn";

export const revalidate = 30;

// Bracket slots hold PROVENANCE placeholders, not real team names, until
// pool play fills them in — "Winner of Game 5" or a seed reference like
// "[A #1]" (the live data brackets the seed; the letter+number form
// without brackets is included too, belt and suspenders). Neither belongs
// in the team picker. Lifted from the division page's copy
// (app/tournaments/[slug]/division/[divisionId]/page.js) — that file is
// limited to a one-line change for the shared-storage-key switch
// (dispatch-brief-19), so it can't be reduced to import a shared module;
// duplicated here instead of re-invented.
const SEED_PLACEHOLDER = /^\[?[A-I] #\d+\]?$/;
const PROVENANCE_PREFIX = /^(Winner|Loser) of Game/;

function isRealTeamName(name) {
  if (!name) return false;
  if (SEED_PLACEHOLDER.test(name)) return false;
  if (PROVENANCE_PREFIX.test(name)) return false;
  return true;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `Schedule — ${tournament.name}` : "Schedule" };
}

export default async function SchedulePage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const [rawRows, teamPageHrefs] = await Promise.all([
    getTournamentSchedule(slug),
    getTeamPageHrefMap(),
  ]);
  // Server hands the client caption PARTS, not a pre-built string
  // (dispatch-brief-16) — ScheduleBrowser composes the right caption per
  // view (By field drops the field name since it's the row heading; By
  // time drops the time since its heading already states it). timeLabel
  // keeps using the same Mountain-time helper this page has always used
  // (lib/bracket/tree.js) — no new date code on the client. Pass no
  // `field` key so it returns just the weekday/time half.
  // In the tournament's own zone ("Thu 2:00 PM PST" for Mesquite).
  const timeZone = tournamentTimeZone(tournament);
  const rows = rawRows.map((row) => ({
    ...row,
    timeLabel: formatFieldTime({ scheduled_time: row.scheduledTime }, timeZone),
  }));

  // Find my team (dispatch-brief-19) — the schedule page spans every
  // division in the tournament, so it builds the same shape TeamFinder
  // expects on the division page: distinct real team names (placeholders
  // filtered out) and a flat games list. Caption stays short here
  // ({timeLabel} · {field}) — the result card is narrow, no division/label
  // stacked on top of it. `pool` carries the division name instead of a
  // pool letter — this page spans divisions, so the division is the useful
  // chip label, not the pool.
  // One entry per team IN its division (JD, 2026-11-09: "cant have both
  // fallens get highlighted") — the same identity as the tournament page's
  // Find my team (lib/team-search.js): Fallen in Men's D and Fallen in
  // Men's E are two teams, listed under their own divisions.
  const finderTeams = [];
  const seenTeams = new Set();
  for (const r of rows) {
    for (const name of [r.team1, r.team2]) {
      if (!isRealTeamName(name)) continue;
      const key = `${name}\u0000${r.divisionId ?? ""}`;
      if (seenTeams.has(key)) continue;
      seenTeams.add(key);
      finderTeams.push({ name, divisionId: r.divisionId ?? null, divisionName: r.divisionName ?? null });
    }
  }
  finderTeams.sort((a, b) => a.name.localeCompare(b.name) || String(a.divisionName).localeCompare(String(b.divisionName)));
  const finderGames = rows.map((row) => ({
    id: row.id,
    divisionId: row.divisionId ?? null,
    pool: row.divisionName,
    caption: [row.timeLabel, row.field].filter(Boolean).join(" · "),
    team1: row.team1,
    team2: row.team2,
    score1: row.score1,
    score2: row.score2,
    isFinal: row.isFinal,
  }));

  // The timeline's hour axis is labelled with the zone ("PST"); league
  // time (Mountain) carries no label anywhere, so neither does this.
  const zoneShort = rows[0]?.scheduledTime ? zoneLabel(rows[0].scheduledTime, timeZone) : "";
  const divisionIds = (tournament.divisions ?? []).map((d) => d.id);

  return (
    <div className="space-y-3">
      <RefreshOnReturn />
      <TournamentTicker divisionIds={divisionIds} />
      {/* One compact header (JD, 2026-11-09: "the top has a lot of wasted
          space"): the tournament is the back link, the page name sits under it. */}
      <header className="sched-head">
        <Link href={`/tournaments/${slug}`} className="sched-head__back">
          <span aria-hidden="true">‹</span> {tournament.name}
        </Link>
        <h1 className="sched-head__title">Schedule</h1>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-afa-ink/70">No schedule posted yet — check back.</p>
      ) : (
        <ScheduleBrowser
          rows={rows}
          finderTeams={finderTeams}
          finderGames={finderGames}
          storageKey={`afa-team-${slug}`}
          timeZone={timeZone}
          zoneShort={zoneShort}
          slug={slug}
          teamPageHrefs={teamPageHrefs}
        />
      )}
    </div>
  );
}
