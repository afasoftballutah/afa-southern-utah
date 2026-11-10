// The schedule's Timeline view (JD, 2026-11-09: "a graphic that shows a
// timeline and the different fields", "each game should have a pill that
// is expandable maybe, so we dont overwhelm the pill with info").
//
// Pure layout: lanes per field, one panel per day, minutes from the top
// of the panel's first hour. components/ScheduleTimeline.js draws it.

import { compactFeedLabel } from "@/lib/quickscores";

// Games are scheduled on the hour and run to the next one (the same
// length the calendar feed uses, lib/team-feed-ics.js).
export const GAME_MINUTES = 60;

// "H is hunter and P is pioneer" (JD). Stored names are already spelled
// out ("Hunter F1"); a short one ("H1", "P 2", "HF3") is spelled out here.
const PARKS = { H: "Hunter", P: "Pioneer" };
export function fieldDisplayName(field) {
  const f = String(field ?? "").trim();
  const m = /^([HP])\s*-?\s*F?\s*(\d+)$/i.exec(f);
  return m ? `${PARKS[m[1].toUpperCase()]} F${m[2]}` : f;
}

/** Park, then field number: Hunter F1–F3, then Pioneer F1–F3. */
export function compareFields(a, b) {
  const key = (f) => {
    const name = fieldDisplayName(f);
    const m = name.match(/\d+/);
    const park = m ? name.slice(0, m.index).replace(/\b(field|f)\s*#?\s*$/i, "").trim() : name;
    return [park.toLowerCase(), m ? Number(m[0]) : Number.MAX_SAFE_INTEGER, name];
  };
  const [pa, na, sa] = key(a);
  const [pb, nb, sb] = key(b);
  return pa.localeCompare(pb) || na - nb || sa.localeCompare(sb);
}

const partsCache = new Map();
function fmt(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(
      tz,
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "long",
      })
    );
  }
  return partsCache.get(tz);
}

