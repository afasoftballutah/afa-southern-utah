import { test, skip } from "node:test";
import assert from "node:assert/strict";

// Does every page still render? Runs against a server if one is up
// (BASE, default localhost:3210) and skips politely if not, so `npm test`
// is always safe to run without a build.
const BASE = process.env.BASE ?? "http://localhost:3210";
const up = await fetch(BASE, { signal: AbortSignal.timeout(2500) }).then(
  (r) => r.ok,
  () => false
);

const SLUG = "2026-coed-heat-stroker";
const COED = "61b465ee-e0b9-489c-aeeb-274fa11f8a34";
const GOLD = "00e80340-8db4-4149-bb8f-c77cb1e6e425";

const ROUTES = [
  ["home", "/"],
  ["tournaments", "/tournaments"],
  ["tournament", `/tournaments/${SLUG}`],
  ["schedule", `/tournaments/${SLUG}/schedule`],
  ["division (pools)", `/tournaments/${SLUG}/division/${COED}`],
  ["division (bracket)", `/tournaments/${SLUG}/division/${GOLD}`],
  ["rules", "/rules"],
  ["register", "/register"],
  ["team calendar", `/tournaments/${SLUG}/games.ics?team=Backwards%20K`],
  ["tournament calendar", `/tournaments/${SLUG}/calendar.ics`],
];

for (const [name, path] of ROUTES) {
  test(`${name} renders`, { skip: up ? false : "no server at " + BASE }, async () => {
    const res = await fetch(BASE + path);
    assert.equal(res.status, 200, `${path} should be 200`);
    const body = await res.text();
    if (path.endsWith(".ics") || path.includes(".ics?")) {
      // A one-event all-day calendar is legitimately ~330 bytes; only HTML
      // gets the "empty shell" size check.
      assert.match(body, /^BEGIN:VCALENDAR/);
    } else {
      // Next renders a digest into the HTML when a server component throws.
      assert.ok(!/"digest":"\d+"/.test(body), `${path} threw a server error`);
      assert.ok(body.length > 500, `${path} returned an empty shell`);
    }
  });
}

test("the calendar feed is subscribable, not a download", { skip: up ? false : "no server" }, async () => {
  const res = await fetch(`${BASE}/tournaments/${SLUG}/games.ics?team=Backwards%20K`);
  assert.match(res.headers.get("content-type") ?? "", /text\/calendar/);
  assert.match(res.headers.get("content-disposition") ?? "", /^inline/);
  const body = await res.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  // Every line must fit RFC 5545's octet limit — the scores carry an en dash.
  const long = body.split("\r\n").filter((l) => Buffer.byteLength(l) > 75);
  assert.deepEqual(long, [], "no line may exceed 75 octets");
});

test("the results sync refuses an unauthenticated caller", { skip: up ? false : "no server" }, async () => {
  assert.equal((await fetch(`${BASE}/api/sync/quickscores`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/scorekeeper/sync`, { method: "POST" })).status, 401);
});
