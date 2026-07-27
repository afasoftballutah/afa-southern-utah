import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

// lib/me.js reads window.localStorage. Stand one up before importing it.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

const { readMe, writeMe, meIsIn } = await import("@/lib/me.js");

beforeEach(() => store.clear());

test("a device with no history knows nobody", () => {
  assert.equal(readMe(), null);
});

test("a picked team round-trips", () => {
  writeMe({ teamName: "Fallen", source: "picked" });
  assert.deepEqual(readMe(), { teamName: "Fallen", source: "picked" });
});

test("signing records the person as well as the team", () => {
  writeMe({ name: "Taylor Sams", teamName: "Fallen", source: "signed" });
  assert.equal(readMe().name, "Taylor Sams");
  assert.equal(readMe().source, "signed");
});

test("a stray pick does not downgrade a signature for the same team", () => {
  writeMe({ name: "Taylor Sams", teamName: "Fallen", source: "signed" });
  writeMe({ teamName: "Fallen", source: "picked" });
  assert.equal(readMe().name, "Taylor Sams", "the person must survive a re-pick");
  assert.equal(readMe().source, "signed");
});

test("picking a DIFFERENT team is a real change of mind and wins", () => {
  writeMe({ name: "Taylor Sams", teamName: "Fallen", source: "signed" });
  writeMe({ teamName: "Backwards K", source: "picked" });
  assert.equal(readMe().teamName, "Backwards K");
  assert.equal(readMe().name, undefined);
});

test("null forgets the device", () => {
  writeMe({ teamName: "Fallen", source: "picked" });
  writeMe(null);
  assert.equal(readMe(), null);
});

test("a value with no team is not an identity", () => {
  writeMe({ name: "Nobody" });
  assert.equal(readMe(), null);
});

test("corrupt storage forgets rather than throwing", () => {
  store.set("afa-me", "{not json");
  assert.equal(readMe(), null);
});

test("an older stored shape without a team is ignored", () => {
  store.set("afa-me", JSON.stringify("Fallen"));
  assert.equal(readMe(), null);
});

test("meIsIn only matches a team actually in the list", () => {
  const me = { teamName: "Fallen", source: "picked" };
  assert.equal(meIsIn(me, ["Fallen", "GWZ"]), true);
  assert.equal(meIsIn(me, ["GWZ"]), false);
  assert.equal(meIsIn(null, ["Fallen"]), false);
  assert.equal(meIsIn(me, null), false);
});

test("everything survives storage being blocked", () => {
  const real = globalThis.window.localStorage;
  globalThis.window.localStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readMe(), null);
  assert.doesNotThrow(() => writeMe({ teamName: "Fallen", source: "picked" }));
  globalThis.window.localStorage = real;
});
