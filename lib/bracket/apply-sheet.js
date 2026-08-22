import { seatFromSheetName } from "./read-sheet";

/**
 * Write a photo draft onto a division.
 * Existing paper G#s are updated (unless already scored). Missing G#s are
 * inserted. Winner/Loser links are filled on a second pass.
 */
export async function applySheetDraft(supabase, { divisionId, games }) {
  const list = [...(games ?? [])].sort((a, b) => a.n - b.n);
  if (!list.length) return { updated: 0, inserted: 0, skipped: 0 };

  const { data: existing, error: existErr } = await supabase
    .from("games")
    .select("id, round, status, is_bye, bracket_side, slot")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main");
  if (existErr) throw new Error("Could not load games");

  const byRound = new Map((existing ?? []).map((g) => [g.round, g]));
  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const row of list) {
    const left = seatFromSheetName(row.a, roundIds(byRound));
    const right = seatFromSheetName(row.b, roundIds(byRound));
    if (left.error || right.error) {
      skipped += 1;
      continue;
    }
    const patch = {
      team1_name: left.name,
      team2_name: right.name,
      team1_source_game_id: left.sourceId,
      team1_source_result: left.sourceResult,
      team2_source_game_id: right.sourceId,
      team2_source_result: right.sourceResult,
      team1_seed_ref: null,
      team2_seed_ref: null,
      updated_at: new Date().toISOString(),
    };
    if (row.field) patch.field = row.field;
    if (row.scheduledTime) patch.scheduled_time = row.scheduledTime;

    const have = byRound.get(row.n);
    if (have) {
      if (have.status === "final" && !have.is_bye) {
        skipped += 1;
        continue;
      }
      const { error } = await supabase.from("games").update(patch).eq("id", have.id);
      if (error) throw new Error(error.message || "Could not update a game");
      updated += 1;
      continue;
    }

    const { data: created, error: insErr } = await supabase
      .from("games")
      .insert({
        division_id: divisionId,
        bracket_group: "main",
        bracket_side: "winners",
        round: row.n,
        slot: 0,
        status: "pending",
        ...patch,
      })
      .select("id, round, status, is_bye")
      .maybeSingle();
    if (insErr) throw new Error(insErr.message || "Could not add a game");
    byRound.set(row.n, created);
    inserted += 1;
  }

  // Second pass: G10 may have been written before G7 existed.
  const ids = roundIds(byRound);
  for (const row of list) {
    const have = byRound.get(row.n);
    if (!have || (have.status === "final" && !have.is_bye)) continue;
    const left = seatFromSheetName(row.a, ids);
    const right = seatFromSheetName(row.b, ids);
    if (!left.sourceId && !right.sourceId) continue;
    await supabase
      .from("games")
      .update({
        team1_source_game_id: left.sourceId,
        team1_source_result: left.sourceResult,
        team2_source_game_id: right.sourceId,
        team2_source_result: right.sourceResult,
        updated_at: new Date().toISOString(),
      })
      .eq("id", have.id);
  }

  return { updated, inserted, skipped };
}

function roundIds(byRound) {
  const ids = new Map();
  for (const [n, g] of byRound) ids.set(n, g.id);
  return ids;
}
