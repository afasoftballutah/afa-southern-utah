import { getServiceClient } from "@/lib/supabase";
import { resolveMatchSlots, classifyMatch, isEliminatingLoss } from "./resolve";
import {
  countMainRecord,
  isZeroTwoAfterLoss,
  isSurvivorPoolGame,
  shouldSoloReenter,
  takeSurvivorPair,
  appendSurvivorPool,
  removeFromSurvivorPool,
  SURVIVOR_POOL_FIELD,
} from "./lives";

/**
 * Call after any game is finalized with a real, scorekeeper-entered score.
 * Cascades feeder names, GF2 cancel rule, consolation entry, and 3GG
 * survivor-pool / re-entry.
 */
export async function propagateAfterFinalize(finishedGameId) {
  const supabase = getServiceClient();
  const { data: finished, error } = await supabase.from("games").select("*").eq("id", finishedGameId).single();
  if (error || !finished) throw new Error(error?.message || "Game not found");

  await onGameFinalized(supabase, finished);
  await cascadeDependents(supabase, finished.division_id, finished.bracket_group, finishedGameId);
}

async function onGameFinalized(supabase, game) {
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

  if (game.bracket_group === "main" && game.status === "final") {
    const { data: mainGames } = await supabase
      .from("games")
      .select("*")
      .eq("division_id", game.division_id)
      .eq("bracket_group", "main");

    const format = await mainFormat(supabase, game.division_id);

    if (format === "three_gg_hybrid") {
      await handleThreeGgAfterFinalize(supabase, game, mainGames ?? []);
    } else if (isEliminatingLoss(game, mainGames ?? [])) {
      const loserName = game.winner_slot === "team1" ? game.team2_name : game.team1_name;
      if (loserName) {
        await handleMainElimination(supabase, game.division_id, loserName);
      }
    }
  }
}

async function mainFormat(supabase, divisionId) {
  const { data: mainMeta } = await supabase
    .from("brackets")
    .select("format")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main")
    .maybeSingle();
  return mainMeta?.format ?? "double_elim";
}

/**
 * 3GG: standard DE advance already ran via cascade. Here we only handle
 * second-loss winless → pool, pool-of-two games, survivor winner re-entry,
 * and solo re-entry when no partner can still appear.
 */
async function handleThreeGgAfterFinalize(supabase, game, mainGames) {
  const divisionId = game.division_id;
  const loserName =
    game.winner_slot === "team1" ? game.team2_name : game.winner_slot === "team2" ? game.team1_name : null;
  const winnerName =
    game.winner_slot === "team1" ? game.team1_name : game.winner_slot === "team2" ? game.team2_name : null;

  // Survivor pool game finished: winner re-enters; loser is 0–3 out.
  if (isSurvivorPoolGame(game) && winnerName) {
    await reenterLosersBracket(supabase, divisionId, winnerName);
    const pool = await readSurvivorPool(supabase, divisionId);
    await writeSurvivorPool(supabase, divisionId, removeFromSurvivorPool(pool, winnerName, loserName));
    await maybeSoloReenter(supabase, divisionId);
    return;
  }

  // Second loss winless → runtime pool only when the chart has no seat for
  // them (9-team fixed sheet already routes G9/G10 → G11 and G12-if-0-2 → G14).
  if (loserName && isZeroTwoAfterLoss(mainGames, loserName)) {
    const hasLoserSeat = (mainGames ?? []).some(
      (g) =>
        g.id !== game.id &&
        ((g.team1_source_game_id === game.id && g.team1_source_result === "loser") ||
          (g.team2_source_game_id === game.id && g.team2_source_result === "loser"))
    );
    if (!hasLoserSeat) {
      const pool = await readSurvivorPool(supabase, divisionId);
      await writeSurvivorPool(supabase, divisionId, appendSurvivorPool(pool, loserName));
    }
  }

  await flushSurvivorPairIfReady(supabase, divisionId);
  await maybeSoloReenter(supabase, divisionId);
}

