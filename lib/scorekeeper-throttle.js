import { getServiceClient } from "@/lib/supabase";

// Brute-force protection for the scorekeeper PIN (Catmull, 2026-07-21).
// Backed by a Postgres table + a `for update`-locking function so the
// counters are correct under concurrent/parallel requests across Vercel's
// auto-scaled instances — plain in-memory counters would reset per
// instance and do nothing against parallel guessing.
//
// Two scopes are checked: a per-IP scope (stops one source hammering the
// endpoint) and a "global" scope (stops a distributed attack spread across
// many IPs — there's one shared PIN, not per-user accounts, so an
// account-wide backstop is the correct second layer).

const GLOBAL_SCOPE = "global";

export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function scopesFor(request) {
  return [`ip:${getClientIp(request)}`, GLOBAL_SCOPE];
}

/**
 * Call before doing the (relatively expensive, ~0.35s) bcrypt compare.
 * Returns the first lockout found across the per-IP and global scopes, or
 * null if neither is currently locked.
 */
export async function checkLocked(request) {
  const supabase = getServiceClient();
  for (const scope of scopesFor(request)) {
    const { data, error } = await supabase.rpc("is_scorekeeper_locked", { p_scope: scope });
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (row?.is_locked) return row;
  }
  return null;
}

/**
 * Call after verifying the PIN, with the real result. Records the attempt
 * for both scopes and returns the most restrictive lockout that resulted
 * (if this attempt just tripped one) so the caller can report a 429 with
 * an accurate retry-after even on the attempt that crossed the threshold.
 */
export async function recordAttempt(request, success) {
  const supabase = getServiceClient();
  let mostRestrictive = null;
  for (const scope of scopesFor(request)) {
    const { data, error } = await supabase.rpc("check_and_record_scorekeeper_attempt", {
      p_scope: scope,
      p_success: success,
    });
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (row?.is_locked && (!mostRestrictive || row.retry_after_seconds > mostRestrictive.retry_after_seconds)) {
      mostRestrictive = row;
    }
  }
  return mostRestrictive;
}
