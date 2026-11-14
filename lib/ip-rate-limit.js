/**
 * Fixed-window per-IP limiter, in memory. Per warm serverless instance —
 * not a global cap. A Postgres-backed version lives in
 * supabase/not-applied/2026-11-14-public-rate-limit.sql and must not be
 * applied without J.D.'s OK.
 *
 * The scorekeeper PIN throttle (lib/scorekeeper-throttle.js) is not reused
 * here: that table and function are fail/success lockouts for one shared
 * PIN, not a request cap, and a successful hit would reset the counter.
 */

/** The caller's address as Vercel reports it. */
export function clientIp(request) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function createIpRateLimiter(limit, windowMs, now = Date.now) {
  const windows = new Map();
  return {
    limited(request) {
      const key = clientIp(request);
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

export function tooManyRequests(retryAfterSec, message = "Too many tries. Wait a few minutes and try again.") {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
