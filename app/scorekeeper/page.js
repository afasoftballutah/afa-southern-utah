import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPublicClient } from "@/lib/supabase";
import { REGION_LABEL } from "@/lib/data";
import PinPad from "@/components/scorekeeper/PinPad";
import PullResults from "@/components/scorekeeper/PullResults";

export const dynamic = "force-dynamic"; // never cache — this is a live tool, not a public page
export const metadata = { title: "Scorekeeper" };

// Ordered the way the public Tournaments page orders things (JD,
// 2026-07-24). Flat newest-first put December on top and buried the
// tournament actually being scored tonight: upcoming come first, SOONEST
// first, grouped by region with Southern UT/NV leading; everything already
// played collapses behind an expander, still reachable for fixing a score.
const REGION_ORDER = ["southern_utah", "northern_utah", "series"];

async function getTournamentsWithDivisions() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, start_date, status, region, is_placeholder, divisions(id, name, display_name, sort_order, parent_division_id, pool_games(id))"
    )
    .order("start_date", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).filter((t) => !t.is_placeholder);

  const groupByRegion = (list) =>
    REGION_ORDER.map((region) => ({
      region,
      label: REGION_LABEL[region] ?? region,
      tournaments: list.filter((t) => t.region === region),
    })).filter((g) => g.tournaments.length > 0);

  return {
    upcoming: groupByRegion(rows.filter((t) => t.status !== "complete")),
    past: groupByRegion(
      rows.filter((t) => t.status === "complete").slice().reverse()
    ),
    pastCount: rows.filter((t) => t.status === "complete").length,
  };
}

function TournamentList({ groups }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.region}>
          <h2 className="h-sub text-afa-muted mb-1">
            {group.label}
          </h2>
          {group.tournaments.map((t, i) => (
            <div key={t.id}>
              {i > 0 && <div className="chalk-line" />}
              <div className="py-2">
                <p className="font-semibold text-afa-navy">{t.name}</p>
                <ul className="mt-1 space-y-1">
                  {(t.divisions ?? [])
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((d) => {
                      // A division with pool games is where the director
                      // scores pool play, so it reads by what he'll DO
                      // there (dispatch-brief-21) — scorekeeper-only, the
                      // public site keeps calling it Coed. Bracket-stage
                      // children (Gold/Silver/Bronze) have no pool_games
                      // rows, so they fall through to their own name
                      // unchanged, same as a division with neither stage.
                      const hasPoolGames = (d.pool_games ?? []).length > 0;
                      const label = hasPoolGames ? "Pool Play" : d.display_name ?? d.name;
                      return (
                        <li key={d.id} className={d.parent_division_id ? "ml-4" : ""}>
                          <Link
                            href={`/scorekeeper/division/${d.id}`}
                            className="text-afa-navy underline text-sm"
                          >
                            {label}
                          </Link>
                        </li>
                      );
                    })}
                  {(t.divisions ?? []).length === 0 && (
                    <li className="text-sm text-afa-ink/50">No divisions yet</li>
                  )}
                </ul>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export default async function ScorekeeperPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="py-8">
        <PinPad />
      </div>
    );
  }

  const { upcoming, past, pastCount } = await getTournamentsWithDivisions();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="h-page">Scorekeeper</h1>
      </div>
      <PullResults />
      {upcoming.length === 0 && pastCount === 0 ? (
        <p className="text-afa-ink/70 text-sm">No tournaments on file yet.</p>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <TournamentList groups={upcoming} />
          ) : (
            <p className="text-afa-ink/70 text-sm">Nothing upcoming.</p>
          )}
          {pastCount > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer list-none min-h-11 flex items-center text-sm text-afa-navy underline [&::-webkit-details-marker]:hidden">
                Past tournaments ({pastCount})
              </summary>
              <div className="mt-3">
                <TournamentList groups={past} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
