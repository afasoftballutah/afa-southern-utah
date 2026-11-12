// Desktop Path view stats (JD, 2026-11-12): fewest / most games left to
// win the division, and how many teams are still playing. The if-necessary
// game counts only when it is actually required — if the undefeated
// (winners-bracket) team wins the first final, the if-game is not played.

import { pathGraph, CHAMP } from "@/lib/mcp/path-map";
import { waitingGame } from "@/lib/mcp/field-grid";
import { playsIn, teamNextGame, fromScheduleRows } from "@/lib/team-games";
import { divisionFamily } from "@/lib/team-feed";
import { isRealTeamName } from "@/lib/bracket/standings";

const norm = (n) => String(n ?? "").trim().toLowerCase();

export function isScoredFinal(row) {
  return (
    Boolean(row?.isFinal || row?.status === "final") &&
    typeof row?.score1 === "number" &&
    typeof row?.score2 === "number" &&
    row.score1 !== row.score2
  );
}

function familyOf(divisions, divisionId) {
  return divisionFamily(divisions, divisionId) ?? (divisionId ? new Set([divisionId]) : null);
}

function inFamily(row, family) {
  return !family || family.has(row.divisionId);
}

/** Wins and losses so far, from real final scores only. */
export function priorRecord(rows, team, family) {
  let w = 0;
  let l = 0;
  let last = null;
  const mine = (rows ?? []).filter((r) => inFamily(r, family) && playsIn(r, team) && isScoredFinal(r));
  mine.sort((a, b) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)));
  for (const row of mine) {
    const us = norm(row.team1) === norm(typeof team === "string" ? team : team?.name) ? 1 : 2;
    const won = us === 1 ? row.score1 > row.score2 : row.score2 > row.score1;
    if (won) w += 1;
    else l += 1;
    last = { row, won };
  }
  return { w, l, last };
}

/**
 * The next game this team still has to play: an unplayed game that already
 * names them, or the game their last final sent them to (Winner/Loser of).
 * Null when they have nothing left.
 */
export function pathStart(rows, team, family) {
  const mine = (rows ?? []).filter((r) => inFamily(r, family) && playsIn(r, team));
  const nextId = teamNextGame(fromScheduleRows(mine), team);
  if (nextId) return rows.find((r) => r.id === nextId) ?? null;
  const { last } = priorRecord(rows, team, family);
  if (!last) return null;
  return waitingGame(last.row, last.won, rows);
}

/**
 * Lengths of every still-reachable path from `start` to the title.
 * `priorLosses` are already on the team's record. The first final (the
 * game with an if-necessary child) awards the title on a win only when
 * the team is still undefeated; otherwise they must also win the if-game.
 * An undefeated team that loses the first final continues in the if-game.
 */
export function titlePathLengths(start, rows, priorLosses = 0) {
  if (!start) return [];
  const g = pathGraph(start, rows);
  const lengths = [];
  const walk = (label, losses, games) => {
    const outs = g.edges.filter((e) => e.from === label);
    const ifEdge = outs.find((e) => e.kind === "if" && e.to !== CHAMP);
    const champ = outs.find((e) => e.to === CHAMP);
    if (ifEdge) {
      if (losses === 0) {
        lengths.push(games);
        walk(ifEdge.to, losses + 1, games + 1);
      } else {
        walk(ifEdge.to, losses, games + 1);
      }
      return;
    }
    if (champ) {
      lengths.push(games);
      return;
    }
    for (const e of outs) {
      if (e.to === CHAMP) continue;
      walk(e.to, e.kind === "loss" ? losses + 1 : losses, games + 1);
    }
  };
  walk(start.label, priorLosses, 1);
  return lengths;
}

function wonTitle(last, priorLossesBeforeLast) {
  if (!last?.won) return false;
  const f = last.row.flow ?? {};
  if (f.winner?.place !== "🏆") return false;
  // Winning the first final only crowns an undefeated team; otherwise the
  // if-game is still required (and would be `last` if they already won it).
  if (f.ifGame && priorLossesBeforeLast > 0) return false;
  return true;
}

