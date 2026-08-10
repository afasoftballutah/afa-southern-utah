import { cookies } from "next/headers";
import Link from "next/link";
import {
  getSessionRole,
  hasValidScorekeeperSession,
} from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { stillToPlayIn } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scorekeeper" };

// Scorekeeper room: pick a tournament, enter scores. Nothing else.
// Director tools (teams, players, umpires, brackets) live at /director.

async function listTournaments() {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select(
      "id, name, start_date, end_date, is_placeholder, divisions(id, games(id, status, is_bye, round, team1_source_game_id, team2_source_game_id, team1_source_result, team2_source_result), pool_games(id, status))"
    )
    .order("start_date");

  const real = (data ?? []).filter((t) => !t.is_placeholder);
  return real
    .map((t) => {
      let left = 0;
      for (const d of t.divisions ?? []) {
        const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
        left += stillToPlayIn(games).length;
      }
      return { id: t.id, name: t.name, start_date: t.start_date, left };
    })
    .sort((a, b) => {
      if (a.left > 0 && b.left === 0) return -1;
      if (b.left > 0 && a.left === 0) return 1;
      return String(a.start_date).localeCompare(String(b.start_date));
    });
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

  const role = getSessionRole(store);
  const tournaments = await listTournaments();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="t-label text-afa-navy/60">Scorekeeper</p>
          <h1 className="t-title">Enter scores</h1>
          <p className="t-meta">Pick a tournament, then enter results. That is all.</p>
        </div>
        {role === "director" && (
          <Link href="/director" className="btn-transient text-sm">
            ← Director control center
          </Link>
        )}
      </div>

      <div className="card divide-y divide-afa-navy/10">
        {tournaments.length === 0 ? (
          <p className="p-6 t-meta text-center">No tournaments on file.</p>
        ) : (
          tournaments.map((t) => (
            <Link
              key={t.id}
              href={`/scorekeeper/games?tournament=${t.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 min-h-[52px]"
            >
              <span className="min-w-0">
                <span className="t-body font-semibold block truncate">{t.name}</span>
                <span className="t-meta block">
                  {t.start_date}
                  {t.left > 0
                    ? ` · ${t.left} left to score`
                    : " · scored / no open games"}
                </span>
              </span>
              <span className="t-meta shrink-0">→</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
