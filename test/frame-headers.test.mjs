import test from "node:test";
import assert from "node:assert/strict";
import nextConfig, { SECURITY_HEADERS, TOKEN_PATH_HEADERS } from "../next.config.mjs";

// Anti-clickjacking: every route (pages, API, /api/mcp) says only our own
// origin may frame it.
test("every path sends frame-ancestors 'self' and X-Frame-Options SAMEORIGIN", async () => {
  const rules = await nextConfig.headers();
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all, "a rule for every path");
  const byKey = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  assert.equal(byKey["Content-Security-Policy"], "frame-ancestors 'self'");
  assert.equal(byKey["X-Frame-Options"], "SAMEORIGIN");
  assert.deepEqual(all.headers, SECURITY_HEADERS);
});

test("the CSP header only restricts framing (no script/style/connect policy that could break the site)", () => {
  const csp = SECURITY_HEADERS.find((h) => h.key === "Content-Security-Policy").value;
  assert.deepEqual(csp.split(";").map((d) => d.trim().split(/\s+/)[0]).filter(Boolean), ["frame-ancestors"]);
});

test("public images get a 30-day cache; versioned names are immutable; /_next is not covered", async () => {
  const rules = await nextConfig.headers();
  const pathStar = rules.filter((r) => r.source === "/:path*");
  assert.equal(pathStar.length, 1, "catch-all frame headers stay a single /:path* rule");
  assert.deepEqual(pathStar[0].headers, SECURITY_HEADERS);

  const cc = (r) => r.headers.find((h) => h.key === "Cache-Control")?.value ?? "";
  const immutable = rules.filter((r) => /immutable/.test(cc(r)));
  const long = rules.filter((r) => /max-age=2592000/.test(cc(r)));
  assert.ok(immutable.some((r) => r.source.startsWith("/:file") && r.source.includes("-v")), "root versioned images are immutable");
  assert.ok(long.some((r) => r.source.startsWith("/:file") && !r.source.includes("-v")), "other public images still get a long cache");
  assert.ok(long.some((r) => r.source.startsWith("/posters/:file")), "poster images are included");
  assert.ok(long.some((r) => r.source.startsWith("/guide/assets/:file")), "guide images are included");
  assert.ok(rules.every((r) => !r.source.includes("_next")), "no rule targets /_next");
  for (const r of long) {
    const byKey = Object.fromEntries(r.headers.map((h) => [h.key, h.value]));
    assert.equal(byKey["Content-Security-Policy"], "frame-ancestors 'self'");
    assert.equal(byKey["X-Frame-Options"], "SAMEORIGIN");
    assert.match(byKey["Cache-Control"], /^public, max-age=2592000/);
  }
  for (const r of immutable) {
    assert.equal(cc(r), "public, max-age=2592000, immutable");
  }
});

test("every path also sends nosniff, a referrer policy, and permissions policy", async () => {
  const rules = await nextConfig.headers();
  const all = rules.find((r) => r.source === "/:path*");
  const byKey = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  assert.equal(byKey["X-Content-Type-Options"], "nosniff");
  assert.equal(byKey["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(byKey["Permissions-Policy"], "camera=(), microphone=(), geolocation=()");
});

test("manage and roster token paths send Referrer-Policy no-referrer", async () => {
  const rules = await nextConfig.headers();
  const sources = [
    "/register/manage/:path*",
    "/register/roster/:path*",
    "/api/register/roster",
  ];
  for (const source of sources) {
    const rule = rules.find((r) => r.source === source);
    assert.ok(rule, source);
    assert.deepEqual(rule.headers, TOKEN_PATH_HEADERS);
    const byKey = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
    assert.equal(byKey["Referrer-Policy"], "no-referrer");
    assert.equal(byKey["X-Content-Type-Options"], "nosniff");
    assert.equal(byKey["Content-Security-Policy"], "frame-ancestors 'self'");
    assert.equal(byKey["X-Frame-Options"], "SAMEORIGIN");
  }
});

