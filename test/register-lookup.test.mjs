import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ownedTeamIds,
  withLinkedEntries,
  emailsMatch,
  normalizeEmail,
  recoveryTeamPayload,
  timingSafeEqualString,
} from "../lib/register-lookup.js";

// Prod shapes, 2026-11-10 (ids shortened). Brayden Brooks registered Fallen
// in Coed D and Men's D at Do It for the T-Shirts with his email. The AFA
// World Series entries were loaded by the director with no manager or
// email, on the same two team rows. "Tbd" sheet stubs share the name only.
const teams = [
  { id: "coed-d", manager_name: "Brayden Brooks", merged_into_id: null },
  { id: "mens-d", manager_name: "Brayden", merged_into_id: null },
  { id: "tbd-mens-e", manager_name: "Tbd", merged_into_id: null },
  { id: "old-coed-d", manager_name: "Brayden Brooks", merged_into_id: "coed-d" },
];
const tshirtCoedD = { id: "r-ts-cd", team_id: "coed-d", submitted_at: "2026-09-01" };
const tshirtMensD = { id: "r-ts-md", team_id: "mens-d", submitted_at: "2026-09-02" };
const worldsCoedD = { id: "r-ws-cd", team_id: "coed-d", submitted_at: "2026-10-20" };
const worldsMensD = { id: "r-ws-md", team_id: "mens-d", submitted_at: "2026-10-21" };

test("an email match owns its team rows (merged rows resolve to the survivor)", () => {
  assert.deepEqual(ownedTeamIds([tshirtCoedD, tshirtMensD], teams).sort(), ["coed-d", "mens-d"]);
  assert.deepEqual(ownedTeamIds([{ id: "x", team_id: "old-coed-d" }], teams), ["coed-d"]);
});

test("a placeholder (Tbd) team or a missing team row links nothing", () => {
  assert.deepEqual(ownedTeamIds([{ id: "x", team_id: "tbd-mens-e" }], teams), []);
  assert.deepEqual(ownedTeamIds([{ id: "x", team_id: null }, { id: "y", team_id: "gone" }], teams), []);
});

test("Fallen: the T-Shirts matches bring back the Worlds entries on the same teams, once each", () => {
  const rows = withLinkedEntries(
    [tshirtMensD, tshirtCoedD],
    [worldsMensD, worldsCoedD, tshirtCoedD] // the linked query also returns the direct rows
  );
  assert.deepEqual(rows.map((r) => r.id), ["r-ts-md", "r-ts-cd", "r-ws-md", "r-ws-cd"]);
});

test("the lookup route follows team rows only after an exact email match", () => {
  const src = readFileSync(new URL("../app/api/register/lookup/route.js", import.meta.url), "utf8");
  assert.match(src, /\.ilike\("manager_email", email\)/);
  assert.match(src, /emailsMatch\(r\.manager_email, email\)/);
  assert.match(src, /ownedTeamIds\(rows, teams\)/);
  assert.match(src, /\.in\("team_id", ids\)/);
  assert.match(src, /withLinkedEntries\(rows, linked\)/);
  assert.match(src, /manager_name, submitted_at, team_id/);
  assert.match(src, /recoveryTeamPayload\(/);
});

test("the lookup route has no name-search branch", () => {
  const src = readFileSync(new URL("../app/api/register/lookup/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bbyName\b/);
  assert.doesNotMatch(src, /body\?\.name/);
  assert.doesNotMatch(src, /tournamentSlug/);
  assert.doesNotMatch(src, /register name lookup failed/);
  assert.match(src, /Enter the manager email from registration/);
});

test("a name query is not a recovery credential: only recoveryTeamPayload includes tokens", () => {
  const payload = recoveryTeamPayload(
    {
      team_name: "Example Club",
      status: "submitted",
      tournaments: { name: "Example Event", slug: "example-event" },
      submitted_at: "2026-11-01",
      manage_token: "manage-token-example",
      roster_token: "roster-token-example",
      divisions: { id: "div-1" },
      manager_name: "Example Manager",
    },
    "https://example.test"
  );
  assert.equal(payload.manageToken, "manage-token-example");
  assert.equal(payload.rosterToken, "roster-token-example");
  assert.equal(payload.manageLink, "https://example.test/register/manage/manage-token-example");
  assert.equal(payload.rosterLink, "https://example.test/register/roster/roster-token-example");
  // The route only calls recoveryTeamPayload after an email match. A name
  // query never reaches it (see the source test above) and so never gets tokens.
});

test("emailsMatch is case-insensitive and timing-safe; wildcards do not widen it", () => {
  assert.equal(emailsMatch("Pat@Example.com", "pat@example.com"), true);
  assert.equal(emailsMatch("pat@example.com", "pat@example.com"), true);
  assert.equal(emailsMatch("pat@example.com", "other@example.com"), false);
  assert.equal(emailsMatch("pat@example.com", "pat@example.org"), false);
  assert.equal(normalizeEmail("  Pat@Example.com  "), "pat@example.com");
  assert.equal(timingSafeEqualString("abc", "abc"), true);
  assert.equal(timingSafeEqualString("abc", "abd"), false);
});
