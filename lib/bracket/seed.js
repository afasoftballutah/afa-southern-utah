// Seeding (dispatch-brief-22): "machine proposes, director disposes."
// Pure logic only — no I/O, no Supabase client — so the same functions
// can be unit-tested against in-memory fixtures and run unchanged against
// live rows fetched by the API route.
//
// The law this obeys (afa-spec.md): standings COMPUTE; ties are surfaced
// for the director to settle and are NEVER broken automatically by run
// differential, head-to-head, or name order.

// Matches a raw pool-finish placeholder, brackets included or not — the
// live data stores these WITH brackets ("[A #1]"), but both forms are
// accepted since that's also what app/tournaments/[slug]/division/
// [divisionId]/page.js's SEED_PLACEHOLDER checks against.
const SEED_REF_RE = /^\[?([A-I]) #(\d+)\]?$/;

/**
 * poolStandings(games) — win/loss record per team in one pool.
 *
 * This is the EXACT logic lifted from app/tournaments/[slug]/division/
 * [divisionId]/page.js's poolStandings (dispatch-brief-22 instruction: do
 * not invent a second version that could disagree with what the public
 * page shows). The name-order tiebreak in the final sort is display
 * ordering only — poolFinishOrder below re-groups by identical W-L
 * regardless of this array's order, so that tiebreak never decides a
 * seed.
 */
export function poolStandings(games) {
  const teams = new Map();
  for (const g of games) {
    if (!teams.has(g.team1_name)) teams.set(g.team1_name, { name: g.team1_name, w: 0, l: 0 });
    if (!teams.has(g.team2_name)) teams.set(g.team2_name, { name: g.team2_name, w: 0, l: 0 });
    if (g.status !== "final") continue;
    const team1Won = g.team1_score > g.team2_score;
    teams.get(g.team1_name)[team1Won ? "w" : "l"] += 1;
    teams.get(g.team2_name)[team1Won ? "l" : "w"] += 1;
  }
  return [...teams.values()].sort((a, b) => b.w - a.w || a.name.localeCompare(b.name));
}

/**
 * poolFinishOrder(games) — one pool's finish order for seeding.
 *
 * Returns { standings, complete }.
 *   - complete: every game in the pool is final. An empty pool (no games)
 *     is not complete — there's nothing to finish.
 *   - standings: an array of { team, w, l, rank, tied }, sorted by wins
 *     descending. Any group of teams with identical W-L shares the LOWEST
 *     rank in the group and is marked tied: true. Never broken by run
 *     differential, head-to-head, or name order (the law).
 */
export function poolFinishOrder(games) {
  const complete = games.length > 0 && games.every((g) => g.status === "final");
  const sorted = poolStandings(games);

  const standings = [];
  let rank = 1;
  let i = 0;
  while (i < sorted.length) {
    const { w, l } = sorted[i];
    let j = i;
    while (j < sorted.length && sorted[j].w === w && sorted[j].l === l) j++;
    const group = sorted.slice(i, j);
    const tied = group.length > 1;
    for (const t of group) standings.push({ team: t.name, w: t.w, l: t.l, rank, tied });
    rank += group.length;
    i = j;
  }
  return { standings, complete };
}

/**
 * parseSeedRef(ref) — pull the pool letter + rank out of a stored seed_ref
 * or team*_name placeholder. Returns null for anything that isn't a seed
 * placeholder (e.g. "Winner of Game 5" — those are never seeding's to
 * resolve; the bracket engine's own propagation handles them).
 */
export function parseSeedRef(ref) {
  if (!ref) return null;
  const m = SEED_REF_RE.exec(String(ref).trim());
  if (!m) return null;
  return { pool: m[1], rank: Number(m[2]) };
}

/**
 * resolveSeeds(poolsByLetter, overrides) — { "A #1": "New Era", ... }
 *
 * poolsByLetter: { [poolLetter]: poolFinishOrder(...) result }
 * overrides: { [poolLetter]: [teamName, ...] } — the director's chosen
 *   full finish order for a pool, supplied when a tied group needs a
 *   human call. Only applied when it names every team the computed
 *   standings has for that pool (a partial/garbled override is ignored
 *   in favor of the computed order, rather than silently mis-seeding).
 *
 * Guards (never invented, always reported by omission):
 *   - An incomplete pool contributes no seeds at all.
 *   - A pool not present in poolsByLetter contributes no seeds.
 *   - Only ranks 1..n (n = teams in that pool) get an entry — a seed ref
 *     naming a rank the pool doesn't have (e.g. "I #4" in a 3-team pool)
 *     is simply absent from the returned map. Callers check for that
 *     absence and report it; this function never fabricates a team.
 */
export function resolveSeeds(poolsByLetter, overrides = {}) {
  const seeds = {};
  for (const [letter, finish] of Object.entries(poolsByLetter ?? {})) {
    if (!finish?.complete) continue;

    let ordered = finish.standings;
    const override = overrides?.[letter];
    if (Array.isArray(override) && override.length > 0) {
      const byName = new Map(finish.standings.map((t) => [t.team, t]));
      const reordered = override.map((name) => byName.get(name)).filter(Boolean);
      // Only trust the override if it accounts for every team in the
      // pool — a partial or mistyped list falls back to the computed
      // order rather than silently dropping a team from seeding.
      if (reordered.length === finish.standings.length) ordered = reordered;
    }

    ordered.forEach((t, idx) => {
      seeds[`${letter} #${idx + 1}`] = t.team;
    });
  }
  return seeds;
}

/**
 * computeSeedWrites(bracketGames, seeds) — pure resolution step for
 * "apply": for every bracket game slot whose team1_seed_ref/
 * team2_seed_ref resolves in `seeds`, produce the write that game needs.
 * Slots with no seed_ref (Winner/Loser of Game N, left to bracket
 * propagation), or whose seed_ref resolves to nothing (pool incomplete or
 * rank doesn't exist), are reported as unresolved rather than touched.
 *
 * Returns { writes, unresolved }:
 *   - writes: [{ id, patch: { team1_name?, team2_name? } }] — only slots
 *     that actually change (skips a slot already holding the resolved
 *     team name, so re-running after a correction is a no-op there).
 *   - unresolved: [{ id, side: "team1"|"team2", seedRef, reason }] for
 *     seed refs that parsed but didn't resolve — "pool not complete" or
 *     "no such rank in pool".
 */
export function computeSeedWrites(bracketGames, seeds) {
  const writes = [];
  const unresolved = [];

  for (const g of bracketGames) {
    const patch = {};

    for (const side of ["team1", "team2"]) {
      const seedRef = g[`${side}_seed_ref`];
      if (!seedRef) continue; // not a seeding slot at all — leave entirely alone

      const parsed = parseSeedRef(seedRef);
      if (!parsed) continue; // malformed/unexpected — leave alone, not seeding's problem

      const key = `${parsed.pool} #${parsed.rank}`;
      const team = seeds[key];
      if (!team) {
        unresolved.push({ id: g.id, side, seedRef, reason: "not yet resolvable" });
        continue;
      }
      if (g[`${side}_name`] !== team) patch[`${side}_name`] = team;
    }

    if (Object.keys(patch).length > 0) writes.push({ id: g.id, patch });
  }

  return { writes, unresolved };
}

/**
 * computeRemap(bracketGames, gameId, slot, seedRef) — pure swap logic for
 * "remap a slot" (dispatch-brief-23): which seed feeds a slot, never which
 * team name is written. A given seed ref may feed only ONE slot across the
 * whole set passed in, so pointing it at a new slot has to un-point it from
 * wherever it used to be — a true swap, never a duplicate.
 *
 * gameId/slot identify the TARGET slot. seedRef is the new value to put
 * there, or null to clear it. Returns the list of writes needed to keep the
 * invariant true:
 *   - always includes the target slot's write, first.
 *   - if seedRef (non-null) was already sitting on a DIFFERENT slot, that
 *     other slot is added as a second write, receiving whatever seedRef the
 *     target slot held before this call (its old value, possibly null —
 *     that's still a swap, just one side of it was empty).
 *
 * Returns null when gameId/slot doesn't identify a real slot in
 * bracketGames (bad request — the caller should 400, never guess).
 *
 * Pure function, no I/O — the route applies these writes with an UPDATE on
 * games.<slot>_seed_ref and nothing else.
 */
export function computeRemap(bracketGames, gameId, slot, seedRef) {
  if (slot !== "team1" && slot !== "team2") return null;
  const target = bracketGames.find((g) => g.id === gameId);
  if (!target) return null;

  const normalizedSeedRef = seedRef ?? null;
  const currentOnTarget = target[`${slot}_seed_ref`] ?? null;
  const writes = [{ id: gameId, slot, seedRef: normalizedSeedRef }];

  if (normalizedSeedRef !== null) {
    for (const g of bracketGames) {
      for (const otherSlot of ["team1", "team2"]) {
        if (g.id === gameId && otherSlot === slot) continue; // that's the target itself
        if ((g[`${otherSlot}_seed_ref`] ?? null) === normalizedSeedRef) {
          // Found the one other slot holding this seed ref — a seed ref
          // is only ever on one slot, so there can be at most one.
          writes.push({ id: g.id, slot: otherSlot, seedRef: currentOnTarget });
          return writes;
        }
      }
    }
  }

  return writes;
}
