// Every date and time a member or a director reads is rendered in the league's
// zone, never the zone the browser happens to be in. LEAGUE_TZ (lib/bracket/
// tree.js) is still the one place the zone itself is named; this module is the
// one place the arithmetic around it lives, so a screen cannot render 7 PM five
// different ways depending on who is looking at it.
//
// Two kinds of value come out of the database and they are NOT interchangeable:
//
//   1. timestamptz  (games.scheduled_time) — an absolute instant. Formatting it
//      needs a display zone. Use formatLeagueInputValue / formatLeagueShortTime.
//   2. date         (tournaments.start_date) — a calendar day with no instant in
//      it. Putting it through a Date and a zone is what turns July 1 into
//      June 30 for a viewer east of Denver. Use parseLeagueDateOnly /
//      formatLeagueDateOnly, which never build a Date at all.

import { LEAGUE_TZ } from "./bracket/tree.js";

/**
 * Normalize a time for Postgres `time` / <input type="time">.
 * Accepts "HH:MM", "HH:MM:SS", or null/"". Returns "HH:MM:SS" or null.
 */
export function normalizeTimeOfDay(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Value for <input type="time"> from a DB time string. */
export function timeInputValue(value) {
  const n = normalizeTimeOfDay(value);
  return n ? n.slice(0, 5) : "";
}

/** "8:00 AM" style label from a time string. Empty → "". */
export function formatTimeOfDayLabel(value) {
  const n = normalizeTimeOfDay(value);
  if (!n) return "";
  const [hs, ms] = n.split(":");
  let h = Number(hs);
  const min = ms;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

/** "8:00 AM – 5:00 PM" or single-sided. */
export function formatTimeWindowLabel(from, until) {
  const a = formatTimeOfDayLabel(from);
  const b = formatTimeOfDayLabel(until);
  if (a && b) return `${a} – ${b}`;
  if (a) return `from ${a}`;
  if (b) return `until ${b}`;
  return "";
}

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TZ,
  hourCycle: "h23",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** League-zone wall-clock fields for an instant, or null if it isn't one. */
function leagueParts(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  // hourCycle h23 should never emit 24, but a stray engine that does would
  // otherwise produce "24:00" in a datetime-local value and blank the input.
  p.hour = String(Number(p.hour) % 24).padStart(2, "0");
  return p;
}

/**
 * The league zone's offset from UTC, in milliseconds, at a given instant.
 * DST-aware without a table or a library: ask Intl what the wall clock reads
 * in Denver at that instant, read that back as if it were UTC, and the gap
 * between the two IS the offset. -6h in July, -7h in January.
 */
function leagueOffsetMs(date) {
  const p = leagueParts(date);
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asIfUtc - date.getTime();
}

/**
 * An instant → the "YYYY-MM-DDTHH:mm" a <input type="datetime-local"> wants,
 * in league time. The inverse of parseLeagueInputValue; the two must always be
 * changed together or a director sees one time and saves another.
 */
export function formatLeagueInputValue(iso) {
  const p = leagueParts(iso);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : "";
}

/** "HH:MM" for <input type="time">, league zone. */
export function formatLeagueTimeInputValue(iso) {
  const p = leagueParts(iso);
  return p ? `${p.hour}:${p.minute}` : "";
}

/**
 * Division play day, or the tournament date when it is a one-day event.
 * YYYY-MM-DD or null.
 */
export function knownPlayDay(division) {
  const own = String(division?.day_date ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  const t = division?.tournaments ?? {};
  const start = String(t.start_date ?? division?.tournamentStart ?? "").slice(0, 10);
  const end = String(t.end_date ?? division?.tournamentEnd ?? start).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start === end) return start;
  return null;
}

/** Input value for a game when: time-only if playDay is known, else datetime-local. */
export function formatGameWhenInput(iso, playDay) {
  return playDay ? formatLeagueTimeInputValue(iso) : formatLeagueInputValue(iso);
}

/**
 * Combine a known YYYY-MM-DD play day with an "HH:MM" time as league wall
 * clock. Without a play day, `value` is a datetime-local string.
 */
export function parseGameWhenInput(value, playDay) {
  if (!value) return null;
  if (playDay) {
    const t = timeInputValue(value) || String(value).trim().slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(t)) return null;
    return parseLeagueInputValue(`${String(playDay).slice(0, 10)}T${t}`);
  }
  return parseLeagueInputValue(value);
}

/**
 * A "YYYY-MM-DDTHH:mm" from a datetime-local input, read as LEAGUE-zone wall
 * time → the instant it names. Returns null on anything unparseable.
 *
 * Two passes. The first guesses the offset by measuring it at the naive
 * instant; the second re-measures at the corrected one. That second pass is
 * what makes the twice-yearly changeover right, when the offset at the guess
 * and the offset at the answer are not the same number.
 */
export function parseLeagueInputValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const wallAsUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = wallAsUtc - leagueOffsetMs(new Date(wallAsUtc));
  const settled = wallAsUtc - leagueOffsetMs(new Date(first));
  return new Date(settled);
}

/** An instant → the dense "Sat 7:30p" chip label, in league time. */
export function formatLeagueShortTime(iso, empty = "TBD") {
  const p = leagueParts(iso);
  if (!p) return empty;
  const h24 = Number(p.hour);
  const hour = h24 % 12 || 12;
  const minute = Number(p.minute);
  const mins = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${p.weekday} ${hour}${mins}${h24 < 12 ? "a" : "p"}`;
}

/**
 * A calendar-date string ("YYYY-MM-DD") → its year/month/day, by reading the
 * string. No Date, no zone, so a tournament that starts on July 1 starts on
 * July 1 for every viewer on earth.
 */
export function parseLeagueDateOnly(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? ""));
  return m ? { year: +m[1], month: +m[2] - 1, day: +m[3] } : null;
}

/** A calendar-date string → "July 1, 2026". */
export function formatLeagueDateOnly(dateStr) {
  const p = parseLeagueDateOnly(dateStr);
  return p ? `${MONTH_LONG[p.month]} ${p.day}, ${p.year}` : "";
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** An instant → "Aug 10, 2026, 7:14 PM MT" in league time. */
export function formatLeagueDateTime(iso, empty = "") {
  const p = leagueParts(iso);
  if (!p) return empty;
  const month = MONTH_SHORT[Number(p.month) - 1] || p.month;
  let h = Number(p.hour);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${month} ${Number(p.day)}, ${p.year}, ${h}:${p.minute} ${ampm} MT`;
}

/** An instant → compact "Aug 10, 7:14p" in league time. */
export function formatLeagueSignedAt(iso, empty = "") {
  const p = leagueParts(iso);
  if (!p) return empty;
  const month = MONTH_SHORT[Number(p.month) - 1] || p.month;
  const h24 = Number(p.hour);
  const hour = h24 % 12 || 12;
  const minute = Number(p.minute);
  const mins = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${month} ${Number(p.day)}, ${hour}${mins}${h24 < 12 ? "a" : "p"}`;
}

/**
 * Division play-day display for lobby cards / director chips.
 * "Sat, Aug 22" — matches historical day_label style. Zone-safe: UTC noon.
 */
export function formatPlayDayLabel(dateStr) {
  const p = parseLeagueDateOnly(dateStr);
  if (!p) return null;
  const d = new Date(Date.UTC(p.year, p.month, p.day, 12, 0, 0));
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const month = d.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${weekday}, ${month} ${p.day}`;
}
