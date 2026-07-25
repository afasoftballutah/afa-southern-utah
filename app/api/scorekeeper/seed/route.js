import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import {
  poolFinishOrder,
  resolveSeeds,
  computeSeedWrites,
  computeRemap,
  parseSeedRef,
} from "@/lib/bracket/seed";

export const runtime = "nodejs";

// Seeding (dispatch-brief-22, extended by 23): "machine proposes, director
// disposes." POST body shapes:
//   { tournamentSlug, overrides?, dryRun?: true }      — preview/apply (22)
//   { tournamentSlug, action: "remap", gameId, slot, seedRef } — remap (23)
//
// Preview (default, and any dryRun value other than the literal false) is
// PREVIEW ONLY — no writes. Only an explicit `dryRun: false` applies.
// Remap writes ONLY games.<slot>_seed_ref — which seed feeds a slot, never
// a team name. Never touches pool_games — reads it for standings, nothing
// more. Never touches Winner-of/Loser-of slots — those have no seed_ref
// and computeSeedWrites/computeRemap leave anything without one alone.
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
  const { tournamentSlug, overrides, dryRun, action, gameId, slot, seedRef } = body ?? {};
  if (!tournamentSlug) return Response.json({ error: "Missing tournamentSlug" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: tournament, error: tError } = await supabase
    .from("tournaments")
    .select("id, divisions(id, name, sort_order, parent_division_id)")
    .eq("slug", tournamentSlug)
    .maybeSingle();
  if (tError) return Response.json({ error: tError.message }, { status: 500 });
  if (!tournament) return Response.json({ error: "Tournament not found" }, { status: 404 });

  const divisionIds = (tournament.divisions ?? []).map((d) => d.id);
  const divisionMeta = new Map((tournament.divisions ?? []).map((d) => [d.id, d]));

  // --- action: "remap" — change which seed feeds a slot. Never resolves
  // team names, never touches pool_games. Swap, don't duplicate: enforced
  // by computeRemap (lib/bracket/seed.js), a pure function so the
  // invariant is unit-testable against fixtures, not just live rows.
  if (action === "remap") {
    if (!gameId || (slot !== "team1" && slot !== "team2")) {
      return Response.json({ error: "remap requires gameId and slot ('team1'|'team2')" }, { status: 400 });
    }
    if (seedRef != null && !parseSeedRef(seedRef)) {
      return Response.json({ error: `Invalid seedRef: ${seedRef}` }, { status: 400 });
    }
    if (divisionIds.length === 0) {
      return Response.json({ error: "Tournament has no divisions" }, { status: 400 });
    }

    const { data: bracketGames, error: bgError } = await supabase
      .from("games")
      .select("id, division_id, round, team1_seed_ref, team2_seed_ref")
      .in("division_id", divisionIds);
    if (bgError) return Response.json({ error: bgError.message }, { status: 500 });

    const writes = computeRemap(bracketGames ?? [], gameId, slot, seedRef ?? null);
    if (!writes) return Response.json({ error: "No such slot on this tournament" }, { status: 400 });

    const byId = new Map((bracketGames ?? []).map((g) => [g.id, g]));
    const changed = [];
    for (const w of writes) {
      const { error } = await supabase
        .from("games")
        .update({ [`${w.slot}_seed_ref`]: w.seedRef })
        .eq("id", w.id);
      if (error) return Response.json({ error: error.message, partial: changed }, { status: 500 });
      const g = byId.get(w.id);
      changed.push({
        gameId: w.id,
        slot: w.slot,
        seedRef: w.seedRef,
        division: divisionMeta.get(g?.division_id)?.name ?? null,
        round: g?.round ?? null,
      });
    }

    return Response.json({ ok: true, action: "remap", changed });
  }

  // --- default: dry-run preview / apply (dispatch-brief-22 behaviour) ---
  const apply = dryRun === false;

  if (divisionIds.length === 0) {
    return Response.json({ ok: true, dryRun: !apply, applied: false, pools: {}, seeds: {}, preview: [], slots: [], seedRefOptions: [], writes: [], unresolved: [] });
  }

  const { data: poolGames, error: pgError } = await supabase
    .from("pool_games")
    .select("id, pool, team1_name, team2_name, team1_score, team2_score, status")
    .in("division_id", divisionIds);
  if (pgError) return Response.json({ error: pgError.message }, { status: 500 });

  const { data: bracketGames, error: bgError } = await supabase
    .from("games")
    .select("id, division_id, round, team1_name, team2_name, team1_seed_ref, team2_seed_ref")
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

  // Seeds → slots table (dispatch-brief-23, section B): one row per
  // seed-fed slot, grouped by bracket division (Gold/Silver/Bronze —
  // derived from each division's own sort_order, never a hardcoded name
  // list), ordered within a division by the printed game number
  // (games.round, the same field the public bracket page prints as
  // "Game N").
  const slots = [];
  for (const g of bracketGames ?? []) {
    const meta = divisionMeta.get(g.division_id);
    for (const s of ["team1", "team2"]) {
      const ref = g[`${s}_seed_ref`];
      if (!ref) continue; // not a seed slot at all (Winner of/Loser of) — leave alone
      const parsed = parseSeedRef(ref);
      const team = parsed ? (seeds[`${parsed.pool} #${parsed.rank}`] ?? null) : null;
      slots.push({
        gameId: g.id,
        slot: s,
        division: meta?.name ?? "Unknown",
        divisionSortOrder: meta?.sort_order ?? 0,
        round: g.round,
        seedRef: ref,
        team,
      });
    }
  }
  slots.sort(
    (a, b) =>
      a.divisionSortOrder - b.divisionSortOrder ||
      (a.round ?? 0) - (b.round ?? 0) ||
      a.slot.localeCompare(b.slot)
  );

  // Every seed ref this tournament's bracket currently assigns to a slot —
  // the full universe a remap <select> can offer. Derived from the same
  // seedRefsUsed set the preview above is built from (not a hardcoded
  // A1..I9 range), sorted pool-then-rank for a stable, legible list.
  const seedRefOptions = [...seedRefsUsed]
    .map((ref) => ({ ref, parsed: parseSeedRef(ref) }))
    .filter((x) => x.parsed)
    .sort((a, b) => a.parsed.pool.localeCompare(b.parsed.pool) || a.parsed.rank - b.parsed.rank)
    .map((x) => x.ref);

  if (!apply) {
    return Response.json({ ok: true, dryRun: true, applied: false, pools, seeds, preview, slots, seedRefOptions, writes, unresolved });
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
      { error: "Some writes failed", applyErrors, appliedCount: writes.length - applyErrors.length, pools, seeds, preview, slots, seedRefOptions, writes, unresolved },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, dryRun: false, applied: true, appliedCount: writes.length, pools, seeds, preview, slots, seedRefOptions, writes, unresolved });
}
