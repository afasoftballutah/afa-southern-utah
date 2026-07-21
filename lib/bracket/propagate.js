import { getServiceClient } from "@/lib/supabase";
import { resolveMatchSlots, classifyMatch, isEliminatingLoss } from "./resolve";

/**
 * Call after any game is finalized with a real, scorekeeper-entered score.
 * Fills in the next round's team names wherever this result feeds them,
 * cascading recursively through any resulting bye walkovers, applies the
 * "if necessary" grand-final rule, and — if this loss eliminates a team
 * from the MAIN bracket and the division has a consolation bracket — feeds
 * that team into the consolation bracket's next open entry slot (JD's
 * ruling, 2026-07-21). All three of these are handled by the same
 * `finalizeGame` used by the generation-time eager cascade (`generate.js`)
 * and the consolation-entry cascade below, so a game reaching 'final' via
 * a bye or an entrant-assignment gets exactly the same treatment as one
 * reaching it via a real score — see known-issues for the bug class this
 * closes (GF2 replaying because the two pathways used to apply the rule
 * inconsistently).
 */
export async function propagateAfterFinalize(finishedGameId) {
  const supabase = getServiceClient();
  const { data: finished, error } = await supabase.from("games").select("*").eq("id", finishedGameId).single();
  if (error || !finished) throw new Error(error?.message || "Game not found");

  await onGameFinalized(supabase, finished);
  await cascadeDependents(supabase, finished.division_id, finished.bracket_group, finishedGameId);
}

/**
 * Runs the side effects that apply the instant ANY game reaches 'final' —
 * whichever bracket_group it's in, whichever pathway got it there. Shared
 * by the live score-entry path and the eager/entrant-driven cascades.
 */
async function onGameFinalized(supabase, game) {
  // Grand-final rule: game one decided outright (winners-side team won) —
  // the "if necessary" game two never happens.
  if (game.bracket_side === "final" && game.round === 1 && game.winner_slot === "team1") {
    const { data: gf2 } = await supabase
      .from("games")
      .select("id, status")
      .eq("division_id", game.division_id)
      .eq("bracket_group", game.bracket_group)
      .eq("bracket_side", "final")
      .eq("round", 2)
      .maybeSingle();
    if (gf2 && gf2.status === "pending") {
      await supabase.from("games").update({ status: "cancelled" }).eq("id", gf2.id);
    }
  }

  // Consolation entry: only for the MAIN bracket's own eliminations — an
  // elimination inside the consolation bracket itself is terminal, it
  // doesn't feed anywhere further.
  if (game.bracket_group === "main" && isEliminatingLoss(game)) {
    const { data: consBracket } = await supabase
      .from("brackets")
      .select("id")
      .eq("division_id", game.division_id)
      .eq("bracket_group", "consolation")
      .maybeSingle();
    if (consBracket) {
      const loserName = game.winner_slot === "team1" ? game.team2_name : game.team1_name;
      await assignConsolationEntrant(supabase, game.division_id, loserName);
    }
  }
}

/**
 * Places a newly-eliminated team into the next open consolation slot, in
 * FIFO order of elimination (real-world chronological order — whichever
 * game the scorekeeper happens to finalize first fills the earliest slot).
 * Then re-resolves that one match (it may now be a bye — one open slot
 * filled, the other a permanent bye — or just newly "ready," awaiting a
 * real score) and cascades from there exactly like any other finalize.
 */
