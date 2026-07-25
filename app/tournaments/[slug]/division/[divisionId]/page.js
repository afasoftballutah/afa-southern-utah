import { notFound } from "next/navigation";
import Link from "next/link";
import { getDivisionById } from "@/lib/data";
import BracketTree from "@/components/bracket/BracketTree";
import DrawnBracket from "@/components/bracket/DrawnBracket";
import Card from "@/components/ui/Card";
import Matchup from "@/components/ui/Matchup";
import TeamFinder from "@/components/TeamFinder";
import { formatFieldTime } from "@/lib/bracket/tree";

export const revalidate = 30;

// Bracket slots hold PROVENANCE placeholders, not real team names, until
// pool play fills them in — "Winner of Game 5" or a seed reference like
// "[A #1]" (the live data brackets the seed; the letter+number form
// without brackets is included too, belt and suspenders). Neither belongs
// in the team picker (dispatch-brief-14).
const SEED_PLACEHOLDER = /^\[?[A-I] #\d+\]?$/;
const PROVENANCE_PREFIX = /^(Winner|Loser) of Game/;

function isRealTeamName(name) {
  if (!name) return false;
  if (SEED_PLACEHOLDER.test(name)) return false;
  if (PROVENANCE_PREFIX.test(name)) return false;
  return true;
}

// Pool letters are DERIVED from the games, never hardcoded (2026-07-24).
// A hardcoded A–F list silently hid pools G/H/I when the league reorganized
// from 6 pools to 9 on the morning of a tournament — invisible publicly and
// unscoreable in the director's door. Whatever pools exist in the data are
// the pools that render, sorted naturally.
function poolLetters(byPool) {
  return Object.keys(byPool).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

// Pool play (dispatch-brief-7) — a separate, self-contained stage from the
// bracket engine (untouched). Standings and the game list both DERIVE from
// the pool_games rows; there's no separate standings table. Ties are
// broken by the director at seeding, not computed here.
function poolStandings(games) {
  const teams = new Map();
  for (const g of games) {
    if (!teams.has(g.team1_name)) teams.set(g.team1_name, { name: g.team1_name, w: 0, l: 0 });
    if (!teams.has(g.team2_name)) teams.set(g.team2_name, { name: g.team2_name, w: 0, l: 0 });
    if (g.status !== "final") continue;
    const team1Won = g.team1_score > g.team2_score;
    teams.get(g.team1_name)[team1Won ? "w" : "l"] += 1;
    teams.get(g.team2_name)[team1Won ? "l" : "w"] += 1;
  }
  return [...teams.values()].sort((a, b) => b.w - a.w || a.name.localeCompare(b.name));
}

function PoolPlaySection({ poolGames }) {
  if (!poolGames || poolGames.length === 0) return null;

  const byPool = {};
  for (const g of poolGames) (byPool[g.pool] ??= []).push(g);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-afa-navy">Pool Play</h2>
      {poolLetters(byPool).map((letter) => {
        const games = byPool[letter];
        const standings = poolStandings(games);
        return (
          <div key={letter} className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-afa-muted">
              Pool {letter}
            </h3>

            <Card>
              <table className="w-full text-sm divide-y divide-afa-navy/10">
                <thead>
                  <tr className="text-left divide-y divide-afa-navy/10">
                    <th className="font-semibold py-1">Team</th>
                    <th className="font-semibold py-1 text-right w-8 text-[11px] uppercase tracking-wide text-afa-muted">
                      W
                    </th>
                    <th className="font-semibold py-1 text-right w-8 text-[11px] uppercase tracking-wide text-afa-muted">
                      L
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-afa-navy/10">
                  {standings.map((t) => (
                    <tr key={t.name}>
                      <td className="py-1">{t.name}</td>
                      <td className="py-1 text-right w-8">{t.w}</td>
                      <td className="py-1 text-right w-8">{t.l}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {games.map((g) => (
                <Matchup
                  key={g.id}
                  caption={formatFieldTime(g)}
                  team1={g.team1_name}
                  team2={g.team2_name}
                  score1={g.team1_score}
                  score2={g.team2_score}
                  isFinal={g.status === "final"}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Bracket stages (Gold/Silver) are CHILDREN of their division, not peers
// (JD ruling 2026-07-24): Coed E doesn't sit beside Gold and Silver — it
// BECOMES them, and which one your team lands in is decided by where you
// finish in your pool. So a parent shows them as the next step; a child
// shows its siblings as a toggle, so you can flip brackets without
// backing out.
function BracketStages({ slug, stages, currentId, poolPlayFeeds }) {
  if (stages.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-afa-navy">Brackets</h2>
      {poolPlayFeeds && (
        <p className="text-sm text-afa-ink/70">
          Which bracket your team plays in is set by where you finish in your pool.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {stages.map((s) => {
          const name = s.display_name ?? s.name;
          const isCurrent = s.id === currentId;
          return isCurrent ? (
            <span
              key={s.id}
              aria-current="page"
              className="rounded border border-afa-navy bg-afa-navy px-4 py-2 text-sm font-bold text-white min-h-11 flex items-center"
            >
              {name}
            </span>
          ) : (
            <Link
              key={s.id}
              href={`/tournaments/${slug}/division/${s.id}`}
              className="rounded border border-afa-navy/25 bg-white px-4 py-2 text-sm font-bold text-afa-navy hover:border-afa-navy/60 min-h-11 flex items-center"
            >
              {name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }) {
  const { divisionId } = await params;
  const division = await getDivisionById(divisionId);
  if (!division) return { title: "Division" };
  const renderedName = division.display_name ?? division.name;
  return { title: `${renderedName} — ${division.tournament.name}` };
}

export default async function DivisionPage({ params }) {
  const { slug, divisionId } = await params;
  const division = await getDivisionById(divisionId);
  if (!division || division.tournament?.slug !== slug) notFound();

  const tournament = division.tournament;
  const renderedName = division.display_name ?? division.name;
  const placements = division.placements ?? [];
  const hasPlacements = placements.length > 0;
  const hasBracket = (division.brackets ?? []).length > 0;
  const poolGames = division.pool_games ?? [];
  const hasPoolGames = poolGames.length > 0;
  // Chronological, then by the printed game number — the order the bracket
  // is actually played in.
  const bracketGames = [...(division.games ?? [])]
    .filter((g) => !g.is_bye && g.status !== "cancelled")
    .sort(
      (a, b) =>
        String(a.scheduled_time ?? "").localeCompare(String(b.scheduled_time ?? "")) ||
        (a.round ?? 0) - (b.round ?? 0)
    );

  // Bracket stages: this division's children, or — when this IS a child —
  // its siblings, so the toggle works from inside either bracket.
  const allDivisions = tournament.divisions ?? [];
  const parentId = division.parent_division_id ?? division.id;
  const stages = allDivisions
    .filter((d) => d.parent_division_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const parent = division.parent_division_id
    ? allDivisions.find((d) => d.id === division.parent_division_id)
    : null;
  const parentName = parent ? (parent.display_name ?? parent.name) : null;

  // Find my team (dispatch-brief-14) — one normalized games array feeding
  // TeamFinder, built the same way from either stage this division might
  // be in: pool play carries a real pool letter, the bracket list never
  // does (pool: null). Provenance placeholders are filtered out of the
  // team list below; if that leaves nothing real, no picker renders.
  const finderGames = [
    ...poolGames.map((g) => ({
      id: g.id,
      pool: g.pool,
      caption: formatFieldTime(g),
      team1: g.team1_name,
      team2: g.team2_name,
      score1: g.team1_score,
      score2: g.team2_score,
      isFinal: g.status === "final",
    })),
    ...bracketGames.map((g) => ({
      id: g.id,
      pool: null,
      caption: [`Game ${g.round}`, formatFieldTime(g)].filter(Boolean).join(" · "),
      team1: g.team1_name,
      team2: g.team2_name,
      score1: g.team1_score,
      score2: g.team2_score,
      isFinal: g.status === "final",
    })),
  ];
  const finderTeams = [
    ...new Set(finderGames.flatMap((g) => [g.team1, g.team2]).filter(isRealTeamName)),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <Link
        href={
          parent
            ? `/tournaments/${slug}/division/${parent.id}`
            : `/tournaments/${slug}`
        }
        className="text-sm text-afa-navy underline min-h-11 inline-flex items-center"
      >
        ← {parentName ?? tournament.name}
      </Link>

      <div className="text-center">
        <h1 className="font-display text-2xl text-afa-navy">
          {parentName ? `${parentName} · ${renderedName}` : renderedName}
        </h1>
        <p className="text-sm text-afa-ink/70">
          {tournament.name}
          {division.day_label && ` · ${division.day_label}`}
        </p>
      </div>

      {finderTeams.length > 0 && (
        <TeamFinder teams={finderTeams} games={finderGames} storageKey={`afa-team-${slug}`} chipPrefix="Pool" />
      )}

      {hasPoolGames && <PoolPlaySection poolGames={poolGames} />}

      <BracketStages
        slug={slug}
        stages={stages}
        currentId={division.id}
        poolPlayFeeds={hasPoolGames}
      />

      {hasPlacements && (
        <div className="chalk-panel mb-6">
          <div className="grid grid-cols-2 gap-4">
            {["champion", "runner_up"].map((place) => {
              const p = placements.find((x) => x.place === place);
              if (!p) return null;
              return (
                <figure key={place} className="text-center">
                  {p.photo_url && (
                    <img src={p.photo_url} alt={p.team_name} className="w-full h-auto rounded" />
                  )}
                  <figcaption className="text-sm mt-1">
                    {place === "champion" ? "Champion" : "Runner-Up"} — {p.team_name}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      )}

      {hasBracket && <BracketTree division={division} />}

      {/* A drawn-but-unplayed bracket. These games are transcribed from the
          league's own pre-drawn bracket, so they carry their real field and
          time and their slots read as provenance — "A #1", "Winner of Game
          5" — the fence convention: the bracket exists before it is played.
          DrawnBracket lays it out from the feed graph itself (dispatch-
          brief-15) — these brackets are irregular (byes from 9/10-entrant
          pools), which breaks the halving math BracketTree/tree.js rely on,
          so this is a separate renderer rather than a variant of that one. */}
      {!hasBracket && bracketGames.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-afa-navy">Bracket</h2>
          <p className="text-sm text-afa-ink/70">
            Drawn and scheduled. Team names fill in as pool play finishes.
          </p>
          <DrawnBracket games={bracketGames} />
        </div>
      )}

      {!hasPlacements && !hasBracket && !hasPoolGames && bracketGames.length === 0 && (
        <p className="text-afa-ink/70 text-sm">
          No results yet — check back after the bracket is set.
        </p>
      )}
    </div>
  );
}
