import { getServiceClient } from "@/lib/supabase";
import { buildBracketStructure, buildConsolationEntryStructure } from "./structure";
import { eagerCascade } from "./propagate";
import {
  directorSeedRef,
  isCompleteSeedOrder,
  normalizeSeedOrder,
} from "./seed-order";

function key(side, round, slot) {
  return `${side}:${round}:${slot}`;
}

/**
 * Inserts one bracket_group's worth of matches. When seedRanks is set
 * (Map teamName → 1-based seed), WR1 slots store team*_seed_ref as "Seed #n".
 */
async function generateBracketGroup(supabase, divisionId, bracketGroup, matches, seedRanks = null) {
  const insertRows = matches.map((m) => {
    const row = {
      division_id: divisionId,
      bracket_group: bracketGroup,
      bracket_side: m.side,
      round: m.round,
      slot: m.slot,
      team1_name: m.team1.type === "team" ? m.team1.name : null,
      team2_name: m.team2.type === "team" ? m.team2.name : null,
      team1_is_open_entry: m.team1.type === "open",
      team2_is_open_entry: m.team2.type === "open",
    };
    if (seedRanks && m.side === "winners" && m.round === 1) {
      if (m.team1.type === "team" && seedRanks.has(m.team1.name)) {
        row.team1_seed_ref = directorSeedRef(seedRanks.get(m.team1.name));
      }
      if (m.team2.type === "team" && seedRanks.has(m.team2.name)) {
        row.team2_seed_ref = directorSeedRef(seedRanks.get(m.team2.name));
      }
    }
    return row;
  });

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
 * Generates (or regenerates) a division's bracket from the **director seed
 * order** (seed #1 first). Never uses silent submitted_at order.
 *
 * @param {string} divisionId
 * @param {string} format double_elim | double_elim_consolation | three_gg_hybrid
 * @param {string[]|null} seedOrder optional override; else divisions.seed_order
 */
export async function generateBracket(divisionId, format = "double_elim", seedOrder = null) {
  const supabase = getServiceClient();

  const { data: registrations, error: regError } = await supabase
    .from("registrations")
    .select("team_name, submitted_at, status")
    .eq("division_id", divisionId)
    .neq("status", "withdrawn")
    .order("submitted_at", { ascending: true });
  if (regError) throw new Error(regError.message);

  const registeredNames = (registrations ?? []).map((r) => r.team_name).filter(Boolean);
  if (registeredNames.length < 2) {
    throw new Error("Need at least 2 registered teams in this division to generate a bracket");
  }

  let order = seedOrder;
  if (!order) {
    const { data: div } = await supabase
      .from("divisions")
      .select("seed_order")
      .eq("id", divisionId)
      .maybeSingle();
    order = div?.seed_order ?? null;
  }

  order = normalizeSeedOrder(registeredNames, order);
  if (!isCompleteSeedOrder(registeredNames, order)) {
    throw new Error(
      "Set the seed order first — every team needs a seed (#1, #2, …) before generating the bracket."
    );
  }

  // three_gg_hybrid: DE main + consolation so a 0–2 team still plays after
  // their second loss (third-life title re-entry is a follow-on).
  const structureFormat =
    format === "double_elim_consolation" || format === "three_gg_hybrid"
      ? "double_elim_consolation"
      : "double_elim";
  const storeFormat =
    format === "three_gg_hybrid"
      ? "three_gg_hybrid"
      : structureFormat === "double_elim_consolation"
        ? "double_elim_consolation"
        : "double_elim";

  const seedRanks = new Map(order.map((name, i) => [name, i + 1]));

  await supabase.from("games").delete().eq("division_id", divisionId);
  await supabase.from("brackets").delete().eq("division_id", divisionId);

  const main = buildBracketStructure(order, structureFormat);
  await generateBracketGroup(supabase, divisionId, "main", main.matches, seedRanks);
  await supabase.from("brackets").insert({
    division_id: divisionId,
    bracket_group: "main",
    format: storeFormat,
    team_count: order.length,
    bracket_size: main.bracketSize,
  });

  let consolation = null;
  if (structureFormat === "double_elim_consolation") {
    const entrantCount = order.length - 1;
    consolation = buildConsolationEntryStructure(entrantCount);
    await generateBracketGroup(supabase, divisionId, "consolation", consolation.matches, null);
    await supabase.from("brackets").insert({
      division_id: divisionId,
      bracket_group: "consolation",
      format: "double_elim",
      team_count: entrantCount,
      bracket_size: consolation.bracketSize,
    });
  }

  await supabase.from("divisions").update({ seed_order: order }).eq("id", divisionId);

  return {
    bracketSize: main.bracketSize,
    teamCount: order.length,
    matchCount: main.matches.length + (consolation?.matches.length ?? 0),
    consolationBracketSize: consolation?.bracketSize ?? null,
    seedOrder: order,
    format: storeFormat,
  };
}
