import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { propagateAfterFinalize } from "@/lib/bracket/propagate";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

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
  const { team1Score, team2Score } = body ?? {};
  if (typeof team1Score !== "number" || typeof team2Score !== "number") {
    return Response.json({ error: "Both scores are required" }, { status: 400 });
  }
  if (team1Score === team2Score) {
    return Response.json({ error: "Softball doesn't end in a tie — one score must be higher" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: game, error: findError } = await supabase
    .from("games")
    .select("id, division_id, team1_name, team2_name, status")
    .eq("id", id)
    .maybeSingle();
  if (findError || !game) return Response.json({ error: "Game not found" }, { status: 404 });
  if (!game.team1_name || !game.team2_name) {
    return Response.json({ error: "Both teams for this game aren't known yet" }, { status: 409 });
  }

  const winnerSlot = team1Score > team2Score ? "team1" : "team2";

  const { error: updateError } = await supabase
    .from("games")
    .update({
      team1_score: team1Score,
      team2_score: team2Score,
      winner_slot: winnerSlot,
      status: "final",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  try {
    await propagateAfterFinalize(id);
  } catch (err) {
    console.error("bracket propagation failed", err);
    // The score itself is saved either way — propagation can be re-run by
    // re-saving the score if this ever happens.
  }

  return Response.json({ ok: true, winnerSlot });
}
