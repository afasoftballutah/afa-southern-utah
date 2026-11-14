import test from "node:test";
import assert from "node:assert/strict";
import robots from "../app/robots.js";

test("robots.txt blocks director, scorekeeper, and registration credential paths", () => {
  const rules = robots().rules;
  const disallow = rules.disallow;
  for (const path of [
    "/director",
    "/scorekeeper",
    "/register/sign",
    "/register/manage",
    "/register/roster",
  ]) {
    assert.ok(disallow.includes(path), path);
  }
});
