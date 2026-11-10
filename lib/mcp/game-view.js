// How the AFA MCP describes one game, built only from the schedule rows the
// site already renders (lib/data.js getTournamentSchedule) and the same
// display helpers, so an assistant reads what the schedule page shows:
//   - a waiting slot is "Winner G9" / "Loser G3" (lib/slot-label.js), TBD
//     only when nothing feeds it;
//   - times in the tournament's zone, whole hours without ":00", and the
//     zone named when it is not league time ("Sun 4 PM PST" at Worlds);
//   - fields spelled out (H = Hunter, P = Pioneer).
// Public data only: team names, times, fields, scores. Never contacts.

import { formatFieldTime } from "@/lib/bracket/tree";
import { parseFeed, feedLabel, slotLabel } from "@/lib/slot-label";
import { fieldDisplayName, bracketPill, statusLabel, pillScore, nextStep } from "@/lib/schedule-timeline";
import { resolveTimeZone } from "@/lib/zone";

/** "2026-11-15" — the game's calendar day where it is played. */
export function localDay(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: resolveTimeZone(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "Sun 4 PM PST" (zone only away from league time), or null without a time. */
export function whenLabel(iso, tz) {
  return iso ? formatFieldTime({ scheduled_time: iso }, tz) : null;
}

/** A feeder corner ({ short: "W12", words }) as "Winner G12"; a seed as "Seed 3". */
export function feederLabel(x) {
  if (!x) return null;
  const f = parseFeed(x.words) ?? parseFeed(String(x.short ?? "").replace(/^([WL])(\d+)$/, "$1-G$2"));
  if (f) return feedLabel(f.result, f.game);
  const seed = /^#(\d+)$/.exec(x.short ?? "");
  return seed ? `Seed ${seed[1]}` : x.words ?? x.short ?? null;
}

/** Where the winner / loser of a game goes, in words. */
export function nextWords(x, role) {
  const s = nextStep(x, role);
  if (!s) return null;
  if (s.champion) return "Champion";
  if (s.next) return s.next;
  if (s.out) return s.place ? `Out (finishes ${s.place})` : "Out";
  if (s.place) return s.place === "2nd" ? "2nd place" : `${s.place} place`;
  return s.text ?? null;
}

/** One game for the MCP. `row` is a getTournamentSchedule row. */
export function gameView(row, tz) {
  const team1 = slotLabel(row.team1, row.team1From);
  const team2 = slotLabel(row.team2, row.team2From);
  const score = pillScore(row);
  const final = Boolean(row.isFinal || row.status === "final");
  const out = {
    id: row.id,
    game: row.label ?? null,
    division: row.divisionName ?? null,
    stage: bracketPill(row)?.label ?? null,
    team1,
    team2,
    when: whenLabel(row.scheduledTime, tz),
    day: localDay(row.scheduledTime, tz),
    startsAt: row.scheduledTime ?? null,
    field: row.field ? fieldDisplayName(row.field) : null,
    status: statusLabel(row),
  };
  if (final && typeof row.score1 === "number" && typeof row.score2 === "number") {
    out.score = `${team1} ${row.score1}, ${team2} ${row.score2}`;
    if (score) out.winner = score.winner === "team1" ? team1 : team2;
  }
  const from = (row.flow?.from ?? []).map(feederLabel);
  if (from.some(Boolean)) out.feeders = { team1: from[0] ?? null, team2: from[1] ?? null };
  if (row.flow) {
    const w = nextWords(row.flow.winner, "winner");
    const l = nextWords(row.flow.loser, "loser");
    if (w || l) out.next = { winner: w, loser: l };
    if (row.flow.rule) out.rule = row.flow.rule;
  }
  if (row.team1Place || row.team2Place) out.loserFinishes = row.team1Place ?? row.team2Place;
  return out;
}

/** Earliest first; untimed last; then field, then game label. */
export function byTime(a, b) {
  const t = (r) => (r.scheduledTime ? new Date(r.scheduledTime).getTime() : Infinity);
  return t(a) - t(b) || String(fieldDisplayName(a.field)).localeCompare(String(fieldDisplayName(b.field))) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
}