/** Wall-clock parts of an instant in a zone. */
export function localParts(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  return {
    dayKey: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday,
    month: Number(p.month),
    day: Number(p.day),
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "8 AM", "12 PM", "1 PM". */
export function hourLabel(h) {
  const hh = ((h % 24) + 24) % 24;
  const n = hh % 12 === 0 ? 12 : hh % 12;
  return `${n} ${hh < 12 ? "AM" : "PM"}`;
}

/** "2:00 PM". */
export function clockLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${hourLabel(h).replace(" ", `:${String(m).padStart(2, "0")} `)}`;
}

/**
 * @param {Array} rows getTournamentSchedule rows (id, field, scheduledTime, …)
 * @param {string} tz IANA zone the tournament is shown in
 * @returns {{ days: Array, fields: string[], unplaced: Array, overlaps: Array }}
 */
export function buildTimeline(rows, tz, { gameMinutes = GAME_MINUTES } = {}) {
  const unplaced = [];
  const placed = [];
  for (const r of rows ?? []) {
    const at = r.scheduledTime ? localParts(r.scheduledTime, tz) : null;
    if (!at || !r.field) {
      unplaced.push(r);
      continue;
    }
    placed.push({ ...r, fieldName: fieldDisplayName(r.field), at });
  }
  const fields = [...new Set(placed.map((g) => g.fieldName))].sort(compareFields);

  const byDay = new Map();
  for (const g of placed) {
    if (!byDay.has(g.at.dayKey)) byDay.set(g.at.dayKey, []);
    byDay.get(g.at.dayKey).push(g);
  }

  const overlaps = [];
  const days = [...byDay.keys()].sort().map((dayKey) => {
    const games = byDay.get(dayKey);
    const first = Math.min(...games.map((g) => g.at.minutes));
    const last = Math.max(...games.map((g) => g.at.minutes + gameMinutes));
    const startHour = Math.floor(first / 60);
    const endHour = Math.ceil(last / 60);
    const lanes = fields.map((field) => {
      const mine = games
        .filter((g) => g.fieldName === field)
        .sort((a, b) => a.at.minutes - b.at.minutes || String(a.label).localeCompare(String(b.label)));
      for (let i = 1; i < mine.length; i++) {
        if (mine[i].at.minutes - mine[i - 1].at.minutes < gameMinutes) {
          overlaps.push({ field, a: mine[i - 1].id, b: mine[i].id, dayKey });
        }
      }
      return {
        field,
        games: mine.map((g) => ({
          ...g,
          offset: g.at.minutes - startHour * 60,
          length: gameMinutes,
        })),
      };
    });
    const { weekday, month, day } = games[0].at;
    return {
      key: dayKey,
      title: weekday,
      date: `${MONTHS[month - 1]} ${day}`,
      startHour,
      endHour,
      hours: Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
      count: games.length,
      lanes,
    };
  });
  return { days, fields, unplaced, overlaps };
}

/** One side of a game for the pill's details: name, or "W-G3" until known. */
export function sideLabel(row, n) {
  const team = row[`team${n}`];
  if (team) return { text: compactFeedLabel(team) ?? team, known: !/^[WL]-G\d+$/.test(compactFeedLabel(team) ?? "") };
  const from = row[`team${n}From`];
  if (from) return { text: compactFeedLabel(from) ?? from, known: false };
  return { text: "TBD", known: false };
}

/** "W-G3" → "Winner of G3", "L-G4" → "Loser of G4"; anything else as is. */
export function spelledSide(text) {
  const m = /^([WL])-G(\d+)$/.exec(text ?? "");
  if (!m) return text;
  return `${m[1] === "W" ? "Winner" : "Loser"} of G${m[2]}`;
}

/** Plain words for the game's state. */
export function statusLabel(row) {
  if (row.isFinal || row.status === "final") return "Final";
  if (row.status === "in_progress" || row.status === "live") return "In progress";
  if (row.status === "cancelled") return "Cancelled";
  return "Scheduled";
}

// Division tints: one family per gender (the site's navy / red / purple),
// a lighter step per level, so a glance says which division a pill is.
const TONES = {
  "mens-d": "mens-d",
  "mens-e": "mens-e",
  "mens-open": "mens-open",
  "mens-rec": "mens-rec",
  "womens-d": "womens-d",
  "womens-e": "womens-e",
  "womens-rec": "womens-rec",
  "womens-upper": "womens-d",
  "womens-lower": "womens-e",
  "coed-d": "coed-d",
  "coed-e": "coed-e",
  "coed-open": "coed-open",
  "coed-rec": "coed-rec",
};
export function divisionTone(divisionName) {
  const s = String(divisionName ?? "").toLowerCase();
  const gender = /women/.test(s) ? "womens" : /\bmen/.test(s) ? "mens" : /coed/.test(s) ? "coed" : null;
  const level = /\brec\b/.test(s)
    ? "rec"
    : /\bopen\b/.test(s)
    ? "open"
    : /\bupper\b/.test(s)
    ? "upper"
    : /\blower\b/.test(s)
    ? "lower"
    : (s.match(/\b([a-e])\b(?!.*\b[a-e]\b)/)?.[1] ?? null);
  return (gender && level && TONES[`${gender}-${level}`]) || "other";
}

/** Legend entries in a steady order: Men's, then Women's, then Coed. */
export function divisionLegend(rows) {
  const names = [...new Set((rows ?? []).map((r) => r.divisionName).filter(Boolean))];
  const rank = (n) => (/women/i.test(n) ? 1 : /\bmen/i.test(n) ? 0 : 2);
  return names
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((name) => ({ name, tone: divisionTone(name) }));
}

const GENDER_PREFIX = /^(men's|women's|coed)\s+(.+)$/i;

/**
 * The legend grouped by gender so "Men's"/"Women's" is written once:
 * [{ group: "Men's", items: [{ name: "Men's D", short: "D", tone }] }, …].
 * A division with no gender word gets its own group (group null, full name).
 */
export function divisionLegendGroups(rows) {
  const groups = [];
  for (const d of divisionLegend(rows)) {
    const m = GENDER_PREFIX.exec(d.name);
    const group = m ? m[1] : null;
    const short = m ? m[2] : d.name;
    let g = groups.find((x) => x.group != null && x.group.toLowerCase() === group?.toLowerCase());
    if (!g) groups.push((g = { group, items: [] }));
    g.items.push({ ...d, short });
  }
  return groups;
}

/** Corner text for a next step: a game gets an arrow ("→22"); a place, trophy or "pool" as is. */
export function nextShort(x) {
  if (!x?.short) return null;
  return /^\d+$/.test(x.short) ? `→${x.short}` : x.short;
}

/** "Winner → Game 22 · Loser → Game 19" for the details and the pill's label. */
export function flowWords(flow) {
  if (!flow) return null;
  if (flow.rule) return flow.rule;
  const parts = [flow.winner?.words, flow.loser?.words].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
