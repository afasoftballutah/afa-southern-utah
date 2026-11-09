// AFA World Series 2026 Men's D — the transcribed 16-team 3GG sheet, its
// generated SQL load, and a full simulated run through the existing engine
// helpers (resolveMatchSlots, mootIfRounds/championOf, computeTeamStatus).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GAMES, TEAMS, DAYS, VENUES, fieldText, parseToken } from "../scripts/worlds-2026-mens-d/sheet.mjs";
import { buildLoadSql, buildRollbackSql } from "../scripts/worlds-2026-mens-d/build-sql.mjs";
import { PYB_3GG_SHEETS } from "@/lib/bracket/pyb-3gg-sheets";
import { resolveMatchSlots } from "@/lib/bracket/resolve";
import { championOf, findIfGames, mootIfRounds } from "@/lib/bracket/if-game";
import { computeTeamStatus } from "@/lib/elimination";
import { shortField, venueForField, tournamentVenues } from "@/lib/venues";

const ROOT = path.join(import.meta.dirname, "..");

test("35 games, 16 teams, each team once in round 1", () => {
  assert.equal(GAMES.length, 35);
  assert.deepEqual(GAMES.map((g) => g.n), Array.from({ length: 35 }, (_, i) => i + 1));
  const r1 = GAMES.filter((g) => parseToken(g.a).kind === "team").flatMap((g) => [g.a, g.b]);
  assert.deepEqual([...r1].sort(), [...TEAMS].sort());
  assert.equal(new Set(TEAMS).size, 16);
});

test("sheet is the PrintYourBrackets 16-team 3GG with G17–20 numbered bottom-up", () => {
  const sheetToPyb = new Map(GAMES.map((g) => [g.n, g.n]));
  for (const [s, p] of [[17, 20], [18, 19], [19, 18], [20, 17]]) sheetToPyb.set(s, p);
  const pyb = PYB_3GG_SHEETS[16];
  const kind = { winners: "w", losers: "l", final: "f" };
  for (const g of GAMES) {
    const row = pyb[sheetToPyb.get(g.n) - 1];
    assert.equal(kind[g.side], row[0], `G${g.n} side`);
    const map = (tok) => {
      const t = parseToken(tok);
      return t.kind === "team" ? "seed" : `${t.kind}${sheetToPyb.get(t.n)}`;
    };
    const ours = [map(g.a), map(g.b)].sort();
    const theirs = [row[1], row[2]].map((x) => (/^\d+$/.test(x) ? "seed" : x)).sort();
    assert.deepEqual(ours, theirs, `G${g.n}`);
  }
});

test("3GG crossover: losers of G9–G12 play again in G17–G20", () => {
  const at = (n) => GAMES.find((g) => g.n === n);
  assert.deepEqual([at(17).a, at(17).b], ["L11", "W12"]);
  assert.deepEqual([at(18).a, at(18).b], ["L12", "W11"]);
  assert.deepEqual([at(19).a, at(19).b], ["L9", "W10"]);
  assert.deepEqual([at(20).a, at(20).b], ["L10", "W9"]);
  assert.deepEqual([21, 22, 23, 24].map((n) => at(n).a), ["L16", "L15", "L14", "L13"]);
});

test("every game is scheduled after the games that feed it, no field double-booked", () => {
  const when = (g) => `${DAYS[g.day]}T${g.at}`;
  const byN = new Map(GAMES.map((g) => [g.n, g]));
  const seen = new Map();
  for (const g of GAMES) {
    for (const tok of [g.a, g.b]) {
      const t = parseToken(tok);
      if (t.kind === "team") continue;
      assert.ok(t.n < g.n, `G${g.n} fed by later G${t.n}`);
      assert.ok(when(byN.get(t.n)) < when(g), `G${g.n} not after G${t.n}`);
    }
    const key = `${when(g)} ${fieldText(g)}`;
    assert.ok(!seen.has(key), `G${g.n} and G${seen.get(key)} both at ${key}`);
    seen.set(key, g.n);
  }
});

