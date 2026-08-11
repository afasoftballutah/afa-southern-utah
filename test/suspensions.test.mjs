import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSuspensionActive,
  activeSuspensionFor,
  partitionRosterBySuspension,
  activeSuspensionMap,
} from "../lib/suspensions.js";

describe("isSuspensionActive", () => {
  it("open-ended until lifted", () => {
    assert.equal(
      isSuspensionActive(
        { tournament_id: null, starts_on: null, ends_on: null },
        { asOf: "2026-08-11" }
      ),
      true
    );
  });

  it("respects lifted_at", () => {
    assert.equal(
      isSuspensionActive(
        { lifted_at: "2026-08-01T00:00:00Z", starts_on: "2026-01-01" },
        { asOf: "2026-08-11" }
      ),
      false
    );
  });

  it("date range inclusive", () => {
    const s = { starts_on: "2026-08-01", ends_on: "2026-08-15" };
    assert.equal(isSuspensionActive(s, { asOf: "2026-08-01" }), true);
    assert.equal(isSuspensionActive(s, { asOf: "2026-08-15" }), true);
    assert.equal(isSuspensionActive(s, { asOf: "2026-07-31" }), false);
    assert.equal(isSuspensionActive(s, { asOf: "2026-08-16" }), false);
  });

  it("tournament scoped", () => {
    const s = { tournament_id: "t1" };
    assert.equal(
      isSuspensionActive(s, { tournamentId: "t1", asOf: "2026-08-11" }),
      true
    );
    assert.equal(
      isSuspensionActive(s, { tournamentId: "t2", asOf: "2026-08-11" }),
      false
    );
    assert.equal(isSuspensionActive(s, { asOf: "2026-08-11" }), false);
  });

  it("tournament + dates both required", () => {
    const s = {
      tournament_id: "t1",
      starts_on: "2026-08-10",
      ends_on: "2026-08-12",
    };
    assert.equal(
      isSuspensionActive(s, { tournamentId: "t1", asOf: "2026-08-11" }),
      true
    );
    assert.equal(
      isSuspensionActive(s, { tournamentId: "t1", asOf: "2026-08-20" }),
      false
    );
    assert.equal(
      isSuspensionActive(s, { tournamentId: "t2", asOf: "2026-08-11" }),
      false
    );
  });
});

describe("partitionRosterBySuspension", () => {
  it("excludes suspended from counting list", () => {
    const map = activeSuspensionMap(
      [{ player_id: "p1", tournament_id: "t1" }],
      { tournamentId: "t1", asOf: "2026-08-11" }
    );
    const { counting, suspended } = partitionRosterBySuspension(
      [
        { id: "m1", playerId: "p1", gender: "M" },
        { id: "m2", playerId: "p2", gender: "F" },
      ],
      map
    );
    assert.equal(counting.length, 1);
    assert.equal(counting[0].id, "m2");
    assert.equal(suspended.length, 1);
    assert.equal(suspended[0].id, "m1");
  });
});

describe("activeSuspensionFor", () => {
  it("returns first match", () => {
    const rows = [
      { player_id: "p1", tournament_id: "t1", note: "a" },
      { player_id: "p2", starts_on: "2026-01-01" },
    ];
    assert.equal(
      activeSuspensionFor(rows, "p1", {
        tournamentId: "t1",
        asOf: "2026-08-11",
      })?.note,
      "a"
    );
    assert.equal(
      activeSuspensionFor(rows, "p9", { asOf: "2026-08-11" }),
      null
    );
  });
});
