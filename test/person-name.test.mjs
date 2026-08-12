import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeLegalName,
  waiverFormName,
} from "@/lib/person-name.js";

test("waiver line is legal name, then (preferred) when they differ", () => {
  assert.equal(
    waiverFormName({
      legalFirstName: "James",
      legalLastName: "Willcox",
      preferredName: "JD",
    }),
    "James Willcox (JD)"
  );
  assert.equal(
    waiverFormName({
      legalFirstName: "James",
      legalLastName: "Willcox",
      preferredName: "James",
    }),
    "James Willcox"
  );
  assert.equal(
    waiverFormName({
      legalFirstName: "James",
      legalLastName: "Willcox",
    }),
    "James Willcox"
  );
  assert.equal(composeLegalName({ legalFirstName: "James", legalLastName: "Willcox" }), "James Willcox");
});