/** W-L and runs from scored finals only. */
export function divisionRecords(rows, family) {
  const by = new Map();
  const add = (name) => {
    if (!isRealTeamName(name)) return null;
    const key = norm(name);
    if (!by.has(key)) by.set(key, { team: name, w: 0, l: 0, rf: 0, ra: 0 });
    return by.get(key);
  };
  for (const row of rows ?? []) {
    if (!inFamily(row, family)) continue;
    const a = add(row.team1);
    const b = add(row.team2);
    if (!isScoredFinal(row) || !a || !b) continue;
    a.rf += row.score1;
    a.ra += row.score2;
    b.rf += row.score2;
    b.ra += row.score1;
    if (row.score1 > row.score2) {
      a.w += 1;
      b.l += 1;
    } else {
      b.w += 1;
      a.l += 1;
    }
  }
  // Teams that appear only on unplayed games still belong in the field.
  for (const row of rows ?? []) {
    if (!inFamily(row, family)) continue;
    add(row.team1);
    add(row.team2);
  }
  return [...by.values()];
}

function placeOfLastLoss(rows, team, family) {
  const { last } = priorRecord(rows, team, family);
  if (!last || last.won) return null;
  return last.row.flow?.loser?.place ?? null;
}

/**
 * Stats for the desktop Path view: min / max games left to win the
 * division, teams still playing, and standings of teams that are done.
 */
export function pathStats(rows, team, divisions = []) {
  if (!team?.name || !rows?.length) return null;
  const family = familyOf(divisions, team.divisionId);
  const { w, l, last } = priorRecord(rows, team, family);
  const start = pathStart(rows, team, family);
  const lossesBeforeLast = last ? l - (last.won ? 0 : 1) : 0;
  const champion = !start && wonTitle(last, lossesBeforeLast);
  const eliminated = !start && !champion;
  const lengths = start ? titlePathLengths(start, rows, l) : champion ? [0] : [];
  const min = lengths.length ? Math.min(...lengths) : null;
  const max = lengths.length ? Math.max(...lengths) : null;

  const field = divisionRecords(rows, family);
  const done = [];
  const remaining = [];
  for (const rec of field) {
    const t = { name: rec.team, divisionId: team.divisionId };
    const theirStart = pathStart(rows, t, family);
    const theirRec = priorRecord(rows, t, family);
    const before = theirRec.last ? theirRec.l - (theirRec.last.won ? 0 : 1) : 0;
    const isChamp = !theirStart && wonTitle(theirRec.last, before);
    const isDone = !theirStart && !isChamp;
    const row = {
      ...rec,
      record: `${rec.w}-${rec.l}`,
      place: isChamp ? "Champion" : placeOfLastLoss(rows, t, family),
    };
    if (isDone || isChamp) done.push(row);
    else remaining.push(row);
  }
  const byPlace = (a, b) => {
    const na = a.place && a.place !== "Champion" ? Number(String(a.place).match(/\d+/)?.[0]) : a.place === "Champion" ? 1 : Infinity;
    const nb = b.place && b.place !== "Champion" ? Number(String(b.place).match(/\d+/)?.[0]) : b.place === "Champion" ? 1 : Infinity;
    return na - nb || b.w - a.w || a.l - b.l || a.ra - b.ra || a.team.localeCompare(b.team);
  };
  done.sort(byPlace);
  remaining.sort((a, b) => a.team.localeCompare(b.team));

  return {
    team: team.name,
    champion,
    eliminated,
    record: `${w}-${l}`,
    min,
    max,
    teamsRemaining: remaining.length,
    remaining,
    eliminated: eliminated,
    done: done.filter((t) => t.team !== team.name || !champion).concat(done.filter((t) => t.team === team.name && champion)),
    // Popup: teams that are done (eliminated, plus a champion once decided).
    // JD asked for standings of teams that are done.
    finished: done,
  };
}
