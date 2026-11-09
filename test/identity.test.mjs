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
function fakeDb({ players = [], teams = [], registrations = [], failInsert = false } = {}) {
  const inserted = [];
  const make = (rows) => {
    const filters = [];
    const ok = (r) => filters.every((f) => f(r));
    const q = {
      select: () => q,
      eq: (col, val) => (filters.push((r) => (r[col] ?? null) === val), q),
      is: (col, val) => (filters.push((r) => (r[col] ?? null) === val), q),
      in: (col, vals) => (filters.push((r) => vals.includes(r[col])), q),
      // Literal, case-insensitive (the code escapes % and _).
      ilike: (col, pat) =>
        (filters.push(
          (r) => String(r[col] ?? "").toLowerCase() === pat.replace(/\\(.)/g, "$1").toLowerCase()
        ),
        q),
      not: (col, op, val) => (filters.push((r) => (r[col] ?? null) !== val), q),
      then: (resolve) => resolve({ data: rows.filter(ok), error: null }),
      maybeSingle: async () => ({
        data: rows.find(ok) ?? null,
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
            : table === "registrations"
              ? registrations
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

// Team key is name + manager + gender. Without a manager we never merge —
// two bulk "Fallen" adds stay two rows until managers are known.

test("without a manager, same team name always creates a new team", async () => {
  const db = fakeDb({
    teams: [
      {
        id: "t1",
        normalized_name: "fallen",
        gender: "coed",
        class_id: null,
        manager_normalized_name: null,
      },
    ],
  });
  assert.equal(await resolveTeam(db, { teamName: "Fallen", divisionId: "d1" }), "new-id");
  assert.equal(db.inserted.length, 1);
  assert.equal(db.inserted[0].manager_normalized_name, null);
});

test("an existing team with the same name + manager + gender is reused", async () => {
  const db = fakeDb({
    teams: [
      {
        id: "t1",
        normalized_name: "fallen",
        gender: "coed",
        class_id: null,
        manager_name: "JD Willcox",
        manager_normalized_name: "jd willcox",
      },
    ],
  });
  assert.equal(
    await resolveTeam(db, {
      teamName: "FALLEN",
      divisionId: "d1",
      managerName: "  JD   Willcox ",
    }),
    "t1"
  );
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
        manager_name: "JD Willcox",
        manager_normalized_name: "jd willcox",
        merged_into_id: "keeper",
      },
    ],
  });
  assert.equal(
    await resolveTeam(db, {
      teamName: "Fallen",
      divisionId: "d1",
      managerName: "JD Willcox",
    }),
    "keeper"
  );
});

test("same name + manager under a different gender is a different team", async () => {
  // The fake division is always coed, so a mens row must not match.
  const db = fakeDb({
    teams: [
      {
        id: "t1",
        normalized_name: "fallen",
        gender: "mens",
        class_id: null,
        manager_normalized_name: "jd willcox",
      },
    ],
  });
  assert.equal(
    await resolveTeam(db, {
      teamName: "Fallen",
      divisionId: "d1",
      managerName: "JD Willcox",
    }),
    "new-id"
  );
});

test("same name, different managers are different teams", async () => {
  const db = fakeDb({
    teams: [
      {
        id: "t1",
        normalized_name: "fallen",
        gender: "coed",
        class_id: null,
        manager_normalized_name: "alice smith",
      },
    ],
  });
  assert.equal(
    await resolveTeam(db, {
      teamName: "Fallen",
      divisionId: "d1",
      managerName: "Bob Jones",
    }),
    "new-id"
  );
  assert.equal(db.inserted.length, 1);
  assert.equal(db.inserted[0].manager_normalized_name, "bob jones");
});

// Manager email (JD, 2026-11-08: "combined when the email / manager and name
// matches") and placeholder managers.

test("same name + same manager email on an earlier registration reuses that team", async () => {
  const db = fakeDb({
    teams: [
      { id: "t1", normalized_name: "fallen", gender: "coed", class_id: null, manager_normalized_name: "brayden", created_at: "2026-08-01" },
    ],
    registrations: [{ id: "r0", team_id: "t1", manager_email: "Mgr_1@Example.com" }],
  });
  // Different manager name typed this time ("Brayden Brooks" vs "Brayden"):
  // the email still says it is the same club.
  assert.equal(
    await resolveTeam(db, {
      teamName: "Fallen",
      divisionId: "d1",
      managerName: "Brayden Brooks",
      managerEmail: "  mgr_1@example.COM ",
    }),
    "t1"
  );
  assert.equal(db.inserted.length, 0);
});

test("same manager email but a different team name is a different team", async () => {
  const db = fakeDb({
    teams: [{ id: "t1", normalized_name: "fallen", gender: "coed", class_id: null, manager_normalized_name: "x" }],
    registrations: [{ id: "r0", team_id: "t1", manager_email: "m@example.com" }],
  });
  assert.equal(
    await resolveTeam(db, { teamName: "Fallen Angels", divisionId: "d1", managerName: "Y", managerEmail: "m@example.com" }),
    "new-id"
  );
});

test("same name + manager email under a different gender is a different team", async () => {
  const db = fakeDb({
    teams: [{ id: "t1", normalized_name: "fallen", gender: "mens", class_id: null, manager_normalized_name: "x" }],
    registrations: [{ id: "r0", team_id: "t1", manager_email: "m@example.com" }],
  });
  assert.equal(
    await resolveTeam(db, { teamName: "Fallen", divisionId: "d1", managerName: "Y", managerEmail: "m@example.com" }),
    "new-id"
  );
});

test("an email with _ or % only matches itself, not a pattern", async () => {
  const db = fakeDb({
    teams: [{ id: "t1", normalized_name: "fallen", gender: "coed", class_id: null, manager_normalized_name: "x" }],
    registrations: [{ id: "r0", team_id: "t1", manager_email: "aXb@example.com" }],
  });
  assert.equal(
    await resolveTeam(db, { teamName: "Fallen", divisionId: "d1", managerEmail: "a_b@example.com" }),
    "new-id"
  );
});

test("TBD is no manager: never matches a TBD team, never stored as a manager", async () => {
  const db = fakeDb({
    teams: [
      { id: "t1", normalized_name: "fallen", gender: "coed", class_id: null, manager_name: "Tbd", manager_normalized_name: "tbd" },
    ],
  });
  for (const m of ["TBD", " tbd ", "Tbd", "N/A", "unknown"]) {
    assert.equal(await resolveTeam(db, { teamName: "Fallen", divisionId: "d1", managerName: m }), "new-id");
  }
  assert.ok(db.inserted.every((r) => r.manager_name === null && r.manager_normalized_name === null));
});

test("TBD manager with a known email still joins that email's team", async () => {
  const db = fakeDb({
    teams: [{ id: "t1", normalized_name: "fallen", gender: "coed", class_id: null, manager_normalized_name: "x" }],
    registrations: [{ id: "r0", team_id: "t1", manager_email: "m@example.com" }],
  });
  assert.equal(
    await resolveTeam(db, { teamName: "Fallen", divisionId: "d1", managerName: "TBD", managerEmail: "m@example.com" }),
    "t1"
  );
});

test("a merged-away team found by email resolves to the survivor", async () => {
  const db = fakeDb({
    teams: [{ id: "dupe", normalized_name: "fallen", gender: "coed", class_id: null, merged_into_id: "keeper" }],
    registrations: [{ id: "r0", team_id: "dupe", manager_email: "m@example.com" }],
  });
  assert.equal(
    await resolveTeam(db, { teamName: "Fallen", divisionId: "d1", managerEmail: "m@example.com" }),
    "keeper"
  );
});