async function readSurvivorPool(supabase, divisionId) {
  const { data, error } = await supabase
    .from("divisions")
    .select("third_life_teams")
    .eq("id", divisionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.third_life_teams ?? [];
}

async function writeSurvivorPool(supabase, divisionId, pool) {
  const { error } = await supabase
    .from("divisions")
    .update({ third_life_teams: pool })
    .eq("id", divisionId);
  if (error) throw new Error(error.message);
}

async function flushSurvivorPairIfReady(supabase, divisionId) {
  let pool = await readSurvivorPool(supabase, divisionId);
  while (true) {
    const pair = takeSurvivorPair(pool);
    if (!pair) break;

    const { data: pendingPoolGames } = await supabase
      .from("games")
      .select("id, team1_name, team2_name")
      .eq("division_id", divisionId)
      .eq("bracket_group", "main")
      .eq("field", SURVIVOR_POOL_FIELD)
      .eq("status", "pending");

    const already = (pendingPoolGames ?? []).some((g) => {
      const names = new Set([g.team1_name, g.team2_name]);
      return names.has(pair.a) && names.has(pair.b);
    });
    if (!already) {
      await insertSurvivorGame(supabase, divisionId, pair.a, pair.b);
    }
    pool = pair.rest;
    await writeSurvivorPool(supabase, divisionId, pool);
  }
}

async function insertSurvivorGame(supabase, divisionId, a, b) {
  const { data: losers, error } = await supabase
    .from("games")
    .select("round, slot")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main")
    .eq("bracket_side", "losers");
  if (error) throw new Error(error.message);

  let maxRound = 0;
  for (const g of losers ?? []) {
    if (g.round > maxRound) maxRound = g.round;
  }
  const round = maxRound + 1;

  const { error: insErr } = await supabase.from("games").insert({
    division_id: divisionId,
    bracket_group: "main",
    bracket_side: "losers",
    round,
    slot: 0,
    team1_name: a,
    team2_name: b,
    field: SURVIVOR_POOL_FIELD,
    status: "pending",
    is_bye: false,
  });
  if (insErr) throw new Error(insErr.message);
}

async function maybeSoloReenter(supabase, divisionId) {
  const pool = await readSurvivorPool(supabase, divisionId);
  if (pool.length !== 1) return;

  const { data: mainGames, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main");
  if (error) throw new Error(error.message);

  const allNames = collectTeamNames(mainGames ?? []);
  if (!shouldSoloReenter(pool, mainGames ?? [], allNames)) return;

  const team = pool[0];
  await reenterLosersBracket(supabase, divisionId, team);
  await writeSurvivorPool(supabase, divisionId, []);
}

function collectTeamNames(games) {
  const set = new Set();
  for (const g of games) {
    if (g.team1_name) set.add(g.team1_name);
    if (g.team2_name) set.add(g.team2_name);
  }
  return [...set];
}

/**
 * Place a survivor winner (or solo re-entry) into the next open losers seat.
 */
async function reenterLosersBracket(supabase, divisionId, teamName) {
  const name = String(teamName ?? "").trim();
  if (!name) return;

  const { data: losers, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", "main")
    .eq("bracket_side", "losers")
    .eq("status", "pending")
    .order("round", { ascending: true })
    .order("slot", { ascending: true });
  if (error) throw new Error(error.message);

  // Prefer true one-side-waiting seats (not survivor pool shells).
  const candidates = (losers ?? []).filter((g) => !isSurvivorPoolGame(g));
  const oneEmpty = candidates.find(
    (g) =>
      (g.team1_name == null && g.team2_name != null) ||
      (g.team2_name == null && g.team1_name != null)
  );
  if (oneEmpty) {
    const field = oneEmpty.team1_name == null ? "team1_name" : "team2_name";
    const openField = field === "team1_name" ? "team1_is_open_entry" : "team2_is_open_entry";
    const patch = { [field]: name, [openField]: false };
    await supabase.from("games").update(patch).eq("id", oneEmpty.id);
    await resolveAndCascade(supabase, { ...oneEmpty, ...patch });
    return;
  }

  // Both-null pending (source still unresolved on one side): fill first empty name.
  const bothOpen = candidates.find((g) => g.team1_name == null && g.team2_name == null);
  if (bothOpen) {
    const patch = { team1_name: name, team1_is_open_entry: false };
    await supabase.from("games").update(patch).eq("id", bothOpen.id);
    await resolveAndCascade(supabase, { ...bothOpen, ...patch });
    return;
  }

  // Last resort: new losers game with re-entry waiting for an opponent.
  let maxRound = 0;
  for (const g of losers ?? []) {
    if (g.round > maxRound) maxRound = g.round;
  }
  for (const g of candidates) {
    if (g.round > maxRound) maxRound = g.round;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("games")
    .insert({
      division_id: divisionId,
      bracket_group: "main",
      bracket_side: "losers",
      round: maxRound + 1,
      slot: 0,
      team1_name: name,
      team2_name: null,
      team2_is_open_entry: true,
      field: "Re-entry",
      status: "pending",
      is_bye: false,
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  if (inserted) await resolveAndCascade(supabase, inserted);
}

/**
 * Only double_elim_consolation places eliminated teams into a consol tree.
 */
async function handleMainElimination(supabase, divisionId, loserName) {
  const format = await mainFormat(supabase, divisionId);
  if (format !== "double_elim_consolation") return;

  const { data: consBracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("division_id", divisionId)
    .eq("bracket_group", "consolation")
    .maybeSingle();
  if (!consBracket) return;
  await assignConsolationEntrant(supabase, divisionId, loserName);
}

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
    console.error(`No open consolation slot for eliminated team "${teamName}" in division ${divisionId}`);
    return;
  }

  await supabase.from("games").update({ [seat.field]: teamName }).eq("id", seat.row.id);
  await resolveAndCascade(supabase, { ...seat.row, [seat.field]: teamName });
}

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

  const { team1, team2 } = resolveMatchSlots(
    current,
    (id) => gamesById.get(id),
    allGames
  );
  const cls = classifyMatch(team1, team2);
  const patch = {};
  if ("team" in team1 && current.team1_name !== team1.team) patch.team1_name = team1.team;
  if ("team" in team2 && current.team2_name !== team2.team) patch.team2_name = team2.team;

  if (cls === "ready" || cls === "partial") {
    if (Object.keys(patch).length > 0) {
      await supabase.from("games").update(patch).eq("id", current.id);
    }
    return;
  }

  if (cls === "bye") {
    const winnerIs1 = "team" in team1;
    Object.assign(patch, {
      status: "final",
      is_bye: true,
      winner_slot: winnerIs1 ? "team1" : "team2",
      team1_score: winnerIs1 ? 1 : 0,
      team2_score: winnerIs1 ? 0 : 1,
    });
  } else {
    Object.assign(patch, { status: "cancelled" });
  }

  await supabase.from("games").update(patch).eq("id", current.id);
  const finalized = { ...current, ...patch };
  await onGameFinalized(supabase, finalized);
  if (finalized.status === "final") {
    await cascadeDependents(supabase, finalized.division_id, finalized.bracket_group, finalized.id);
  }
}

async function cascadeDependents(supabase, divisionId, bracketGroup, justFinalizedGameId) {
  const { data: dependents, error } = await supabase
    .from("games")
    .select("*")
    .eq("division_id", divisionId)
    .eq("bracket_group", bracketGroup)
    .or(
      `team1_source_game_id.eq.${justFinalizedGameId},team2_source_game_id.eq.${justFinalizedGameId}`
    );
  if (error) throw new Error(error.message);
  for (const dep of dependents ?? []) {
    await resolveAndCascade(supabase, dep);
  }
}

export async function eagerCascade(supabase, divisionId, bracketGroup, orderedGameRows) {
  for (const row of orderedGameRows) {
    await resolveAndCascade(supabase, row);
  }
}

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
