import { getServiceClient } from "@/lib/supabase";
import { buildBracketStructure, buildConsolationEntryStructure } from "./structure";
import { eagerCascade } from "./propagate";

function key(side, round, slot) {
  return `${side}:${round}:${slot}`;
}

/**
 * Inserts one bracket_group's worth of matches (main, with real teams from
 * registrations; or consolation, with open-entry placeholders) and runs the
 * eager bye cascade over it. Returns nothing — writes directly.
 */
async function generateBracketGroup(supabase, divisionId, bracketGroup, matches) {
  const insertRows = matches.map((m) => ({
    division_id: divisionId,
    bracket_group: bracketGroup,
    bracket_side: m.side,
    round: m.round,
    slot: m.slot,
    team1_name: m.team1.type === "team" ? m.team1.name : null,
    team2_name: m.team2.type === "team" ? m.team2.name : null,
    team1_is_open_entry: m.team1.type === "open",
    team2_is_open_entry: m.team2.type === "open",
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("games")
    .insert(insertRows)
    .select("id, bracket_side, round, slot");
  if (insertError) throw new Error(insertError.message);

  const idByKey = new Map(inserted.map((r) => [key(r.bracket_side, r.round, r.slot), r.id]));

  const updates = [];
  for (const m of matches) {
    const patch = {};
    if (m.team1.type === "ref") {
      patch.team1_source_game_id = idByKey.get(key(m.team1.side, m.team1.round, m.team1.slot));
      patch.team1_source_result = m.team1.result;
    }
    if (m.team2.type === "ref") {
      patch.team2_source_game_id = idByKey.get(key(m.team2.side, m.team2.round, m.team2.slot));
      patch.team2_source_result = m.team2.result;
    }
    if (Object.keys(patch).length > 0) {
      updates.push({ id: idByKey.get(key(m.side, m.round, m.slot)), patch });
    }
  }
  for (const { id, patch } of updates) {
    const { error } = await supabase.from("games").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  // Eager cascade — process every match in the same dependency order it
  // was generated in (winners asc, losers asc, final). For 'main' this
  // resolves every pure bye walkover; for 'consolation' there's nothing to
  // resolve yet (every real slot is still "open", waiting on an
  // elimination that hasn't happened), it's a no-op pass.
  const { data: allGames, error: fetchError } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", bracketGroup);
  if (fetchError) throw new Error(fetchError.message);
  const gamesByKey = new Map(allGames.map((g) => [key(g.bracket_side, g.round, g.slot), g]));
  const orderedRows = matches.map((m) => gamesByKey.get(key(m.side, m.round, m.slot))).filter(Boolean);

  await eagerCascade(supabase, divisionId, bracketGroup, orderedRows);
}

/**
 * Generates (or regenerates) a division's bracket from its current
 * registrations. Teams flow in automatically — no retyping. For
 * format='double_elim_consolation', also generates a second, separate
 * double-elimination bracket sized for every team the main bracket could
 * possibly eliminate (team_count - 1 — everyone except the eventual main
 * champion). That bracket's real slots start empty ("open entry") and get
 * filled live, in elimination order, as the main bracket actually plays
 * out (see propagate.js) — there's no way to know in advance which team
 * lands in which consolation slot.
 *
 * Only allowed while the bracket is still draft across BOTH groups (see
 * isBracketDraft in propagate.js); callers must check that first.
 */
export async function generateBracket(divisionId, format = "double_elim") {
  const supabase = getServiceClient();

  const { data: registrations, error: regError } = await supabase
    .from("registrations")
    .select("team_name, submitted_at")
    .eq("division_id", divisionId)
    .order("submitted_at", { ascending: true });
  if (regError) throw new Error(regError.message);

  const teamNames = (registrations ?? []).map((r) => r.team_name);
  if (teamNames.length < 2) {
    throw new Error("Need at least 2 registered teams in this division to generate a bracket");
  }

  // Wipe any existing games/brackets for this division (regeneration path,
  // both groups) — callers confirm draft status before calling this.
  await supabase.from("games").delete().eq("division_id", divisionId);
  await supabase.from("brackets").delete().eq("division_id", divisionId);

  const main = buildBracketStructure(teamNames, format);
  await generateBracketGroup(supabase, divisionId, "main", main.matches);
  await supabase.from("brackets").insert({
    division_id: divisionId,
    bracket_group: "main",
    format,
    team_count: teamNames.length,
    bracket_size: main.bracketSize,
  });

  let consolation = null;
  if (format === "double_elim_consolation") {
    const entrantCount = teamNames.length - 1;
    consolation = buildConsolationEntryStructure(entrantCount);
    await generateBracketGroup(supabase, divisionId, "consolation", consolation.matches);
    await supabase.from("brackets").insert({
      division_id: divisionId,
      bracket_group: "consolation",
      format: "double_elim",
      team_count: entrantCount,
      bracket_size: consolation.bracketSize,
    });
  }

  return {
    bracketSize: main.bracketSize,
    teamCount: teamNames.length,
    matchCount: main.matches.length + (consolation?.matches.length ?? 0),
    consolationBracketSize: consolation?.bracketSize ?? null,
  };
}
