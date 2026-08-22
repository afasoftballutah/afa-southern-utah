import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Field/time reassignment is always allowed (games move fields all
// tournament long). Team slots can be rewritten until that game itself
// has a real score. Changing names also drops seed_ref so the drawing
// follows the name the director just picked.
export async function PATCH(request, { params }) {
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
  const { data: game, error: findError } = await supabase
    .from("games")
    .select("id, division_id, bracket_group")
    .eq("id", id)
    .maybeSingle();
  if (findError || !game) return Response.json({ error: "Game not found" }, { status: 404 });

  const patch = {};
  if ("field" in body) patch.field = body.field || null;
  if ("scheduledTime" in body) patch.scheduled_time = body.scheduledTime || null;

  if ("team1Name" in body || "team2Name" in body) {
    // Gated per bracket_group, not the whole division — a still-draft
    // consolation bracket stays hand-editable even after the main bracket
    // (or vice versa) has locked; they're independent brackets.
    const { data: full } = await supabase
      .from("games")
      .select("status, is_bye")
      .eq("id", game.id)
      .maybeSingle();
    if (full?.status === "final" && !full?.is_bye) {
      return Response.json(
        { error: "That game already has a score. Clear the score before changing teams." },
        { status: 409 }
      );
    }
    if ("team1Name" in body) {
      patch.team1_name = body.team1Name || null;
      // Drawing prefers seed_ref over the name. If the director picks a
      // team, the seed tag must not keep showing the old seed.
      if (!("team1SeedRef" in body)) patch.team1_seed_ref = null;
    }
    if ("team2Name" in body) {
      patch.team2_name = body.team2Name || null;
      if (!("team2SeedRef" in body)) patch.team2_seed_ref = null;
    }
    if ("team1SourceGameId" in body) {
      patch.team1_source_game_id = body.team1SourceGameId || null;
      patch.team1_source_result = body.team1SourceResult || null;
    }
    if ("team2SourceGameId" in body) {
      patch.team2_source_game_id = body.team2SourceGameId || null;
      patch.team2_source_result = body.team2SourceResult || null;
    }
    if (full?.is_bye || full?.status === "final") {
      patch.is_bye = false;
      patch.status = "pending";
      patch.team1_score = null;
      patch.team2_score = null;
      patch.winner_slot = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase.from("games").update(patch).eq("id", id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
