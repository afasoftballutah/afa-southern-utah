import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clientIp,
  hashIp,
  rateLimitScope,
  checkPublicRateLimit,
  createIpRateLimiter,
} from "../lib/ip-rate-limit.js";

function request(ip = "203.0.113.9") {
  return {
    headers: {
      get(name) {
        if (name === "x-forwarded-for") return ip;
        return null;
      },
    },
  };
}

test("hashIp is a 64-char hex digest and does not contain the raw IP", () => {
  const ip = "203.0.113.9";
  const h = hashIp(ip);
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h.includes(ip), false);
  assert.equal(hashIp(ip), hashIp(ip));
  assert.notEqual(hashIp(ip), hashIp("203.0.113.10"));
});

test("rateLimitScope prefixes the route and never stores the raw IP", () => {
  const scope = rateLimitScope("lookup", request("198.51.100.4"));
  assert.equal(scope.startsWith("lookup:"), true);
  assert.equal(scope.includes("198.51.100.4"), false);
  assert.equal(scope, `lookup:${hashIp("198.51.100.4")}`);
});

test("checkPublicRateLimit uses the DB rpc when it succeeds", async () => {
  const calls = [];
  const rpc = async (scope, limit, windowSeconds) => {
    calls.push({ scope, limit, windowSeconds });
    return { is_limited: false, retry_after_seconds: 0 };
  };
  const hit = await checkPublicRateLimit({
    route: "lookup",
    request: request(),
    limit: 12,
    windowSeconds: 900,
    rpc,
  });
  assert.equal(hit.limited, false);
  assert.equal(hit.source, "db");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, rateLimitScope("lookup", request()));
  assert.equal(calls[0].limit, 12);
  assert.equal(calls[0].windowSeconds, 900);
});

test("checkPublicRateLimit returns 429 shape when the DB says limited", async () => {
  const hit = await checkPublicRateLimit({
    route: "register",
    request: request(),
    limit: 8,
    windowSeconds: 900,
    rpc: async () => ({ is_limited: true, retry_after_seconds: 42 }),
  });
  assert.equal(hit.limited, true);
  assert.equal(hit.retryAfterSec, 42);
  assert.equal(hit.source, "db");
});

test("checkPublicRateLimit falls back to memory (does not throw) if the DB errors", async () => {
  const req = request("192.0.2.8");
  const boom = async () => {
    throw new Error("connection refused");
  };
  const first = await checkPublicRateLimit({
    route: "lookup-fallback-test",
    request: req,
    limit: 2,
    windowSeconds: 60,
    rpc: boom,
  });
  assert.equal(first.limited, false);
  assert.equal(first.source, "memory");
  const second = await checkPublicRateLimit({
    route: "lookup-fallback-test",
    request: req,
    limit: 2,
    windowSeconds: 60,
    rpc: boom,
  });
  assert.equal(second.limited, false);
  const third = await checkPublicRateLimit({
    route: "lookup-fallback-test",
    request: req,
    limit: 2,
    windowSeconds: 60,
    rpc: boom,
  });
  assert.equal(third.limited, true);
  assert.equal(third.source, "memory");
  assert.ok(third.retryAfterSec >= 1);
});

test("in-memory limiter keys by hashed IP, not the raw address", () => {
  const limiter = createIpRateLimiter(1, 60_000);
  const src = readFileSync(new URL("../lib/ip-rate-limit.js", import.meta.url), "utf8");
  // The memory map must hash the IP before using it as a key.
  assert.match(src, /const key = hashIp\(clientIp\(request\)\)/);
  const a = limiter.limited(request("203.0.113.20"));
  const b = limiter.limited(request("203.0.113.20"));
  assert.equal(a.limited, false);
  assert.equal(b.limited, true);
});

test("the four public routes call checkPublicRateLimit, not a bare memory limiter", () => {
  const files = [
    "../app/api/register/lookup/route.js",
    "../app/api/register/route.js",
    "../app/api/address-suggest/route.js",
    "../app/api/address-details/route.js",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /checkPublicRateLimit/, f);
    assert.doesNotMatch(src, /createIpRateLimiter/, f);
    assert.doesNotMatch(src, /limiter\.limited/, f);
  }
});

test("clientIp uses the first x-forwarded-for hop", () => {
  const req = {
    headers: {
      get(name) {
        if (name === "x-forwarded-for") return "203.0.113.1, 10.0.0.1";
        return null;
      },
    },
  };
  assert.equal(clientIp(req), "203.0.113.1");
});
