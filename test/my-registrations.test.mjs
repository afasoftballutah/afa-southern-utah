import test from "node:test";
import assert from "node:assert/strict";
import {
  registrationNameKey,
  sameRegistrationName,
  sameRegistrationCombo,
  sameManager,
  isPlaceholderManager,
  isSiblingSeat,
} from "@/lib/register-key.js";

test("registrationNameKey matches the live unique index: lower(trim(name))", () => {
  assert.equal(registrationNameKey("  Fallen  "), "fallen");
  assert.equal(registrationNameKey("FALLEN"), "fallen");
  assert.equal(registrationNameKey(""), "");
});

test("sameRegistrationName ignores case and padding", () => {
  assert.equal(sameRegistrationName("Fallen", "fallen"), true);
  assert.equal(sameRegistrationName("Fallen", "Other"), false);
  assert.equal(sameRegistrationName("", ""), false);
});

test("same combo is team + tournament + division", () => {
  const a = {
    teamName: "Fallen",
    tournamentSlug: "2026-t-shirt-tournament",
    divisionId: "mens-d",
  };
  assert.equal(
    sameRegistrationCombo(a, { ...a, teamName: "FALLEN" }),
    true
  );
  assert.equal(
    sameRegistrationCombo(a, { ...a, divisionId: "coed-e" }),
    false
  );
  assert.equal(
    sameRegistrationCombo(a, { ...a, tournamentSlug: "2026-halloween" }),
    false
  );
});

test("manager email is the manager key", () => {
  assert.equal(
    sameManager(
      { managerEmail: "JD@Example.com" },
      { manager_email: "jd@example.com" }
    ),
    true
  );
  assert.equal(
    sameManager(
      { managerEmail: "a@x.com", managerName: "JD" },
      { managerEmail: "b@x.com", managerName: "JD" }
    ),
    false
  );
});

test("a missing email still matches the same printed manager name", () => {
  assert.equal(
    sameManager(
      { managerEmail: "braybrooks23@gmail.com", managerName: "Brayden Brooks" },
      { managerEmail: null, managerName: "Brayden Brooks" }
    ),
    true
  );
  assert.equal(
    sameManager(
      { managerEmail: "braybrooks23@gmail.com", managerName: "Brayden Brooks" },
      { managerEmail: null, managerName: "Someone Else" }
    ),
    false
  );
});

test("TBD is not a manager — Fallen stubs in other divisions stay other clubs", () => {
  assert.equal(isPlaceholderManager("TBD"), true);
  assert.equal(isPlaceholderManager("Tbd"), true);
  assert.equal(isPlaceholderManager("Brayden Brooks"), false);
  assert.equal(
    sameManager({ managerName: "Brayden Brooks" }, { managerName: "TBD" }),
    false
  );
  assert.equal(
    sameManager({ managerName: "TBD" }, { managerName: "Tbd" }),
    false
  );
  assert.equal(
    isSiblingSeat(
      {
        id: "1",
        team_name: "Fallen",
        tournament_id: "t",
        manager_name: "Brayden Brooks",
      },
      {
        id: "2",
        team_name: "Fallen",
        tournament_id: "t",
        manager_name: "TBD",
      }
    ),
    false
  );
});

test("Fallen Men's and Fallen Coed are sibling seats for the same manager", () => {
  const mens = {
    id: "1",
    team_name: "Fallen",
    tournament_id: "t",
    manager_email: "jd@example.com",
  };
  const coed = {
    id: "2",
    team_name: "FALLEN",
    tournament_id: "t",
    manager_email: "jd@example.com",
  };
  assert.equal(isSiblingSeat(mens, coed), true);
  assert.equal(
    isSiblingSeat(mens, { ...coed, manager_email: "other@x.com" }),
    false
  );
  assert.equal(isSiblingSeat(mens, { ...coed, status: "withdrawn" }), false);
  assert.equal(isSiblingSeat(mens, mens), false);
});

test("combo can match on gender + level when division id is missing", () => {
  const a = {
    teamName: "Fallen",
    tournamentSlug: "2026-t-shirt-tournament",
    genderKey: "mens",
    levelLabel: "D",
  };
  assert.equal(
    sameRegistrationCombo(a, {
      teamName: "Fallen",
      tournamentSlug: "2026-t-shirt-tournament",
      genderKey: "mens",
      levelLabel: "D",
    }),
    true
  );
  assert.equal(
    sameRegistrationCombo(a, {
      teamName: "Fallen",
      tournamentSlug: "2026-t-shirt-tournament",
      genderKey: "coed",
      levelLabel: "E",
    }),
    false
  );
});
