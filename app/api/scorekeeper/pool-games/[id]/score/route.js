import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Pool play (dispatch-brief-7) — separate, self-contained stage from the
// bracket engine. No propagation: pool games don't feed brackets/games,
// so there's nothing downstream to recompute (standings are derived live
// from these rows on the public page, not stored). Same auth pattern as
// the existing games score route (app/api/scorekeeper/games/[id]/score).
export async function POST(request, { params }) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Un-finalize: typo recovery at 1am matters (spec). Clears scores and
  // reverts to scheduled regardless of current state.
  if (body?.clear === true) {
    const { error: clearError } = await supabase
      .from("pool_games")
      .update({ team1_score: null, team2_score: null, status: "scheduled" })
      .eq("id", id);
    if (clearError) return Response.json({ error: clearError.message }, { status: 500 });
    return Response.json({ ok: true, cleared: true });
  }

  const { team1_score: team1Score, team2_score: team2Score } = body ?? {};
  if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score)) {
    return Response.json({ error: "Both scores are required" }, { status: 400 });
  }
  if (team1Score < 0 || team2Score < 0) {
    return Response.json({ error: "Scores can't be negative" }, { status: 400 });
  }

  const { data: game, error: findError } = await supabase
    .from("pool_games")
    .select("id, team1_name, team2_name")
    .eq("id", id)
    .maybeSingle();
  if (findError || !game) return Response.json({ error: "Game not found" }, { status: 404 });

  const { error: updateError } = await supabase
    .from("pool_games")
    .update({ team1_score: team1Score, team2_score: team2Score, status: "final" })
    .eq("id", id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