// DB-shaped rows, exactly what the load writes (minus uuids).
function rows() {
  const id = (n) => `g${n}`;
  return GAMES.map((g) => {
    const row = {
      id: id(g.n), division_id: "mens-d", bracket_group: "main", bracket_side: g.side,
      round: g.n, slot: 0, status: "pending", is_bye: false,
      field: fieldText(g), scheduled_time: `${DAYS[g.day]}T${g.at}:00-07:00`,
      team1_score: null, team2_score: null, winner_slot: null,
    };
    for (const [side, tok] of [["team1", g.a], ["team2", g.b]]) {
      const t = parseToken(tok);
      row[`${side}_name`] = t.kind === "team" ? t.name : null;
      row[`${side}_source_game_id`] = t.kind === "team" ? null : id(t.n);
      row[`${side}_source_result`] = t.kind === "W" ? "winner" : t.kind === "L" ? "loser" : null;
      row[`${side}_is_open_entry`] = false;
      row[`${side}_seed_ref`] = null;
    }
    return row;
  });
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function play(seed) {
  const rand = rng(seed);
  const games = rows();
  const byId = new Map(games.map((g) => [g.id, g]));
  for (const g of games) {
    if (mootIfRounds(games).has(g.round)) {
      g.status = "cancelled";
      continue;
    }
    const { team1, team2 } = resolveMatchSlots(g, (id) => byId.get(id), games);
    assert.ok(team1.team && team2.team, `G${g.round} not ready (seed ${seed})`);
    g.team1_name = team1.team;
    g.team2_name = team2.team;
    const t1Wins = rand() < 0.5;
    g.team1_score = t1Wins ? 10 : 4;
    g.team2_score = t1Wins ? 4 : 10;
    g.winner_slot = t1Wins ? "team1" : "team2";
    g.status = "final";
  }
  return games;
}

test("the if-game is G35, fed by both sides of G34", () => {
  assert.deepEqual(findIfGames(rows()).map((x) => x.round), [35]);
});

test("simulated: every team gets 3 games; out at 2 losses, or 3 if they lost their first two", () => {
  for (let seed = 1; seed <= 400; seed++) {
    const games = play(seed);
    const played = games.filter((g) => g.status === "final");
    assert.ok(played.length === 34 || played.length === 35);
    const results = new Map(TEAMS.map((t) => [t, []])); // "W" / "L" in game order
    for (const g of played) {
      const [w, l] = g.winner_slot === "team1" ? [g.team1_name, g.team2_name] : [g.team2_name, g.team1_name];
      results.get(w).push("W");
      results.get(l).push("L");
    }
    const champ = championOf(games);
    assert.ok(champ, `no champion (seed ${seed})`);
    for (const [team, r] of results) {
      const losses = r.filter((x) => x === "L").length;
      const lives = r[0] === "L" && r[1] === "L" ? 3 : 2; // the 3-game guarantee
      assert.ok(r.length >= 3, `${team} played ${r.length} (seed ${seed})`);
      if (team === champ) assert.ok(losses < lives, `${team} champion at ${r} (seed ${seed})`);
      else assert.equal(losses, lives, `${team} ${r.join("")} (seed ${seed})`);
    }
    const status = computeTeamStatus(games, [], new Map([["mens-d", "Men's D"]]));
    assert.equal(status.filter((s) => s.state === "champion").length, 1);
    assert.equal(status.find((s) => s.state === "champion")?.team_name, champ);
    assert.equal(status.filter((s) => s.state === "eliminated").length, 15);
  }
});

test("generated SQL is up to date with the sheet", () => {
  assert.equal(readFileSync(path.join(ROOT, "supabase/load-2026-worlds-mens-d.sql"), "utf8"), buildLoadSql());
  assert.equal(readFileSync(path.join(ROOT, "supabase/rollback-2026-worlds-mens-d.sql"), "utf8"), buildRollbackSql());
});

test("venues: park prefix on field, map link per park", () => {
  const t = { venues: VENUES };
  assert.equal(tournamentVenues(t).length, 2);
  assert.equal(venueForField(t, "Hunter F1")?.name, "Hunter Park");
  assert.equal(venueForField(t, "Pioneer F3")?.address, "501 Hillside Drive, Mesquite, NV 89027");
  assert.equal(venueForField(t, "Field 3"), null);
  assert.equal(venueForField({}, "Hunter F1"), null);
  assert.match(VENUES[0].map_url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Hunter%20Park/);
  assert.equal(shortField("Hunter F1"), "Hunter F1");
  assert.equal(shortField("Field 3"), "F3");
  assert.equal(shortField("Field #5"), "F5");
  assert.equal(shortField("Survivor pool"), "Survivor pool");
});
