import { requireStaffPage } from "@/lib/staff-gate";
import { getServiceClient } from "@/lib/supabase";
import { stillToPlayIn } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import ScoreTable from "@/components/scorekeeper/ScoreTable";
import TournamentPickList from "@/components/scorekeeper/TournamentPickList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scores — Scorekeeper" };

const GAME_SELECT =
  "id, status, is_bye, round, slot, scheduled_time, field, " +
  "team1_name, team2_name, team1_score, team2_score, " +
  "team1_source_game_id, team2_source_game_id, team1_source_result, team2_source_result, " +
  "bracket_side";

const POOL_SELECT =
  "id, status, pool, scheduled_time, field, " +
  "team1_name, team2_name, team1_score, team2_score";

async function loadTournaments() {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select(
      `id, name, start_date, end_date, is_placeholder,
       divisions(
         id, name, display_name, sort_order, parent_division_id,
         games(${GAME_SELECT}),
         pool_games(${POOL_SELECT})
       )`
    )
    .order("start_date");

  const real = (data ?? []).filter((t) => !t.is_placeholder);
  return real.map((t) => {
    let left = 0;
    for (const d of t.divisions ?? []) {
      const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
      left += stillToPlayIn(games).length;
    }
    return { ...t, left };
  });
}

export default async function ScorekeeperGamesPage({ searchParams }) {
  const gate = await requireStaffPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Scores</h1>
        <PinPad room="scorekeeper" />
      </div>
    );
  }

  const sp = await searchParams;
  const tournamentId = sp?.tournament || null;
  const tournaments = await loadTournaments();

  const selected = tournamentId
    ? tournaments.find((t) => t.id === tournamentId)
    : null;

  const ordered = [...tournaments].sort((a, b) => {
    if (a.left > 0 && b.left === 0) return -1;
    if (b.left > 0 && a.left === 0) return 1;
    return String(a.start_date).localeCompare(String(b.start_date));
  });

  if (!selected) {
    return (
      <DirectorShell title="Enter scores" count="Pick a tournament" back="/scorekeeper">
        <TournamentPickList tournaments={ordered} />
      </DirectorShell>
    );
  }

  const divisions = [...(selected.divisions ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <DirectorShell
      title={selected.name}
      count={
        selected.left > 0
          ? `${selected.left} need a score`
          : "All scored"
      }
      back="/scorekeeper"
    >
      <div className="space-y-5">
        {divisions.map((d) => {
          const bracketGames = d.games ?? [];
          const poolGames = d.pool_games ?? [];
          if (!bracketGames.length && !poolGames.length) return null;
          const label = d.display_name ?? d.name;

          return (
            <section key={d.id} className="space-y-2">
              {poolGames.length > 0 && (
                <ScoreTable
                  games={poolGames}
                  kind="pool"
                  title={`${label} · pool`}
                />
              )}
              {bracketGames.length > 0 && (
                <ScoreTable
                  games={bracketGames}
                  kind="bracket"
                  title={`${label} · bracket`}
                />
              )}
            </section>
          );
        })}

        {divisions.every((d) => !(d.games?.length || d.pool_games?.length)) && (
          <div className="card p-4 text-center">
            <p className="t-meta">No games scheduled yet.</p>
          </div>
        )}
      </div>
    </DirectorShell>
  );
}
