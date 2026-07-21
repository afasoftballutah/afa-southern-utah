import { getServiceClient } from "@/lib/supabase";
import { buildBracketStructure } from "./structure";
import { resolveMatchSlots, classifyMatch } from "./resolve";

function key(side, round, slot) {
  return `${side}:${round}:${slot}`;
}

/**
 * Generates (or regenerates) a division's bracket from its current
 * registrations. Teams flow in automatically — no retyping. Only allowed
 * while the bracket is still draft (see isBracketDraft in propagate.js);
 * callers must check that before calling this.
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

  const { bracketSize, matches } = buildBracketStructure(teamNames, format);

  // Wipe any existing draft games for this division (regeneration path).
  // Callers are responsible for confirming the bracket is still draft.
  await supabase.from("games").delete().eq("division_id", divisionId);
  await supabase.from("brackets").delete().eq("division_id", divisionId);

  // Pass 1 — insert every match with its direct team names (if any). Source
  // links get filled in pass 2, once we have real row ids.
  const insertRows = matches.map((m) => ({
    division_id: divisionId,
    bracket_side: m.side,
    round: m.round,
    slot: m.slot,
    team1_name: m.team1.type === "team" ? m.team1.name : null,
    team2_name: m.team2.type === "team" ? m.team2.name : null,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("games")
    .insert(insertRows)
    .select("id, bracket_side, round, slot");
  if (insertError) throw new Error(insertError.message);

  const idByKey = new Map(inserted.map((r) => [key(r.bracket_side, r.round, r.slot), r.id]));

  // Pass 2 — set source_game_id/source_result for every ref slot.
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

  await supabase.from("brackets").insert({
    division_id: divisionId,
    format,
    team_count: teamNames.length,
    bracket_size: bracketSize,
  });

  // Pass 3 — eager bye cascade. Process every match in dependency order
  // (already the order `matches` was generated in — winners asc, losers
  // asc, final). No real games exist yet, so the only resolutions possible
  // here are pure bye walkovers.
  const { data: allGames, error: fetchError } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId);
  if (fetchError) throw new Error(fetchError.message);

  const gamesById = new Map(allGames.map((g) => [g.id, g]));
  const gamesByKey = new Map(allGames.map((g) => [key(g.bracket_side, g.round, g.slot), g]));

  for (const m of matches) {
    const row = gamesByKey.get(key(m.side, m.round, m.slot));
    if (!row || row.status !== "pending") continue;
    const { team1, team2 } = resolveMatchSlots(row, (id) => gamesById.get(id));
    const cls = classifyMatch(team1, team2);
    const patch = {};
    if ("team" in team1) patch.team1_name = team1.team;
    if ("team" in team2) patch.team2_name = team2.team;
    if (cls === "bye") {
      patch.is_bye = true;
      patch.status = "final";
      patch.winner_slot = "team" in team1 ? "team1" : "team2";
    } else if (cls === "dead") {
      patch.status = "cancelled";
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("games").update(patch).eq("id", row.id);
      Object.assign(row, patch); // keep local map current for downstream refs in this same pass
    }
  }

  return { bracketSize, teamCount: teamNames.length, matchCount: matches.length };
}
