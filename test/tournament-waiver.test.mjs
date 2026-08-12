import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tournamentPersonKey,
  personNameKeys,
  membersMatch,
  identityOntoSeat,
  buildTournamentSignedSet,
  isSignedForTournament,
} from "@/lib/tournament-waiver";

test("directory id is the hard key", () => {
  assert.equal(
    tournamentPersonKey({ playerId: "abc" }),
    "p:abc"
  );
});

test("legal name + birth date is the fallback key", () => {
  assert.equal(
    tournamentPersonKey({
      legalFirstName: "James",
      legalLastName: "Willcox",
      birthDate: "1988-04-12",
    }),
    "n:james willcox|1988-04-12"
  );
  assert.equal(
    tournamentPersonKey({ legalFirstName: "James", legalLastName: "Willcox" }),
    null
  );
});

test("preferred + last covers a manager-entered nickname stub", () => {
  const keys = personNameKeys({
    legalFirstName: "James",
    legalLastName: "Willcox",
    preferredName: "JD",
    name: "James Willcox",
  });
  assert.equal(keys.has("james willcox"), true);
  assert.equal(keys.has("jd willcox"), true);
});

test("one person on Men's and Coed matches even when Coed is still a stub", () => {
  const signed = {
    player_id: "p1",
    legal_first_name: "James",
    legal_last_name: "Willcox",
    preferred_name: "JD",
    name: "JD Willcox",
    birth_date: "1988-04-12",
    signed_at: "2026-08-11T01:00:00Z",
  };
  const stub = {
    name: "JD Willcox",
    legal_first_name: "JD",
    legal_last_name: "Willcox",
  };
  assert.equal(membersMatch(signed, stub), true);
});

test("two different directory people never match", () => {
  assert.equal(
    membersMatch({ player_id: "a", name: "JD Willcox" }, { player_id: "b", name: "JD Willcox" }),
    false
  );
});

test("two people with the same last name and different legal+DOB do not match", () => {
  assert.equal(
    membersMatch(
      {
        legal_first_name: "James",
        legal_last_name: "Willcox",
        birth_date: "1988-04-12",
      },
      {
        legal_first_name: "John",
        legal_last_name: "Willcox",
        birth_date: "1990-01-01",
      }
    ),
    false
  );
});

test("a signed seat fills identity onto the other division stub", () => {
  const patch = identityOntoSeat(
    { name: "JD Willcox" },
    {
      player_id: "p1",
      legal_first_name: "James",
      legal_last_name: "Willcox",
      preferred_name: "JD",
      birth_date: "1988-04-12",
      address: "1 Main St",
      email: "jd@example.com",
    }
  );
  assert.equal(patch.player_id, "p1");
  assert.equal(patch.legal_first_name, "James");
  assert.equal(patch.birth_date, "1988-04-12");
  assert.equal(patch.email, "jd@example.com");
});

test("director lists treat the Coed stub as signed once Men's is signed", () => {
  const mensReg = "r-mens";
  const coedReg = "r-coed";
  const tour = "t1";
  const regBy = new Map([
    [mensReg, { tournament_id: tour }],
    [coedReg, { tournament_id: tour }],
  ]);
  const members = [
    {
      registration_id: mensReg,
      player_id: "p1",
      legal_first_name: "James",
      legal_last_name: "Willcox",
      preferred_name: "JD",
      name: "JD Willcox",
      birth_date: "1988-04-12",
      signed_at: "2026-08-11T01:00:00Z",
    },
    {
      registration_id: coedReg,
      name: "JD Willcox",
      legal_first_name: "JD",
      legal_last_name: "Willcox",
      signed_at: null,
    },
  ];
  const set = buildTournamentSignedSet(members, regBy);
  assert.equal(isSignedForTournament(members[1], regBy, set), true);
});
