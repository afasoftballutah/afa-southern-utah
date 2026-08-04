import { test } from "node:test";
import assert from "node:assert/strict";
import {
  directorSeedRef,
  parseDirectorSeedRef,
  normalizeSeedOrder,
  isCompleteSeedOrder,
  directorSeedMap,
} from "@/lib/bracket/seed-order";

test("directorSeedRef is 1-based Seed #n", () => {
  assert.equal(directorSeedRef(1), "Seed #1");
  assert.equal(directorSeedRef(8), "Seed #8");
});

test("parseDirectorSeedRef accepts bare and bracketed forms", () => {
  assert.equal(parseDirectorSeedRef("Seed #3"), 3);
  assert.equal(parseDirectorSeedRef("[Seed #12]"), 12);
  assert.equal(parseDirectorSeedRef("A #1"), null);
  assert.equal(parseDirectorSeedRef(""), null);
});

test("normalizeSeedOrder keeps director order and appends missing teams", () => {
  const teams = ["Alpha", "Bravo", "Charlie", "Delta"];
  assert.deepEqual(normalizeSeedOrder(teams, ["Charlie", "Alpha"]), [
    "Charlie",
    "Alpha",
    "Bravo",
    "Delta",
  ]);
});

test("normalizeSeedOrder drops withdrawn / unknown names and duplicates", () => {
  const teams = ["Alpha", "Bravo"];
  assert.deepEqual(normalizeSeedOrder(teams, ["Bravo", "Ghost", "Bravo", "Alpha"]), [
    "Bravo",
    "Alpha",
  ]);
});

test("isCompleteSeedOrder requires every registered team once", () => {
  const teams = ["A", "B", "C"];
  assert.equal(isCompleteSeedOrder(teams, ["A", "B", "C"]), true);
  assert.equal(isCompleteSeedOrder(teams, ["C", "A", "B"]), true);
  assert.equal(isCompleteSeedOrder(teams, ["A", "B"]), false);
  assert.equal(isCompleteSeedOrder(teams, ["A", "B", "C", "D"]), false);
  assert.equal(isCompleteSeedOrder(["Only"], ["Only"]), false); // need ≥2
});

test("directorSeedMap maps Seed #k to names", () => {
  assert.deepEqual(directorSeedMap(["Top", "Mid", "Low"]), {
    "Seed #1": "Top",
    "Seed #2": "Mid",
    "Seed #3": "Low",
  });
});
