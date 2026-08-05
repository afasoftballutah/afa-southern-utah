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

// League PCT format (dispatch-brief-25): three decimals, no leading zero —
// "1.000", ".500", ".000" — matching the league's own printable
// (quickscores.com PrintSchedule). A pool with zero games played for a
// team (shouldn't happen — every team here comes from a game row — but
// guarded anyway) reads as ".000" rather than dividing by zero.
function formatPct(wins, gamesPlayed) {
  if (gamesPlayed <= 0) return ".000";
  const str = (wins / gamesPlayed).toFixed(3);
  return str.startsWith("0.") ? str.slice(1) : str;
}

/**
 * poolStandings(games) — win/loss record per team in one pool, plus the
 * league's own printable columns (dispatch-brief-25): `pct`, `rf` (runs
 * for), and `ra` (runs against — total runs the OPPONENT scored across
 * that team's FINAL games; lower is better, and it's the column this
 * league uses to break ties by eye). Added fields only — every existing
 * caller keeps reading `.name`/`.w`/`.l` unchanged.
 *
 * This is the EXACT logic lifted from app/tournaments/[slug]/division/
 * [divisionId]/page.js's poolStandings (dispatch-brief-22 instruction: do
 * not invent a second version that could disagree with what the public
 * page shows). The name-order tiebreak in the final sort is display
 * ordering only — poolFinishOrder below re-groups by identical W-L
 * regardless of this array's order, so that tiebreak never decides a
 * seed. RA/PCT are NEVER part of that sort — the law (afa-spec.md) is
 * that genuine ties stay tied and are flagged for the director, never
 * auto-broken by run differential.
 */
export function poolStandings(games) {
  const teams = new Map();
  for (const g of games) {
    if (!teams.has(g.team1_name)) teams.set(g.team1_name, { name: g.team1_name, w: 0, l: 0, rf: 0, ra: 0 });
    if (!teams.has(g.team2_name)) teams.set(g.team2_name, { name: g.team2_name, w: 0, l: 0, rf: 0, ra: 0 });
    if (g.status !== "final") continue;
    const team1Won = g.team1_score > g.team2_score;
    const t1 = teams.get(g.team1_name);
    const t2 = teams.get(g.team2_name);
    t1[team1Won ? "w" : "l"] += 1;
    t2[team1Won ? "l" : "w"] += 1;
    t1.rf += g.team1_score;
    t1.ra += g.team2_score;
    t2.rf += g.team2_score;
    t2.ra += g.team1_score;
  }
  return [...teams.values()]
    .map((t) => ({ ...t, pct: formatPct(t.w, t.w + t.l) }))
    // Wins, then RA (runs against) ASCENDING — fewer runs allowed ranks
    // higher. RULED by JD 2026-07-25 and it SUPERSEDES the earlier "the
    // director always breaks ties" law: this is the league's own practice,
    // their printable standings order exactly this way. Name last, purely
    // so the order is deterministic.
    .sort((a, b) => b.w - a.w || a.ra - b.ra || a.name.localeCompare(b.name));
}

/**
 * poolFinishOrder(games) — one pool's finish order for seeding.
 *
 * Returns { standings, complete }.
 *   - complete: every game in the pool is final. An empty pool (no games)
 *     is not complete — there's nothing to finish.
 *   - standings: an array of { team, w, l, pct, ra, rf, rank, tied },
 *     sorted by wins descending. Any group of teams with identical W-L
 *     shares the LOWEST rank in the group and is marked tied: true. Never
 *     broken by run differential, head-to-head, or name order (the law)
 *     — pct/ra/rf ride along for display only, never as sort/grouping
 *     keys.
 */
export function poolFinishOrder(games) {
  const complete = games.length > 0 && games.every((g) => g.status === "final");
  const sorted = poolStandings(games);

  const standings = [];
  let rank = 1;
  let i = 0;
  while (i < sorted.length) {
    // A team is only TIED when the league's own rule cannot separate it —
    // same W-L AND same RA. Two teams at 1-1 with different RA are now
    // decided, not tied, and get distinct ranks (JD, 2026-07-25).
    const { w, l, ra } = sorted[i];
    let j = i;
    while (j < sorted.length && sorted[j].w === w && sorted[j].l === l && sorted[j].ra === ra) j++;
    const group = sorted.slice(i, j);
    const tied = group.length > 1;
    for (const t of group)
      standings.push({ team: t.name, w: t.w, l: t.l, pct: t.pct, ra: t.ra, rf: t.rf, rank, tied });
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
 * seedOrderFromPools(poolGames, overrides) — flat team list for generateBracket.
 *
 * When every pool is final, ranks are turned into overall seed order:
 *   rank 1 across pools (A #1, B #1, …), then rank 2, etc.
 * Single-pool weekends: finish order is seed #1…#N.
 * Incomplete / empty → { complete: false, order: [], reason }.
 */
export function seedOrderFromPools(poolGames, overrides = {}) {
  const byPool = {};
  for (const g of poolGames ?? []) {
    const letter = g.pool;
    if (!letter) continue;
    (byPool[letter] ??= []).push(g);
  }
  const letters = Object.keys(byPool).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  if (letters.length === 0) {
    return { complete: false, order: [], reason: "No pool games" };
  }

  const poolsByLetter = {};
  for (const letter of letters) {
    const finish = poolFinishOrder(byPool[letter]);
    if (!finish.complete) {
      return {
        complete: false,
        order: [],
        reason: `Pool ${letter} is not finished`,
      };
    }
    poolsByLetter[letter] = finish;
  }

  const seeds = resolveSeeds(poolsByLetter, overrides);
  const maxRank = Math.max(
    ...letters.map((l) => poolsByLetter[l].standings.length),
    0
  );
  const order = [];
  const seen = new Set();
  for (let rank = 1; rank <= maxRank; rank++) {
    for (const letter of letters) {
      const name = seeds[`${letter} #${rank}`];
      if (!name || seen.has(name)) continue;
      order.push(name);
      seen.add(name);
    }
  }
  if (order.length < 2) {
    return {
      complete: false,
      order: [],
      reason: "Need at least 2 teams from finished pools",
    };
  }
  return { complete: true, order, reason: null };
}

/**
 * Round-robin pairings for one pool (every team plays every other once).
 * @returns {[string, string][]}
 */
export function roundRobinPairs(teamNames) {
  const teams = [...new Set((teamNames ?? []).map((n) => String(n).trim()).filter(Boolean))];
  const pairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push([teams[i], teams[j]]);
    }
  }
  return pairs;
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
