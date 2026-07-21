import { getServiceClient } from "@/lib/supabase";

/**
 * Determines whether a division's bracket has produced a champion yet, and
 * who it is. Two ways a division finishes:
 *   - GF1 finalizes with the winners-bracket team (team1) winning outright
 *     (GF2 gets auto-cancelled — see propagate.js).
 *   - GF2 (the "if necessary" decider) finalizes — whoever wins it is champion
 *     regardless of team1/team2, since it's a clean decisive game.
 */
export async function getDivisionCompletion(divisionId) {
  const supabase = getServiceClient();
  const { data: finals, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main") // the division's champion comes from the MAIN bracket only, never the consolation bracket's own grand final
    .eq("bracket_side", "final")
    .order("round", { ascending: true });
  if (error) throw new Error(error.message);

  const gf1 = finals?.find((g) => g.round === 1);
  const gf2 = finals?.find((g) => g.round === 2);

  if (gf2 && gf2.status === "final") {
    const championName = gf2.winner_slot === "team1" ? gf2.team1_name : gf2.team2_name;
    const runnerUpName = gf2.winner_slot === "team1" ? gf2.team2_name : gf2.team1_name;
    return { complete: true, championName, runnerUpName };
  }
  if (gf1 && gf1.status === "final" && gf1.winner_slot === "team1") {
    return { complete: true, championName: gf1.team1_name, runnerUpName: gf1.team2_name };
  }
  return { complete: false, championName: null, runnerUpName: null };
}
