import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { stillToPlayIn } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import TournamentPickList from "@/components/scorekeeper/TournamentPickList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scorekeeper" };

// Scorekeeper room: pick a tournament, enter scores. Nothing else.

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
        <PinPad room="scorekeeper" />
      </div>
    );
  }

  const tournaments = await listTournaments();
  const needScores = tournaments.filter((t) => t.left > 0);

  // One open tournament is the normal field day — skip the pick screen.
  if (needScores.length === 1) {
    const { redirect } = await import("next/navigation");
    redirect(`/scorekeeper/games?tournament=${needScores[0].id}`);
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="t-title text-xl">Scores</h1>
        <p className="t-meta text-[13px]">
          {needScores.length > 0
            ? `${needScores.length} tournament${needScores.length === 1 ? "" : "s"} still need scores.`
            : "Nothing open — pick a tournament only if you need to fix one."}
        </p>
      </div>

      <TournamentPickList tournaments={tournaments} />
    </div>
  );
}
