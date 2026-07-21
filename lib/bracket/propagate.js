import { getServiceClient } from "@/lib/supabase";
import { resolveMatchSlots, classifyMatch } from "./resolve";

/**
 * Call after any game is finalized with a real, scorekeeper-entered score.
 * Fills in the next round's team names wherever this result feeds them,
 * cascading recursively through any resulting bye walkovers (rare once the
 * season is live — byes are almost always resolved at generation time —
 * but a losers-bracket slot can still resolve to a walkover if its other
 * feeder was a dead/cancelled match). Also applies the double-elimination
 * "if necessary" rule: the grand final's second game only happens if the
 * losers-bracket team (team2) won game one.
 */
export async function propagateAfterFinalize(finishedGameId) {
  const supabase = getServiceClient();

  const { data: finished, error: findError } = await supabase
    .from("games")
    .select("*")
    .eq("id", finishedGameId)
    .single();
  if (findError || !finished) throw new Error(findError?.message || "Game not found");

  // Special rule: grand final game one just finished. If the winners-side
  // team (team1) won outright, the "if necessary" game two never happens.
  if (finished.bracket_side === "final" && finished.round === 1 && finished.winner_slot === "team1") {
    const { data: gf2 } = await supabase
      .from("games")
      .select("id, status")
      .eq("division_id", finished.division_id)
      .eq("bracket_side", "final")
      .eq("round", 2)
      .maybeSingle();
    if (gf2 && gf2.status === "pending") {
      await supabase.from("games").update({ status: "cancelled" }).eq("id", gf2.id);
    }
  }

  await cascade(supabase, finished.division_id, finishedGameId);
}

async function cascade(supabase, divisionId, justFinalizedGameId) {
  const { data: dependents, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .or(`team1_source_game_id.eq.${justFinalizedGameId},team2_source_game_id.eq.${justFinalizedGameId}`);
  if (error) throw new Error(error.message);
  if (!dependents || dependents.length === 0) return;

  // Need a lookup of feeder games by id — fetch the whole division's games
  // once (divisions are small, a couple dozen games at most) rather than
  // one query per feeder reference.
  const { data: allGames, error: allError } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId);
  if (allError) throw new Error(allError.message);
  const gamesById = new Map(allGames.map((g) => [g.id, g]));

  for (const dep of dependents) {
    if (dep.status !== "pending") continue; // already resolved, nothing to do
    const { team1, team2 } = resolveMatchSlots(dep, (id) => gamesById.get(id));
    const cls = classifyMatch(team1, team2);
    const patch = {};
    if ("team" in team1 && dep.team1_name !== team1.team) patch.team1_name = team1.team;
    if ("team" in team2 && dep.team2_name !== team2.team) patch.team2_name = team2.team;

    if (cls === "bye") {
      patch.is_bye = true;
      patch.status = "final";
      patch.winner_slot = "team" in team1 ? "team1" : "team2";
    } else if (cls === "dead") {
      patch.status = "cancelled";
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("games").update(patch).eq("id", dep.id);
    }

    if (cls === "bye" || cls === "dead") {
      // This match just resolved without a real game being played — cascade
      // to whatever depends on IT, same as a real finalize would.
      await cascade(supabase, divisionId, dep.id);
    }
  }
}

/**
 * A division's bracket is DRAFT until any real (non-bye) game has a
 * scorekeeper-entered score. Once that happens the shape locks — only
 * manual field/time reassignment and score entry are allowed from then on,
 * not team/slot editing or regeneration.
 */
export async function isBracketDraft(divisionId) {
  const supabase = getServiceClient();
  const { count, error } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("division_id", divisionId)
    .eq("status", "final")
    .eq("is_bye", false);
  if (error) throw new Error(error.message);
  return (count ?? 0) === 0;
}
