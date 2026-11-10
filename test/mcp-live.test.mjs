// Live check of /api/mcp against real data, over Streamable HTTP. Skipped
// unless AFA_MCP_URL is set, e.g.
//   AFA_MCP_URL=http://localhost:3000/api/mcp npm test -- test/mcp-live.test.mjs
// Read-only: every tool is a read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.AFA_MCP_URL;
const WORLDS = "2026-afa-world-series";
const opts = { skip: URL_ ? false : "set AFA_MCP_URL to run" };

async function connect() {
  const c = new Client({ name: "afa-live-test", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  const call = async (name, args) => {
    const r = await c.callTool({ name, arguments: args });
    return { ...JSON.parse(r.content[0].text), _error: r.isError === true, _text: r.content[0].text };
  };
  return { c, call };
}

test("live: Worlds is listed, PST, never as finished before it ends", opts, async () => {
  const { call, c } = await connect();
  const l = await call("list_tournaments", {});
  const w = l.tournaments.find((t) => t.slug === WORLDS);
  assert.ok(w);
  assert.equal(w.times, "PST");
  assert.notEqual(w.phase, "Finished");
  for (const t of l.tournaments) if (t.end < "2026-11-01") assert.equal(t.phase, "Finished", t.slug);
  await c.close();
});

test("live: Coed E G13 waits on Loser G12 and Winner G9, Sun 9 AM PST on Pioneer F1", opts, async () => {
  const { call, c } = await connect();
  const g = (await call("get_game", { slug: WORLDS, division: "Coed E", game: 13 })).game;
  assert.equal(g.when, "Sun 9 AM PST");
  assert.equal(g.field, "Pioneer F1");
  assert.deepEqual(g.feeders, { team1: "Loser G12", team2: "Winner G9" });
  assert.equal(g.next.winner, "Game 19");
  await c.close();
});

test("live: no contacts, no ':00' on whole hours, no TBD where a game feeds the slot", opts, async () => {
  const { call, c } = await connect();
  for (const [name, args] of [
    ["get_schedule", { slug: WORLDS }],
    ["get_now_next", { slug: WORLDS, at: "2026-11-15T19:30:00Z" }],
    ["get_division", { slug: WORLDS, division: "Coed Rec" }],
    ["get_team_path", { slug: WORLDS, team: "Oddballs", division: "Coed E" }],
  ]) {
    const o = await call(name, args);
    assert.equal(o._error, false, name);
    assert.doesNotMatch(o._text, /@[a-z0-9-]+\.[a-z]|\(\d{3}\) ?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b|manager|contacts/i, name);
    assert.doesNotMatch(o._text, /\d:00 ?[AP]M/, name);
    assert.doesNotMatch(o._text, /"TBD"/, name);
  }
  await c.close();
});
