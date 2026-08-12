import test from "node:test";
import assert from "node:assert/strict";
import {
  registrationNameKey,
  sameRegistrationName,
  sameRegistrationCombo,
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
