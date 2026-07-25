import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { poolFinishOrder, resolveSeeds, computeSeedWrites, parseSeedRef } from "@/lib/bracket/seed";

export const runtime = "nodejs";

// Seeding (dispatch-brief-22): "machine proposes, director disposes."
// POST { tournamentSlug, overrides?, dryRun?: true }. Default (and any
// dryRun value other than the literal false) is a PREVIEW ONLY — no
// writes. Only an explicit `dryRun: false` applies. Never touches
// pool_games — reads it for standings, nothing more. Never touches
// Winner-of/Loser-of slots — those have no seed_ref and computeSeedWrites
// leaves anything without a seed_ref entirely alone.
export async function POST(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { tournamentSlug, overrides, dryRun } = body ?? {};
  if (!tournamentSlug) return Response.json({ error: "Missing tournamentSlug" }, { status: 400 });
  const apply = dryRun === false;

  const supabase = getServiceClient();

  const { data: tournament, error: tError } = await supabase
    .from("tournaments")
    .select("id, divisions(id, name, parent_division_id)")
    .eq("slug", tournamentSlug)
    .maybeSingle();
  if (tError) return Response.json({ error: tError.message }, { status: 500 });
  if (!tournament) return Response.json({ error: "Tournament not found" }, { status: 404 });

  const divisionIds = (tournament.divisions ?? []).map((d) => d.id);
  if (divisionIds.length === 0) {
    return Response.json({ ok: true, dryRun: !apply, applied: false, pools: {}, seeds: {}, preview: [], writes: [], unresolved: [] });
  }

  const { data: poolGames, error: pgError } = await supabase
    .from("pool_games")
    .select("id, pool, team1_name, team2_name, team1_score, team2_score, status")
    .in("division_id", divisionIds);
  if (pgError) return Response.json({ error: pgError.message }, { status: 500 });

  const { data: bracketGames, error: bgError } = await supabase
    .from("games")
    .select("id, division_id, team1_name, team2_name, team1_seed_ref, team2_seed_ref")
    .in("division_id", divisionIds);
  if (bgError) return Response.json({ error: bgError.message }, { status: 500 });

  // Group pool games by pool letter — same "derive, never hardcode" rule
  // as the public division page (a division can have pools A through
  // however many the director actually ran).
  const byPool = {};
  for (const g of poolGames ?? []) (byPool[g.pool] ??= []).push(g);

  const pools = {};
  const poolsByLetter = {};
  for (const [letter, games] of Object.entries(byPool)) {
    const finish = poolFinishOrder(games);
    poolsByLetter[letter] = finish;
    const finalCount = games.filter((g) => g.status === "final").length;
    pools[letter] = {
      total: games.length,
      finalCount,
      remaining: games.length - finalCount,
      complete: finish.complete,
      standings: finish.standings,
    };
  }

  const seeds = resolveSeeds(poolsByLetter, overrides ?? {});
  const { writes, unresolved } = computeSeedWrites(bracketGames ?? [], seeds);

  // Preview list keyed off every seed ref actually printed on this
  // tournament's bracket ("A #1 -> New Era" / "A #3 -> not yet"), not off
  // theoretical ranks — a rank the bracket never asks for shouldn't show
  // up as an unresolved slot.
  const seedRefsUsed = new Set();
  for (const g of bracketGames ?? []) {
    if (g.team1_seed_ref) seedRefsUsed.add(g.team1_seed_ref);
    if (g.team2_seed_ref) seedRefsUsed.add(g.team2_seed_ref);
  }
  const preview = [...seedRefsUsed]
    .map((seedRef) => {
      const parsed = parseSeedRef(seedRef);
      if (!parsed) return null;
      const key = `${parsed.pool} #${parsed.rank}`;
      return { seedRef, pool: parsed.pool, rank: parsed.rank, team: seeds[key] ?? null };
    })
    .filter(Boolean)
    .sort((a, b) => a.pool.localeCompare(b.pool) || a.rank - b.rank);

  if (!apply) {
    return Response.json({ ok: true, dryRun: true, applied: false, pools, seeds, preview, writes, unresolved });
  }

  // Applying = for each write, set the real team name. Only ever touches
  // public.games; pool_games is read-only in this route.
  const applyErrors = [];
  for (const w of writes) {
    const { error } = await supabase.from("games").update(w.patch).eq("id", w.id);
    if (error) applyErrors.push({ id: w.id, error: error.message });
  }

  if (applyErrors.length > 0) {
    return Response.json(
      { error: "Some writes failed", applyErrors, appliedCount: writes.length - applyErrors.length, pools, seeds, preview, writes, unresolved },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, dryRun: false, applied: true, appliedCount: writes.length, pools, seeds, preview, writes, unresolved });
}
