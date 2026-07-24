import { notFound } from "next/navigation";
import Link from "next/link";
import { getDivisionById } from "@/lib/data";
import BracketTree from "@/components/bracket/BracketTree";
import { formatFieldTime } from "@/lib/bracket/tree";

export const revalidate = 30;

const POOL_LETTERS = ["A", "B", "C", "D", "E", "F"];

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
      {POOL_LETTERS.filter((letter) => byPool[letter]?.length).map((letter) => {
        const games = byPool[letter];
        const standings = poolStandings(games);
        return (
          <div key={letter} className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-afa-muted">
              Pool {letter}
            </h3>

            <table className="w-full text-sm divide-y divide-afa-navy/10">
              <thead>
                <tr className="text-left divide-y divide-afa-navy/10">
                  <th className="font-semibold py-1">Team</th>
                  <th className="font-semibold py-1 text-right w-10">W</th>
                  <th className="font-semibold py-1 text-right w-10">L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-afa-navy/10">
                {standings.map((t) => (
                  <tr key={t.name}>
                    <td className="py-1">{t.name}</td>
                    <td className="py-1 text-right">{t.w}</td>
                    <td className="py-1 text-right">{t.l}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-1">
              {games.map((g) => {
                const fieldTime = formatFieldTime(g);
                const isFinal = g.status === "final";
                const team1Won = isFinal && g.team1_score > g.team2_score;
                return (
                  <p key={g.id} className="text-sm">
                    {fieldTime && `${fieldTime} — `}
                    {isFinal ? (
                      <>
                        <span className={team1Won ? "font-semibold" : ""}>{g.team1_name}</span>{" "}
                        {g.team1_score},{" "}
                        <span className={!team1Won ? "font-semibold" : ""}>{g.team2_name}</span>{" "}
                        {g.team2_score}
                      </>
                    ) : (
                      <>
                        {g.team1_name} vs {g.team2_name}
                      </>
                    )}
                  </p>
                );
              })}
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

      {!hasPlacements && !hasBracket && !hasPoolGames && (
        <p className="text-afa-ink/70 text-sm">
          No results yet — check back after the bracket is set.
        </p>
      )}
    </div>
  );
}
