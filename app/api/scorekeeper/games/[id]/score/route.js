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

  // Un-finalize (dispatch-brief-24): typo recovery at 1am is real, same
  // rationale as pool_games' existing clear (app/api/scorekeeper/pool-games/
  // [id]/score). Bracket games additionally need UN-propagation: any slot
  // fed by this game's result (team*_source_game_id === id) reverts to its
  // "Winner of Game N" / "Loser of Game N" placeholder text. That text no
  // longer lives anywhere once propagation overwrote it, so it's
  // reconstructed from the dependent's own source_result plus this game's
  // `round` (the printed game number) — both permanent, never touched by
  // propagation. Purely additive: the scoring branch below is unchanged,
  // and no existing UI calls `clear` for engine-generated brackets, so
  // those are unaffected.
  if (body?.clear === true) {
    return clearBracketScore(id);
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

async function clearBracketScore(id) {
  const supabase = getServiceClient();
  const { data: game, error: findError } = await supabase
    .from("games")
    .select("id, division_id, round, status, team1_score, team2_score")
    .eq("id", id)
    .maybeSingle();
  if (findError || !game) return Response.json({ error: "Game not found" }, { status: 404 });
  if (game.status !== "final" || game.team1_score === null || game.team2_score === null) {
    return Response.json({ error: "Nothing to clear — this game hasn't been scored." }, { status: 409 });
  }

  const { data: dependents, error: depError } = await supabase
    .from("games")
    .select("id, round, status, team1_source_game_id, team1_source_result, team2_source_game_id, team2_source_result")
    .eq("division_id", game.division_id)
    .or(`team1_source_game_id.eq.${id},team2_source_game_id.eq.${id}`);
  if (depError) return Response.json({ error: depError.message }, { status: 500 });

  // Refuse if a dependent has ALREADY been scored itself — that result was
  // produced using this game's (about to be reverted) winner/loser name.
  // Un-propagating out from under it would silently corrupt a second real
  // result. The director clears that downstream game first.
  const blocking = (dependents ?? []).filter((d) => d.status === "final");
  if (blocking.length > 0) {
    return Response.json(
      {
        error: `Can't clear — Game ${blocking.map((b) => b.round).join(", ")} already has a score that used this result. Clear that game first.`,
      },
      { status: 409 }
    );
  }

  for (const dep of dependents ?? []) {
    const patch = {};
    if (dep.team1_source_game_id === id) {
      const label = dep.team1_source_result === "loser" ? "Loser" : "Winner";
      patch.team1_name = `${label} of Game ${game.round}`;
    }
    if (dep.team2_source_game_id === id) {
      const label = dep.team2_source_result === "loser" ? "Loser" : "Winner";
      patch.team2_name = `${label} of Game ${game.round}`;
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { error: patchError } = await supabase.from("games").update(patch).eq("id", dep.id);
      if (patchError) return Response.json({ error: patchError.message }, { status: 500 });
    }
  }

  const { error: clearError } = await supabase
    .from("games")
    .update({
      team1_score: null,
      team2_score: null,
      winner_slot: null,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (clearError) return Response.json({ error: clearError.message }, { status: 500 });

  return Response.json({ ok: true, cleared: true });
}
