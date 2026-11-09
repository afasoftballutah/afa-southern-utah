import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  poolGameHasScore,
  poolRemovalBlocker,
  canRemovePoolPlay,
  removePoolPlay,
} from "@/lib/pool-removal";

const DIV = "div-1";
const OTHER = "div-2";

const open = (id, division_id = DIV) => ({
  id, division_id, status: "scheduled", team1_score: null, team2_score: null,
});

// Just enough of the supabase-js query builder for pool_games: select /
// delete with eq, neq and is filters, `select` after delete, and a head
// count. Filters run against an in-memory table, so the test sees exactly
// which rows a call would remove.
function fakeSupabase(rows, { failLoad = false, beforeDelete = null } = {}) {
  const table = rows.map((r) => ({ ...r }));
  const client = {
    table,
    from(name) {
      assert.equal(name, "pool_games");
      const filters = [];
      let mode = "select";
      let head = false;
      let counted = false;
      const matches = (r) => filters.every((f) => f(r));
      const run = () => {
        if (mode === "select") {
          if (failLoad) return { data: null, error: { message: "boom" } };
          const hit = table.filter(matches);
          return counted && head
            ? { data: null, count: hit.length, error: null }
            : { data: hit.map((r) => ({ ...r })), error: null };
        }
        beforeDelete?.(table);
        const hit = table.filter(matches);
        for (const r of hit) table.splice(table.indexOf(r), 1);
        return { data: hit.map(({ id }) => ({ id })), error: null };
      };
      const q = {
        select(_cols, opts) {
          if (opts?.count) counted = true;
          if (opts?.head) head = true;
          return q;
        },
        delete() { mode = "delete"; return q; },
        eq(col, v) { filters.push((r) => r[col] === v); return q; },
        neq(col, v) { filters.push((r) => r[col] !== v); return q; },
        is(col, v) { filters.push((r) => (r[col] ?? null) === v); return q; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
  };
  return client;
}

test("a pool game has a score once it is final or either side has runs", () => {
  assert.equal(poolGameHasScore(open("a")), false);
  assert.equal(poolGameHasScore({ ...open("a"), status: "final" }), true);
  assert.equal(poolGameHasScore({ ...open("a"), team1_score: 0 }), true, "a 0 is a score");
  assert.equal(poolGameHasScore({ ...open("a"), team2_score: 7 }), true);
});

test("pool play can be removed only when it exists and nothing is scored", () => {
  assert.match(poolRemovalBlocker([]), /no pool play/);
  assert.equal(poolRemovalBlocker([open("a"), open("b")]), null);
  assert.equal(canRemovePoolPlay([open("a")]), true);
  assert.equal(canRemovePoolPlay([open("a"), { ...open("b"), team1_score: 3 }]), false);
  assert.match(poolRemovalBlocker([{ ...open("b"), status: "final" }]), /^1 pool game already has a score/);
  assert.match(
    poolRemovalBlocker([{ ...open("a"), status: "final" }, { ...open("b"), team2_score: 1 }]),
    /^2 pool games already have scores/
  );
});

test("removePoolPlay deletes every unscored pool game of that division only", async () => {
  // 22 teams → 231 games, the Men's E accident.
  const rows = Array.from({ length: 231 }, (_, i) => open(`g${i}`));
  rows.push(open("keep-other", OTHER));
  const sb = fakeSupabase(rows);
  const out = await removePoolPlay(sb, DIV);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, removed: 231 });
  assert.deepEqual(sb.table.map((r) => r.id), ["keep-other"]);
});

test("removePoolPlay refuses, and deletes nothing, when any pool game has a score", async () => {
  const sb = fakeSupabase([open("a"), { ...open("b"), team1_score: 0, team2_score: 0 }]);
  const out = await removePoolPlay(sb, DIV);
  assert.equal(out.status, 409);
  assert.match(out.body.error, /already has a score/);
  assert.equal(sb.table.length, 2);
});

test("removePoolPlay refuses an empty division and a missing id", async () => {
  assert.equal((await removePoolPlay(fakeSupabase([]), DIV)).status, 409);
  assert.equal((await removePoolPlay(fakeSupabase([open("a")]), "")).status, 400);
});

test("a score that lands between the check and the delete is kept", async () => {
  const sb = fakeSupabase([open("a"), open("b")], {
    beforeDelete: (t) => { t.find((r) => r.id === "b").team1_score = 4; },
  });
  const out = await removePoolPlay(sb, DIV);
  assert.equal(out.status, 409);
  assert.match(out.body.error, /Removed 1 pool games; 1 with a score were kept/);
  assert.deepEqual(sb.table.map((r) => r.id), ["b"]);
});

test("a failed read deletes nothing", async () => {
  const sb = fakeSupabase([open("a")], { failLoad: true });
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal((await removePoolPlay(sb, DIV)).status, 500);
  } finally {
    console.error = orig;
  }
  assert.equal(sb.table.length, 1);
});

test("the route gates removePoolPlay to directors and the page shows it only while removable", async () => {
  const route = await readFile(new URL("../app/api/scorekeeper/directory/route.js", import.meta.url), "utf8");
  const i = route.indexOf('case "removePoolPlay"');
  assert.ok(i > 0, "route handles removePoolPlay");
  const block = route.slice(i, route.indexOf("case ", i + 10));
  assert.match(block, /requireDirectorSession\(\)/);
  assert.match(block, /removePoolPlay\(supabase, body\.divisionId\)/);

  const page = await readFile(new URL("../app/director/division/[divisionId]/page.js", import.meta.url), "utf8");
  assert.match(page, /canRemovePoolPlay\(data\.poolGames\)/);
  assert.match(page, /\{canRemovePool && \(\s*<RemovePoolPlay/);
});
