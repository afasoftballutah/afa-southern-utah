import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstForwardedIp,
  clientIpFromHeaders,
  clientPlaceFromHeaders,
  clientUserAgentFromHeaders,
  compactPlace,
  signAuditFromRequest,
  formatSignRecord,
  formatSignAuditTitle,
  signViaLabel,
  SIGN_VIA,
  rosterSignPatch,
  isMissingAuditSchema,
} from "@/lib/sign-audit";

function headers(map) {
  return {
    get(name) {
      const key = Object.keys(map).find(
        (k) => k.toLowerCase() === String(name).toLowerCase()
      );
      return key ? map[key] : null;
    },
  };
}

test("first forwarded IP is the client, not a later hop", () => {
  assert.equal(firstForwardedIp("203.0.113.10, 10.0.0.1"), "203.0.113.10");
  assert.equal(firstForwardedIp("unknown"), null);
  assert.equal(firstForwardedIp(""), null);
  assert.equal(firstForwardedIp(null), null);
});

test("IP comes from forwarded-for, then Vercel, then real-ip", () => {
  assert.equal(
    clientIpFromHeaders(headers({ "x-forwarded-for": "198.51.100.2" })),
    "198.51.100.2"
  );
  assert.equal(
    clientIpFromHeaders(
      headers({ "x-vercel-forwarded-for": "198.51.100.3" })
    ),
    "198.51.100.3"
  );
  assert.equal(
    clientIpFromHeaders(headers({ "x-real-ip": "198.51.100.4" })),
    "198.51.100.4"
  );
});

test("place is city, region, country — never lat/long", () => {
  const place = clientPlaceFromHeaders(
    headers({
      "x-vercel-ip-city": "St.%20George",
      "x-vercel-ip-country-region": "UT",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-latitude": "37.1",
      "x-vercel-ip-longitude": "-113.5",
    })
  );
  assert.equal(place, "St. George, UT, US");
  assert.equal(compactPlace(place), "St. George, UT");
});

test("user-agent is truncated", () => {
  const long = "x".repeat(500);
  assert.equal(clientUserAgentFromHeaders(headers({ "user-agent": long })).length, 400);
});

test("signAuditFromRequest packs via + headers", () => {
  const audit = signAuditFromRequest(
    {
      headers: headers({
        "x-forwarded-for": "198.51.100.9",
        "x-vercel-ip-city": "Hurricane",
        "x-vercel-ip-country-region": "UT",
        "x-vercel-ip-country": "US",
        "user-agent": "Mozilla/5.0 Test",
      }),
    },
    SIGN_VIA.DIRECTOR
  );
  assert.equal(audit.signed_ip, "198.51.100.9");
  assert.equal(audit.signed_place, "Hurricane, UT, US");
  assert.equal(audit.signed_user_agent, "Mozilla/5.0 Test");
  assert.equal(audit.signed_via, "director");
});

test("a signed record reads in league time", () => {
  // 2026-08-10 19:14 MDT = 2026-08-11T01:14:00Z
  assert.equal(
    formatSignRecord({
      signedAt: "2026-08-11T01:14:00.000Z",
      signedPlace: "St. George, UT, US",
    }),
    "Aug 10, 7:14p · St. George, UT"
  );
  assert.match(
    formatSignAuditTitle({
      signedAt: "2026-08-11T01:14:00.000Z",
      signedPlace: "St. George, UT, US",
      signedVia: "sign-link",
      signedIp: "198.51.100.9",
    }),
    /Signed Aug 10, 2026, 7:14 PM MT · St\. George, UT · via signing link · 198\.51\.100\.9/
  );
});

test("via labels stay short", () => {
  assert.equal(signViaLabel("director"), "director desk");
  assert.equal(signViaLabel("register"), "team registration");
  assert.equal(signViaLabel("sign-link"), "signing link");
});

test("roster patch always writes the four audit columns", () => {
  const patch = rosterSignPatch({
    signaturePng: "data:image/png;base64,xx",
    signedAt: "2026-08-11T01:14:00.000Z",
    audit: { signed_ip: "1.1.1.1", signed_via: "sign-link" },
  });
  assert.equal(patch.signed_ip, "1.1.1.1");
  assert.equal(patch.signed_place, null);
  assert.equal(patch.signed_user_agent, null);
  assert.equal(patch.signed_via, "sign-link");
});

test("missing-column / missing-table errors are recognized", () => {
  assert.equal(isMissingAuditSchema({ code: "PGRST204" }), true);
  assert.equal(isMissingAuditSchema({ code: "42P01" }), true);
  assert.equal(
    isMissingAuditSchema({ message: "column signed_ip does not exist" }),
    true
  );
  assert.equal(isMissingAuditSchema({ message: "permission denied" }), false);
});
