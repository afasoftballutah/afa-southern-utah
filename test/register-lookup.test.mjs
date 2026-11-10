import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ownedTeamIds, withLinkedEntries } from "../lib/register-lookup.js";

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
  const byEmail = src.slice(src.indexOf("if (byEmail)"), src.indexOf("} else {"));
  assert.match(byEmail, /\.ilike\("manager_email", email\)/);
  assert.match(byEmail, /ownedTeamIds\(rows, teams\)/);
  assert.match(byEmail, /\.in\("team_id", ids\)/);
  assert.match(byEmail, /withLinkedEntries\(rows, linked\)/);
  assert.match(src, /manager_name, submitted_at, team_id/);
});
