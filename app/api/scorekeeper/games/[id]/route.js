import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { isBracketDraft } from "@/lib/bracket/propagate";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Field/time reassignment is always allowed (games move fields all
// tournament long). Manually reassigning which team sits in which slot is
// only allowed while the bracket is still draft — every slot editable
// before lock, per spec ("director disposes").
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
    const draft = await isBracketDraft(game.division_id, game.bracket_group);
    if (!draft) {
      return Response.json(
        { error: "Bracket is locked — team slots can't be edited once a real game has a score." },
        { status: 409 }
      );
    }
    if ("team1Name" in body) patch.team1_name = body.team1Name || null;
    if ("team2Name" in body) patch.team2_name = body.team2Name || null;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase.from("games").update(patch).eq("id", id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
