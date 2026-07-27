// Acceptance: Heat Stroker (finished) + Do It for the T-Shirts (not finished).
// Run from repo root with: node --import ./scripts/alias-hooks-register.mjs scripts/accept-archive.mjs
// Or: node --experimental-strip-types with a simple path rewrite below.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

// Inline the three modules with relative imports (no @/ needed).
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadMod(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

const { championOf, mootIfRounds } = await loadMod("lib/bracket/if-game.js");
// tournament-state uses @/ — load via rewritten temp or reimplement isFinished here
const { bracketStandings } = await loadMod("lib/bracket/standings.js");

function isPlayableGame(g, mootRounds) {
  if (!g) return false;
  if (g.is_bye) return false;
  if (g.status === "cancelled") return false;
  if (mootRounds?.has?.(g.round)) return false;
  return true;
}
function isStillToPlay(g, mootRounds) {
  return isPlayableGame(g, mootRounds) && g.status !== "final";
}
function stillToPlayIn(games) {
  const moot = mootIfRounds(games ?? []);
  return (games ?? []).filter((g) => isStillToPlay(g, moot));
}
function isFinished(divisionGames) {
  let groups;
  if (!divisionGames) groups = [];
  else if (divisionGames instanceof Map) groups = [...divisionGames.values()];
  else if (Array.isArray(divisionGames)) {
    if (divisionGames.length === 0) groups = [];
    else if (Array.isArray(divisionGames[0])) groups = divisionGames;
    else {
      const by = new Map();
      for (const g of divisionGames) {
        const id = g.division_id ?? "_";
        if (!by.has(id)) by.set(id, []);
        by.get(id).push(g);
      }
      groups = [...by.values()];
    }
  } else groups = Object.values(divisionGames);
  let sawAny = false;
  for (const games of groups) {
    if (!games?.length) continue;
    sawAny = true;
    if (stillToPlayIn(games).length > 0) return false;
  }
  return sawAny;
}
function isTournamentFinished(tournament) {
  const byDivision = {};
  for (const d of tournament?.divisions ?? []) {
    const list = [...(d.games ?? []), ...(d.pool_games ?? [])];
    if (list.length) byDivision[d.id] = list;
  }
  return isFinished(byDivision);
}

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function load(slug) {
  const { data, error } = await sb
    .from("tournaments")
    .select("*, divisions(*, placements(*), brackets(*), games(*), pool_games(*))")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function teamStatus(id) {
  const { data } = await sb
    .from("team_status")
    .select("team_name, state, placement, bracket_name")
    .eq("tournament_id", id);
  return Object.fromEntries((data ?? []).map((r) => [r.team_name, r]));
}
function isRealTeamName(name) {
  if (!name) return false;
  if (/^\[?[A-I] #\d+\]?$/.test(name)) return false;
  if (/^(Winner|Loser) of Game/.test(name)) return false;
  return true;
}
function tournamentRecords(tournament) {
  const rec = new Map();
  const touch = (name) => {
    if (!isRealTeamName(name)) return null;
    if (!rec.has(name)) rec.set(name, { w: 0, l: 0 });
    return rec.get(name);
  };
  for (const d of tournament?.divisions ?? []) {
    for (const g of [...(d.games ?? []), ...(d.pool_games ?? [])]) {
      if (g.is_bye || g.status === "cancelled") continue;
      const a = touch(g.team1_name);
      const b = touch(g.team2_name);
      if (g.status !== "final" || g.team1_score === null || g.team2_score === null) continue;
      if (!a || !b || g.team1_score === g.team2_score) continue;
      const [win, lose] = g.team1_score > g.team2_score ? [a, b] : [b, a];
      win.w += 1;
      lose.l += 1;
    }
  }
  return rec;
}
function buildPodium(champ, standings, teamStatus, records) {
  const placed = new Map();
  if (champ) {
    const s = standings.find((x) => x.team === champ) ?? { team: champ, w: 0, l: 0 };
    placed.set(1, [{ team: champ, w: s.w, l: s.l }]);
  }
  for (const s of standings) {
    const n = s.finish?.n;
    if (!n || n < 1 || n > 3) continue;
    if (n === 1 && champ) continue;
    const list = placed.get(n) ?? [];
    if (list.some((x) => x.team === s.team)) continue;
    list.push({ team: s.team, w: s.w, l: s.l });
    placed.set(n, list);
  }
  const used = new Set([...placed.values()].flat().map((x) => x.team));
  for (let place = 1; place <= 3; place++) {
    if (placed.has(place)) continue;
    if (!champ) break;
    const next = standings.find((s) => !used.has(s.team));
    if (!next) break;
    placed.set(place, [{ team: next.team, w: next.w, l: next.l }]);
    used.add(next.team);
  }
  const rows = [];
  for (let place = 1; place <= 3; place++) {
    for (const s of placed.get(place) ?? []) {
      const rec = records.get(s.team) ?? { w: s.w, l: s.l };
      rows.push({ team: s.team, w: rec.w, l: rec.l, place });
    }
  }
  return rows;
}

const heat = await load("2026-coed-heat-stroker");
const shirts = await load("2026-t-shirt-tournament");
const ts = await teamStatus(heat.id);
const records = tournamentRecords(heat);
const r = [...(heat.divisions ?? [])]
  .filter((d) => (d.games ?? []).some((g) => !g.is_bye && g.status !== "cancelled"))
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((d) => {
    const games = d.games ?? [];
    const champ = championOf(games);
    const standings = bracketStandings(games, ts);
    return { name: d.display_name ?? d.name, podium: buildPodium(champ, standings, ts, records) };
  });

console.log("Heat finished?", isTournamentFinished(heat));
console.log("T-Shirts finished?", isTournamentFinished(shirts));
for (const col of r) {
  console.log(col.name + ":", col.podium.map((p) => `${p.place} ${p.team} ${p.w}-${p.l}`).join(" | "));
}

const expect = {
  Gold: [["Backwards K", 6, 0], ["Del Fuegos"], ["Speed Demons"]],
  Silver: [["GWZ"], ["The Pliggas"]],
  Bronze: [["Ball Busters"], ["J.E.T.S."]],
};
let ok = true;
if (!isTournamentFinished(heat)) {
  console.error("FAIL heat finished");
  ok = false;
}
if (isTournamentFinished(shirts)) {
  console.error("FAIL shirts unfinished");
  ok = false;
}
for (const [div, want] of Object.entries(expect)) {
  const col = r.find((c) => c.name === div);
  if (!col) {
    console.error("FAIL missing", div);
    ok = false;
    continue;
  }
  for (let i = 0; i < want.length; i++) {
    const [team, w, l] = want[i];
    const got = col.podium[i];
    if (!got || got.team !== team) {
      console.error(`FAIL ${div}#${i + 1} want ${team} got`, got);
      ok = false;
    } else if (w != null && (got.w !== w || got.l !== l)) {
      console.error(`FAIL ${div} ${team} rec ${got.w}-${got.l}`);
      ok = false;
    }
  }
}
console.log(ok ? "ALL ACCEPTANCE CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