async function assignConsolationEntrant(supabase, divisionId, teamName) {
  const { data: openRows, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", "consolation")
    .eq("bracket_side", "winners")
    .eq("round", 1)
    .or("team1_is_open_entry.eq.true,team2_is_open_entry.eq.true")
    .order("slot", { ascending: true });
  if (error) throw new Error(error.message);

  let seat = null;
  for (const row of openRows ?? []) {
    if (row.team1_is_open_entry && row.team1_name === null) {
      seat = { row, field: "team1_name" };
      break;
    }
    if (row.team2_is_open_entry && row.team2_name === null) {
      seat = { row, field: "team2_name" };
      break;
    }
  }
  if (!seat) {
    // Shouldn't happen — the consolation bracket is sized for exactly
    // (main team_count - 1) entrants, and that's exactly how many
    // eliminations the main bracket ever produces. Don't block the main
    // bracket's own result over a consolation bookkeeping mismatch.
    console.error(`No open consolation slot for eliminated team "${teamName}" in division ${divisionId}`);
    return;
  }

  await supabase.from("games").update({ [seat.field]: teamName }).eq("id", seat.row.id);
  await resolveAndCascade(supabase, { ...seat.row, [seat.field]: teamName });
}

/**
 * Re-resolves a single match's slots and, if it now auto-completes (bye or
 * dead), finalizes it and cascades to its dependents — recursively, since
 * one resolution can trigger another (a chain of byes, or an elimination
 * feeding the consolation bracket which itself immediately byes someone
 * through).
 *
 * Always re-fetches this game's CURRENT status from the DB rather than
 * trusting the passed-in `row` — callers (the eager cascade in generate.js,
 * in particular) may be iterating a list of rows captured before an
 * earlier step in the same pass already finalized this one via a
 * recursive cascade. Skipping that check and trusting a stale "pending"
 * would re-run onGameFinalized (GF2 cancellation, consolation-entrant
 * assignment) a second time for the same real event.
 */
async function resolveAndCascade(supabase, row) {
  const { data: allGames, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", row.division_id)
    .eq("bracket_group", row.bracket_group);
  if (error) throw new Error(error.message);
  const gamesById = new Map(allGames.map((g) => [g.id, g]));

  const current = gamesById.get(row.id);
  if (!current || current.status !== "pending") return;

  const { team1, team2 } = resolveMatchSlots(current, (id) => gamesById.get(id));
  const cls = classifyMatch(team1, team2);
  const patch = {};
  if ("team" in team1 && current.team1_name !== team1.team) patch.team1_name = team1.team;
  if ("team" in team2 && current.team2_name !== team2.team) patch.team2_name = team2.team;

  if (cls === "bye") {
    patch.is_bye = true;
    patch.status = "final";
    patch.winner_slot = "team" in team1 ? "team1" : "team2";
  } else if (cls === "dead") {
    patch.status = "cancelled";
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from("games").update(patch).eq("id", current.id);
  }

  if (cls === "bye" || cls === "dead") {
    const finalized = { ...current, ...patch };
    await onGameFinalized(supabase, finalized);
    await cascadeDependents(supabase, current.division_id, current.bracket_group, current.id);
  }
}

async function cascadeDependents(supabase, divisionId, bracketGroup, justFinalizedGameId) {
  const { data: dependents, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", bracketGroup)
    .or(`team1_source_game_id.eq.${justFinalizedGameId},team2_source_game_id.eq.${justFinalizedGameId}`);
  if (error) throw new Error(error.message);
  for (const dep of dependents ?? []) {
    await resolveAndCascade(supabase, dep);
  }
}

/**
 * Runs the eager cascade over an entire bracket_group right after
 * generation — resolves whatever can be resolved with no real games
 * played yet (pure bye walkovers; for the main bracket, that can also
 * immediately feed eliminations into an already-generated consolation
 * bracket, e.g. a bye chain that reaches all the way to the grand final —
 * rare, but the same engine handles it uniformly rather than needing a
 * special case). `orderedGames` must be in dependency order (each game's
 * feeders come earlier in the list) — generate.js provides this since it
 * already builds the structure in that order.
 */
export async function eagerCascade(supabase, divisionId, bracketGroup, orderedGameRows) {
  // Sequential on purpose — each row's resolution can depend on the
  // previous one's patch having already landed.
  for (const row of orderedGameRows) {
    await resolveAndCascade(supabase, row);
  }
}

/**
 * A bracket_group is DRAFT until any real (non-bye) game in IT has a
 * scorekeeper-entered score. Once that happens its shape locks — only
 * manual field/time reassignment and score entry are allowed from then on,
 * not team/slot editing or regeneration. Pass no bracketGroup to check
 * across every group for a division (used to gate destructive actions
 * like regeneration, which would wipe both the main and consolation
 * brackets together).
 */
export async function isBracketDraft(divisionId, bracketGroup) {
  const supabase = getServiceClient();
  let query = supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("division_id", divisionId)
    .eq("status", "final")
    .eq("is_bye", false);
  if (bracketGroup) query = query.eq("bracket_group", bracketGroup);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return (count ?? 0) === 0;
}
