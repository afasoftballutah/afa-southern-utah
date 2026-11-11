// Every game a followed team can still play (JD 2026-11-10, the MCP team
// grid's picker proposed for the site timeline): from its next game — or,
// while its name is not on the next slot yet, from where its last result
// sends it — follow the bracket flow (lib/bracket/flow.js: Winner → the
// game it feeds, Loser → the losers side, the final → the if-necessary
// game). Game numbers are per division. Pool games have no flow and reach
// nothing. A result decides a path only once it is final: a game past its
// time with no score keeps both ways open.

import { playsIn } from "@/lib/team-games";

const num = (label) => /^G(\d+)$/.exec(label ?? "")?.[1] ?? null;
const isFinal = (r) => Boolean(r.isFinal || r.status === "final") && typeof r.score1 === "number" && typeof r.score2 === "number";

/** Ids of the games `team` ({ name, divisionId }) can still play, its next game included. */
export function teamReachIds(rows, team, nextId) {
  const out = new Set();
  if (!team || !rows?.length) return out;
  const byNum = new Map();
  for (const r of rows) if (num(r.label)) byNum.set(`${r.divisionId}|${num(r.label)}`, r);
  let start = nextId ? rows.find((r) => r.id === nextId) : null;
  if (!start) {
    // Waiting: the last final sends the team to a slot that still reads "Winner G5".
    const last = rows
      .filter((r) => playsIn(r, team) && isFinal(r) && r.flow)
      .sort((a, b) => String(b.scheduledTime).localeCompare(String(a.scheduledTime)))[0];
    if (last) {
      const us = String(last.team1 ?? "").trim().toLowerCase() === String(team.name ?? team).trim().toLowerCase() ? 1 : 2;
      const won = us === 1 ? last.score1 > last.score2 : last.score2 > last.score1;
      const to = (won ? last.flow.winner : last.flow.loser)?.next;
      start = to ? byNum.get(`${last.divisionId}|${to}`) ?? null : null;
    }
  }
  const queue = start ? [start] : [];
  while (queue.length) {
    const g = queue.shift();
    if (!g || out.has(g.id)) continue;
    out.add(g.id);
    const f = g.flow ?? {};
    const ifN = /(\d+)\s*$/.exec(String(f.ifGame ?? ""))?.[1] ?? null;
    for (const n of [f.winner?.next, f.loser?.next, ifN]) {
      const r = n != null ? byNum.get(`${g.divisionId}|${n}`) : null;
      if (r) queue.push(r);
    }
  }
  return out;
}
