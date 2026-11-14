/**
 * Fixed-window per-IP limiter for public forms (lookup, registration,
 * address typeahead). Prefers the Postgres function
 * check_and_record_public_rate_limit() so counters hold across Vercel
 * instances. If the DB call fails, log and fall back to an in-memory
 * cap on this instance — never fail the request because the limiter
 * is down.
 *
 * Scopes store a SHA-256 of the IP, never the raw address.
 */

import crypto from "node:crypto";

/** The caller's address as Vercel reports it. */
export function clientIp(request) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/** Hex SHA-256 of an IP (or other identifier). */
export function hashIp(ip) {
  return crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex");
}

/** Per-route scope written to public_rate_limit.scope — no raw IP. */
export function rateLimitScope(route, request) {
  return `${route}:${hashIp(clientIp(request))}`;
}

const memoryLimiters = new Map();

export function createIpRateLimiter(limit, windowMs, now = Date.now) {
  const windows = new Map();
  return {
    limited(request) {
      // Key by hash so the in-memory map also never holds a raw IP.
      const key = hashIp(clientIp(request));
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
        if (windows.size > 5000) {
          for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
        }
      }
      w.count += 1;
      if (w.count > limit) {
        return {
          limited: true,
          retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)),
        };
      }
      return { limited: false, retryAfterSec: 0 };
    },
  };
}

function memoryFallback(route, request, limit, windowSeconds) {
  const id = `${route}:${limit}:${windowSeconds}`;
  let limiter = memoryLimiters.get(id);
  if (!limiter) {
    limiter = createIpRateLimiter(limit, windowSeconds * 1000);
    memoryLimiters.set(id, limiter);
  }
  return limiter.limited(request);
}

/**
 * Record one hit and report whether this scope is over the cap.
 * `rpc` is injectable for tests; production calls the Postgres function
 * through the service-role client.
 */
export async function checkPublicRateLimit({
  route,
  request,
  limit,
  windowSeconds,
  rpc,
}) {
  const scope = rateLimitScope(route, request);
  const call =
    rpc ||
    (async (s, lim, win) => {
      const { getServiceClient } = await import("@/lib/supabase");
      const supabase = getServiceClient();
      const { data, error } = await supabase.rpc(
        "check_and_record_public_rate_limit",
        { p_scope: s, p_limit: lim, p_window_seconds: win }
      );
      if (error) throw new Error(error.message || "rate limit rpc failed");
      return Array.isArray(data) ? data[0] : data;
    });

  try {
    const row = await call(scope, limit, windowSeconds);
    if (row?.is_limited) {
      return {
        limited: true,
        retryAfterSec: Math.max(1, Number(row.retry_after_seconds) || 1),
        source: "db",
      };
    }
    return { limited: false, retryAfterSec: 0, source: "db" };
  } catch (err) {
    console.error("public rate limit check failed; falling back to memory", err);
    return { ...memoryFallback(route, request, limit, windowSeconds), source: "memory" };
  }
}

export function tooManyRequests(retryAfterSec, message = "Too many tries. Wait a few minutes and try again.") {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
