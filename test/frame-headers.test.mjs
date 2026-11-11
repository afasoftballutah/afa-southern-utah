import test from "node:test";
import assert from "node:assert/strict";
import nextConfig, { SECURITY_HEADERS } from "../next.config.mjs";

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
