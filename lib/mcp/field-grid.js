// The team view's field grid (JD 2026-11-10: "all games on a huge grid with
// the six fields on y and the times on x … the paths light up depending on
// what team you choose", "appear different based on what time it is").
// Built on the site's timeline layout (lib/schedule-timeline.js
// buildTimeline: one lane per field, minutes from the day's first hour).
//
// Time-aware, and honest about late scores (JD 2026-11-10: "sometimes the
// scores are not updated promptly"): a game is done only when it has a
// final score. Past its start with no score it is "In progress" for the
// first hour and "Awaiting score" after that, and every path through it
// stays open. Only a run of hours at the start of a day where every game
// is scored folds into a band; the now line is the real time.

import { buildTimeline, divisionTone, hourLabel, localParts, pillScore } from "@/lib/schedule-timeline";
import { DIVISION_TONES } from "@/lib/division-tones";
import { gameView, whenLabel } from "./game-view";
import { pathGraph, CHAMP } from "./path-map";

const HOUR = 60 * 60_000;
const norm = (s) => String(s ?? "").trim().toLowerCase();
const noZone = (s) => (s ? s.replace(/\s+(?!AM$|PM$)[A-Z]{2,5}$/, "") : s);

/** final | live | awaiting | upcoming | cancelled — done only with a final score. */
export function gameState(row, now) {
  const scored = typeof row.score1 === "number" && typeof row.score2 === "number";
  if ((row.isFinal || row.status === "final") && scored) return "final";
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "in_progress" || row.status === "live") return "live";
  const t = row.scheduledTime ? new Date(row.scheduledTime).getTime() : NaN;
  if (Number.isFinite(t) && now.getTime() >= t) return now.getTime() < t + HOUR ? "live" : "awaiting";
  return "upcoming";
}

const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== false));

/**
 * The grid for the given days (dayKeys: Set of "2026-11-12"; all days when
 * empty): fields, divisions (name, color, page), days with their hours (an
 * opening run of all-final hours folded) and games, and the now line.
 * Games are small and refer to each other by index `i` (the payload rides
 * in structuredContent, so no ids or repeated URLs); `index` maps a game id
 * to its `i` for the team tracks. Public fields only, never contacts.
 */
export function fieldGrid(rows, tz, now, site, dayKeys = null) {
  const tl = buildTimeline(rows, tz);
  const nowAt = localParts(now.toISOString(), tz);
  const divs = [];
  const divAt = new Map();
  const index = new Map();
  const divOf = (row) => {
    const k = row.divisionId ?? row.divisionName;
    if (!divAt.has(k)) {
      const tone = DIVISION_TONES[divisionTone(row.divisionName)] ?? DIVISION_TONES.other;
      divAt.set(k, divs.length);
      divs.push({ name: row.divisionName ?? "", bg: tone.bg, ink: tone.ink, solid: tone.solid, url: `${site.siteUrl}/tournaments/${site.slug}/division/${row.divisionId}` });
    }
    return divAt.get(k);
  };
  const days = tl.days
    .filter((d) => !dayKeys?.size || dayKeys.has(d.key))
    .map((d) => {
      const games = d.lanes.flatMap((lane) =>
        lane.games.map((row) => {
          const v = gameView(row, tz);
          const state = gameState(row, now);
          const final = state === "final";
          const i = index.size;
          index.set(row.id, i);
          return drop({
            i,
            n: row.label ?? "",
            d: divOf(row),
            bs: row.bracketSide ?? null,
            t1: v.team1 ?? "TBD",
            t2: v.team2 ?? "TBD",
            s1: final ? row.score1 : null,
            s2: final ? row.score2 : null,
            sc: final ? pillScore(row)?.text ?? null : null,
            st: state,
            tm: noZone(whenLabel(row.scheduledTime, tz)),
            w: v.next?.winner ?? null,
            l: v.next?.loser ?? null,
            f: tl.fields.indexOf(lane.field),
            m: row.offset,
          });
        })
      );
      // Fold the opening run of hours in which every game has a final score.
      let fold = 0;
      for (let h = 0; h < d.hours.length; h++) {
        if (games.some((g) => g.m >= h * 60 && g.m < (h + 1) * 60 && g.st !== "final")) break;
        fold++;
      }
      if (games.some((g) => g.st !== "final") && fold === d.hours.length) fold = 0;
      if (fold < 2) fold = 0;
      return drop({
        key: d.key,
        title: `${d.title.slice(0, 3)}, ${d.date}`,
        start: d.startHour,
        hours: d.hours.length,
        fold: fold || null,
        foldLabel: !fold ? null : fold === d.hours.length ? `${d.title.slice(0, 3)} \u00b7 all final` : `${hourLabel(d.startHour)}\u2013${hourLabel(d.startHour + fold)} \u00b7 all final`,
        now: nowAt?.dayKey === d.key ? nowAt.minutes - d.startHour * 60 : null,
        games,
      });
    });
  return {
    grid: { fields: tl.fields, divs, days, now: noZone(whenLabel(now.toISOString(), tz)) },
    index,
  };
}

/**
 * One team on the grid, by game index: the games it has played and the
 * arrows between them (its actual path, drawn solid), every game it can
 * still reach from its next (or waiting) game with the win / loss / if
 * arrows, and the finish where a loss there ends its run. Edges are
 * [from, to, "w" | "l" | "if"].
 */
export function teamTrack(name, family, rows, start, index) {
  const ix = (id) => index.get(id);
  const mine = rows.filter((r) => family.has(r.divisionId) && [r.team1, r.team2].some((t) => norm(t) === norm(name)));
  const played = mine
    .filter((r) => (r.isFinal || r.status === "final") && typeof r.score1 === "number" && typeof r.score2 === "number")
    .sort((a, b) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)));
  const went = [];
  for (let i = 0; i < played.length; i++) {
    const r = played[i];
    const us = norm(r.team1) === norm(name) ? 1 : 2;
    const won = us === 1 ? r.score1 > r.score2 : r.score2 > r.score1;
    const to = played[i + 1] ?? (i === played.length - 1 ? start : null);
    if (to && ix(r.id) != null && ix(to.id) != null) went.push([ix(r.id), ix(to.id), won ? "w" : "l"]);
  }
  const reach = [];
  const edges = [];
  const out = {};
  if (start?.flow) {
    const g = pathGraph(start, rows);
    const at = new Map([...g.nodes.values()].map((n) => [n.label, ix(n.row.id)]));
    const hasIf = g.edges.some((e) => e.kind === "if");
    for (const n of g.nodes.values()) {
      const i = ix(n.row.id);
      if (i == null) continue;
      reach.push(i);
      // The final's loser place applies only from the losers side; with an
      // if-necessary game the place goes on that game instead.
      if (n.out && !(n.final && hasIf)) out[i] = n.out;
    }
    for (const e of g.edges) {
      if (e.to === CHAMP || at.get(e.from) == null || at.get(e.to) == null) continue;
      edges.push([at.get(e.from), at.get(e.to), e.kind === "win" ? "w" : e.kind === "loss" ? "l" : "if"]);
    }
  }
  return { played: played.map((r) => ix(r.id)).filter((i) => i != null), went, reach, edges, out };
}
