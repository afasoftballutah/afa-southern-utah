import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getPublicClient } from "@/lib/supabase";
import { REGION_LABEL } from "@/lib/data";
import PinPad from "@/components/scorekeeper/PinPad";
import PullResults from "@/components/scorekeeper/PullResults";
import { getDirectorCounts } from "@/lib/director";

export const dynamic = "force-dynamic"; // never cache — this is a live tool, not a public page
export const metadata = { title: "Scorekeeper" };

// What can be scored, as a flat list of DIVISIONS — because that is the
// unit of work. A director standing at a field is not looking for a
// tournament, they are looking for the sheet they are about to fill in.
// The old shape was tournaments grouped by region, each with a nested list of
// underlined links; it read like a sitemap, not a job.
async function getScoreableDivisions() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, start_date, status, region, is_placeholder, divisions(id, name, display_name, sort_order, parent_division_id, pool_games(id), games(id, status))"
    )
    .order("start_date", { ascending: true });
  if (error) throw error;

  const rows = [];
  for (const t of (data ?? []).filter((x) => !x.is_placeholder)) {
    for (const d of (t.divisions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)) {
      const pool = (d.pool_games ?? []).length;
      const bracket = (d.games ?? []).length;
      if (pool + bracket === 0 && d.parent_division_id) continue;
      const unplayed = (d.games ?? []).filter((g) => g.status !== "final").length;
      rows.push({
        id: d.id,
        // A division with pool games is where pool play is scored, so it is
        // named by what happens there rather than by the division's own name.
        label: pool > 0 ? "Pool Play" : (d.display_name ?? d.name),
        tournamentName: t.name,
        startDate: t.start_date,
        complete: t.status === "complete",
        region: REGION_LABEL[t.region] ?? t.region,
        games: pool + bracket,
        unplayed,
      });
    }
  }
  return {
    live: rows.filter((r) => !r.complete),
    past: rows.filter((r) => r.complete).reverse(),
  };
}

function ScoreList({ rows }) {
  return (
    <ul className="card divide-y divide-black/5">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/scorekeeper/division/${r.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 min-h-[56px]"
          >
            <span className="min-w-0">
              <span className="t-body block truncate">{r.label}</span>
              <span className="t-meta block truncate">
                {r.tournamentName} · {r.startDate}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="t-strong block">{r.games}</span>
              <span className="t-meta block">
                {r.games === 0 ? "no games" : r.unplayed > 0 ? `${r.unplayed} to score` : "all scored"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
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

  const [{ live, past }, counts] = await Promise.all([
    getScoreableDivisions(),
    getDirectorCounts(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="t-title">Control Center</h1>

      {/* The four doors, always in this order, always with a count. JD,
          2026-07-27: "a master control center... super intuitive... like a
          7th grader could use it." A count on every door answers "is there
          anything in there" before it is opened. */}
      <ul className="card divide-y divide-black/5">
        {[
          {
            href: "/scorekeeper/registrations",
            label: "Registrations",
            sub: "Who signed up, who paid, who still owes a signature",
            right: String(counts.registrations),
            rightSub:
              counts.outstandingSignatures > 0
                ? `${counts.outstandingSignatures} waiting`
                : "all signed",
          },
          {
            href: "/scorekeeper/players",
            label: "People",
            sub: "Every player and manager, across every tournament",
            right: String(counts.players),
            rightSub: "on file",
          },
          {
            href: "/scorekeeper/tournaments",
            label: "Tournaments",
            sub: "Dates, fees, deadlines and divisions",
            right: String(counts.tournaments),
            rightSub: "on file",
          },
          {
            href: "/scorekeeper/teams",
            label: "Teams",
            sub: "Every team, and the tournaments they entered",
            right: String(counts.teams),
            rightSub: "on file",
          },
        ].map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="flex items-center justify-between gap-3 px-4 py-3 min-h-[56px]"
            >
              <span className="min-w-0">
                <span className="t-body block">{d.label}</span>
                <span className="t-meta block truncate">{d.sub}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="t-strong block">{d.right}</span>
                <span className="t-meta block">{d.rightSub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="t-heading">Scores</h2>
      <PullResults />

      {live.length === 0 ? (
        <div className="card p-6 text-center space-y-1">
          <p className="t-strong">Nothing to score right now.</p>
          <p className="t-meta">
            A division shows up here once it has games.{" "}
            <Link href="/scorekeeper/tournaments" className="underline">
              Tournaments
            </Link>
          </p>
        </div>
      ) : (
        <ScoreList rows={live} />
      )}

      {past.length > 0 && (
        <details>
          <summary className="t-meta cursor-pointer list-none min-h-11 flex items-center underline [&::-webkit-details-marker]:hidden">
            Finished tournaments ({past.length}) — still editable
          </summary>
          <div className="mt-2">
            <ScoreList rows={past} />
          </div>
        </details>
      )}
    </div>
  );
}
