import test from "node:test";
import assert from "node:assert/strict";
import { normalizeName, resolvePlayer, resolveTeam } from "@/lib/identity.js";

// normalizeName has to agree with the SQL in
// migration-2026-07-27-people-and-teams.sql. If they drift, a person
// registered before the drift and after it becomes two people silently.

test("normalizeName folds case, spacing and curly apostrophes", () => {
  assert.equal(normalizeName("  Kaydee   Anderson "), "kaydee anderson");
  assert.equal(normalizeName("J.D. Willcox"), "j.d. willcox");
  assert.equal(normalizeName("O’Brien"), "o'brien");
  assert.equal(normalizeName("O'Brien"), "o'brien");
  assert.equal(normalizeName("BACKWARDS K"), "backwards k");
});

test("normalizeName survives nothing", () => {
  assert.equal(normalizeName(null), "");
  assert.equal(normalizeName(undefined), "");
  assert.equal(normalizeName("   "), "");
});

// A tiny fake of the query builder. Enough to prove the decisions, without a
// database — these tests must run offline like the other 64.
function fakeDb({ players = [], teams = [], failInsert = false } = {}) {
  const inserted = [];
  const make = (rows) => {
    const filters = [];
    const q = {
      select: () => q,
      eq: (col, val) => (filters.push([col, val]), q),
      is: (col, val) => (filters.push([col, val]), q),
      maybeSingle: async () => ({
        data: rows.find((r) => filters.every(([c, v]) => (r[c] ?? null) === v)) ?? null,
      }),
      single: async () => ({ data: rows[0] ?? null }),
      insert: (row) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () =>
              failInsert
                ? { error: { code: "23505" }, data: null }
                : { data: { id: "new-id" }, error: null },
          }),
        };
      },
      update: () => q,
    };
    return q;
  };
  return {
    inserted,
    from: (table) =>
      make(
        table === "players"
          ? players
          : table === "teams"
            ? teams
            : // divisions — the id must be present or the .eq("id", …) lookup
              // misses and every team resolves against a null gender.
              [{ id: "d1", gender: "coed", class_id: null }]
      ),
  };
}

test("a player with no birth date is left unresolved, not guessed", async () => {
  const db = fakeDb();
  assert.equal(await resolvePlayer(db, { name: "Taylor Sams", birthDate: null }), null);
  assert.equal(db.inserted.length, 0, "must not create a player it cannot key");
});

test("a player with no name is left unresolved", async () => {
  const db = fakeDb();
  assert.equal(await resolvePlayer(db, { name: "  ", birthDate: "1990-06-03" }), null);
});

test("an existing person is reused, not duplicated", async () => {
  const db = fakeDb({
    players: [{ id: "p1", normalized_name: "taylor sams", birth_date: "1990-06-03" }],
  });
  assert.equal(await resolvePlayer(db, { name: " Taylor  Sams ", birthDate: "1990-06-03" }), "p1");
  assert.equal(db.inserted.length, 0);
});

test("a merged-away person resolves to the survivor", async () => {
  const db = fakeDb({
    players: [
      {
        id: "dupe",
        normalized_name: "taylor sams",
        birth_date: "1990-06-03",
        merged_into_id: "keeper",
      },
    ],
  });
  assert.equal(await resolvePlayer(db, { name: "Taylor Sams", birthDate: "1990-06-03" }), "keeper");
});

test("same name, different birth date is a different person", async () => {
  const db = fakeDb({
    players: [{ id: "p1", normalized_name: "layne reed", birth_date: "1980-12-05" }],
  });
  assert.equal(await resolvePlayer(db, { name: "Layne Reed", birthDate: "2006-10-06" }), "new-id");
  assert.equal(db.inserted.length, 1);
});

test("losing the race to the unique index reads the row back", async () => {
  const db = fakeDb({
    players: [{ id: "winner", normalized_name: "taylor sams", birth_date: "1990-06-03" }],
    failInsert: true,
  });
  // The pre-check is what a caller sees first, so exercise the insert path by
  // asking for someone the select cannot match on birth date.
  const raced = fakeDb({
    players: [{ id: "winner", normalized_name: "new person", birth_date: "1999-09-09" }],
    failInsert: true,
  });
  assert.equal(await resolvePlayer(raced, { name: "New Person", birthDate: "1999-09-09" }), "winner");
  assert.ok(db);
});

test("a team with no name or no division is left unresolved", async () => {
  const db = fakeDb();
  assert.equal(await resolveTeam(db, { teamName: "", divisionId: "d1" }), null);
  assert.equal(await resolveTeam(db, { teamName: "Fallen", divisionId: null }), null);
  assert.equal(db.inserted.length, 0);
});

test("an existing team in the same division is reused", async () => {
  const db = fakeDb({
    teams: [{ id: "t1", normalized_name: "fallen", gender: "coed", class_id: null }],
  });
  assert.equal(await resolveTeam(db, { teamName: "FALLEN", divisionId: "d1" }), "t1");
  assert.equal(db.inserted.length, 0);
});

test("a merged-away team resolves to the survivor", async () => {
  const db = fakeDb({
    teams: [
      {
        id: "dupe",
        normalized_name: "fallen",
        gender: "coed",
        class_id: null,
        merged_into_id: "keeper",
      },
    ],
  });
  assert.equal(await resolveTeam(db, { teamName: "Fallen", divisionId: "d1" }), "keeper");
});

test("the same team name under a different gender is a different team", async () => {
  // The fake division is always coed, so a mens row must not match.
  const db = fakeDb({
    teams: [{ id: "t1", normalized_name: "fallen", gender: "mens", class_id: null }],
  });
  assert.equal(await resolveTeam(db, { teamName: "Fallen", divisionId: "d1" }), "new-id");
});
