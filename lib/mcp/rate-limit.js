/**
 * Fixed-window rate limiter, in memory (same as the Corporation league's
 * src/lib/mcp/rateLimit.ts). Per warm serverless instance, not a global cap:
 * enough to stop a runaway assistant loop.
 */
export function createRateLimiter(limit = 60, windowMs = 60_000, now = Date.now) {
  const windows = new Map();
  return {
    hit(key) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
        if (windows.size > 5000) for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
      }
      w.count++;
      if (w.count > limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

/** The caller's address as Vercel reports it, for the limiter key. */
export function clientKey(request) {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : request.headers.get("x-real-ip")) || "unknown";
}
