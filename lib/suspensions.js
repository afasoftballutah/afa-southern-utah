/**
 * Player suspensions — director-entered, mid-tournament capable.
 *
 * Active when not lifted, and:
 *  - tournament_id set  → only for that tournament
 *  - starts_on / ends_on → asOf date must fall in inclusive range
 *  - both set           → tournament match AND date range
 *  - neither set        → open until lifted
 *
 * Suspended people stay on the roster, may still sign waivers, but are
 * excluded from class / min men-women counting.
 *
 * Pure helpers only (no Next/server imports) so client UI can share them.
 * Callers should pass `asOf` from leagueToday() on the server.
 */

/** @param {string|null|undefined} iso */
function day(iso) {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** YYYY-MM-DD fallback when asOf omitted (UTC — prefer leagueToday on server). */
function todayFallback() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {{
 *   lifted_at?: string|null,
 *   tournament_id?: string|null,
 *   starts_on?: string|null,
 *   ends_on?: string|null,
 * }} suspension
 * @param {{ tournamentId?: string|null, asOf?: string|null }} ctx
 */
export function isSuspensionActive(suspension, ctx = {}) {
  if (!suspension || suspension.lifted_at) return false;

  const asOf = day(ctx.asOf) || todayFallback();
  const starts = day(suspension.starts_on);
  const ends = day(suspension.ends_on);
  const tourId = suspension.tournament_id || null;
  const ctxTour = ctx.tournamentId || null;

  if (tourId) {
    if (!ctxTour || tourId !== ctxTour) return false;
  }

  if (starts && asOf < starts) return false;
  if (ends && asOf > ends) return false;

  return true;
}

/**
 * First active suspension for a player in context, or null.
 * @param {Array} suspensions
 * @param {string|null|undefined} playerId
 * @param {{ tournamentId?: string|null, asOf?: string|null }} ctx
 */
export function activeSuspensionFor(suspensions, playerId, ctx = {}) {
  if (!playerId) return null;
  for (const s of suspensions ?? []) {
    if (s.player_id !== playerId) continue;
    if (isSuspensionActive(s, ctx)) return s;
  }
  return null;
}

/**
 * Map player_id → active suspension for a tournament context.
 * @param {Array} suspensions
 * @param {{ tournamentId?: string|null, asOf?: string|null }} ctx
 */
export function activeSuspensionMap(suspensions, ctx = {}) {
  const map = new Map();
  for (const s of suspensions ?? []) {
    if (!s.player_id || map.has(s.player_id)) continue;
    if (isSuspensionActive(s, ctx)) map.set(s.player_id, s);
  }
  return map;
}

/**
 * Split a roster into counting vs suspended for eligibility math.
 * Members need playerId (or player_id) to match suspensions.
 *
 * @param {Array<{ playerId?: string|null, player_id?: string|null }>} roster
 * @param {Map<string, object>} suspensionByPlayer
 */
export function partitionRosterBySuspension(roster, suspensionByPlayer) {
  const counting = [];
  const suspended = [];
  for (const m of roster ?? []) {
    const pid = m.playerId ?? m.player_id ?? null;
    const s = pid ? suspensionByPlayer.get(pid) : null;
    if (s) suspended.push({ ...m, suspension: s });
    else counting.push(m);
  }
  return { counting, suspended };
}

/** Short label for UI chips. */
export function suspensionScopeLabel(s, tournamentNameById = null) {
  if (!s) return "";
  const parts = [];
  if (s.tournament_id) {
    const name =
      (tournamentNameById && tournamentNameById.get?.(s.tournament_id)) ||
      s.tournament_name ||
      "this tournament";
    parts.push(name);
  }
  const starts = day(s.starts_on);
  const ends = day(s.ends_on);
  if (starts && ends) parts.push(`${starts} → ${ends}`);
  else if (starts) parts.push(`from ${starts}`);
  else if (ends) parts.push(`through ${ends}`);
  if (parts.length === 0) parts.push("until lifted");
  return parts.join(" · ");
}

/**
 * Load non-lifted + recent lifted suspensions for the given player ids.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} playerIds
 */
export async function loadSuspensionsForPlayers(supabase, playerIds) {
  const ids = [...new Set((playerIds ?? []).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("player_suspensions")
    .select(
      "id, player_id, tournament_id, starts_on, ends_on, note, lifted_at, created_at, updated_at"
    )
    .in("player_id", ids)
    .order("created_at", { ascending: false });
  if (error) {
    // Table may not exist yet on a stale deploy
    if (
      error.code === "42P01" ||
      error.message?.includes("player_suspensions")
    ) {
      return [];
    }
    console.error("loadSuspensionsForPlayers", error);
    return [];
  }
  return data ?? [];
}

/**
 * All open (not lifted) suspensions — for the players directory.
 */
export async function listOpenSuspensions(supabase) {
  const { data, error } = await supabase
    .from("player_suspensions")
    .select(
      "id, player_id, tournament_id, starts_on, ends_on, note, lifted_at, created_at"
    )
    .is("lifted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (
      error.code === "42P01" ||
      error.message?.includes("player_suspensions")
    ) {
      return [];
    }
    console.error("listOpenSuspensions", error);
    return [];
  }
  return data ?? [];
}

/**
 * Load suspensions for umpires (open + history for those ids).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} umpireIds
 */
export async function loadSuspensionsForUmpires(supabase, umpireIds) {
  const ids = [...new Set((umpireIds ?? []).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("umpire_suspensions")
    .select(
      "id, umpire_id, tournament_id, starts_on, ends_on, note, lifted_at, created_at, updated_at"
    )
    .in("umpire_id", ids)
    .order("created_at", { ascending: false });
  if (error) {
    if (
      error.code === "42P01" ||
      error.message?.includes("umpire_suspensions")
    ) {
      return [];
    }
    console.error("loadSuspensionsForUmpires", error);
    return [];
  }
  return data ?? [];
}

/** Open (not lifted) umpire suspensions. */
export async function listOpenUmpireSuspensions(supabase) {
  const { data, error } = await supabase
    .from("umpire_suspensions")
    .select(
      "id, umpire_id, tournament_id, starts_on, ends_on, note, lifted_at, created_at"
    )
    .is("lifted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (
      error.code === "42P01" ||
      error.message?.includes("umpire_suspensions")
    ) {
      return [];
    }
    console.error("listOpenUmpireSuspensions", error);
    return [];
  }
  return data ?? [];
}

/**
 * Map umpire_id → active suspension for a tournament context.
 * @param {Array} suspensions
 * @param {{ tournamentId?: string|null, asOf?: string|null }} ctx
 */
export function activeUmpireSuspensionMap(suspensions, ctx = {}) {
  const map = new Map();
  for (const s of suspensions ?? []) {
    if (!s.umpire_id || map.has(s.umpire_id)) continue;
    if (isSuspensionActive(s, ctx)) map.set(s.umpire_id, s);
  }
  return map;
}

/**
 * First active suspension for an umpire, or null.
 */
export function activeUmpireSuspensionFor(suspensions, umpireId, ctx = {}) {
  if (!umpireId) return null;
  for (const s of suspensions ?? []) {
    if (s.umpire_id !== umpireId) continue;
    if (isSuspensionActive(s, ctx)) return s;
  }
  return null;
}
