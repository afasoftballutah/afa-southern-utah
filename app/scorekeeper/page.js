import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { stillToPlayIn, splitCurrentAndArchive } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import TournamentPickList from "@/components/scorekeeper/TournamentPickList";
import TournamentArchiveTabs from "@/components/TournamentArchiveTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scorekeeper" };

// Scorekeeper room: pick a tournament, enter scores. Nothing else.

async function listTournaments() {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select(
      "id, name, start_date, end_date, timezone, status, is_placeholder, divisions(id, games(id, status, is_bye, round, team1_source_game_id, team2_source_game_id, team1_source_result, team2_source_result), pool_games(id, status))"
    )
    .order("start_date");

  const real = (data ?? []).filter((t) => !t.is_placeholder);
  return real.map((t) => {
    let left = 0;
    for (const d of t.divisions ?? []) {
      const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
      left += stillToPlayIn(games).length;
    }
    return {
      id: t.id,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
      timezone: t.timezone,
      status: t.status,
      left,
    };
  });
}

function byNeedThenDate(a, b) {
  if (a.left > 0 && b.left === 0) return -1;
  if (b.left > 0 && a.left === 0) return 1;
  return String(a.start_date).localeCompare(String(b.start_date));
}

export default async function ScorekeeperPage({ searchParams }) {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="py-8">
        <PinPad room="scorekeeper" />
      </div>
    );
  }

  const sp = await searchParams;
  const showArchive = String(sp?.archive ?? "") === "1";
  const tournaments = await listTournaments();
  const { current, archive } = splitCurrentAndArchive(tournaments);
  const visible = showArchive ? archive : [...current].sort(byNeedThenDate);

  const tabs =
    archive.length > 0 || showArchive ? (
      <TournamentArchiveTabs
        archive={showArchive}
        currentHref="/scorekeeper"
        archiveHref="/scorekeeper?archive=1"
      />
    ) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="t-title text-xl">Scores</h1>
        {tabs}
      </div>

      <TournamentPickList
        tournaments={visible}
        defaultView={showArchive ? "all" : undefined}
        showTabs={!showArchive}
      />
    </div>
  );
}
