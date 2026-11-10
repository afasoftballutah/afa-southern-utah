// The time zone a tournament's games are played and shown in.
//
// The league is Mountain Time (St. George), so America/Denver is the default
// and every tournament without tournaments.timezone renders exactly as it
// always has: no zone label. A tournament played elsewhere (the AFA World
// Series in Mesquite, NV — Pacific) sets tournaments.timezone to its IANA
// name; its times render in that zone and carry the zone's short name
// ("2 PM PST") so nobody reads them as league time.
//
// No imports: lib/bracket/tree.js and lib/league-time.js both build on this.

/** DST-aware Mountain. Never Phoenix (no DST). */
export const LEAGUE_TZ = "America/Denver";

const valid = new Map();

/** A usable IANA zone name, or LEAGUE_TZ. Never throws. */
export function resolveTimeZone(tz) {
  const name = String(tz ?? "").trim();
  if (!name) return LEAGUE_TZ;
  if (!valid.has(name)) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
      valid.set(name, true);
    } catch {
      valid.set(name, false);
    }
  }
  return valid.get(name) ? name : LEAGUE_TZ;
}

/** The zone this tournament's times are shown in. */
export function tournamentTimeZone(tournament) {
  return resolveTimeZone(tournament?.timezone);
}

/** True when times in this zone need a label (anything but league time). */
export function isAwayZone(tz) {
  return resolveTimeZone(tz) !== LEAGUE_TZ;
}

/**
 * Short zone name at that instant ("PST", "PDT", "MST"), or "" for league
 * time — league-time screens stay exactly as they were.
 */
export function zoneLabel(when, tz) {
  if (!isAwayZone(tz)) return "";
  const d = when instanceof Date ? when : new Date(when ?? Date.now());
  if (Number.isNaN(d.getTime())) return "";
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(tz),
    timeZoneName: "short",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/**
 * Clock time of an instant in a zone: "9 AM", "9:30 AM". Whole hours never
 * show ":00" (JD's standing rule, 2026-11-09). The one formatter every
 * game time on the site goes through.
 */
export function clockTime(when, tz) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: resolveTimeZone(tz),
  }).formatToParts(d);
  const get = (t) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return `${get("hour")}${min && min !== "00" ? ":" + min : ""} ${get("dayPeriod").toUpperCase()}`;
}

/** "Thu 4:00 PM PST" → "Thu 4 PM PST"; other minutes stay. For text already formatted. */
export function dropWholeHour(label) {
  return label ? String(label).replace(/:00(?=\s?[AP]M\b)/gi, "") : label;
}

/** "2 PM" + " PST" when away; unchanged when league time. */
export function withZone(text, when, tz) {
  const label = zoneLabel(when, tz);
  return text && label ? `${text} ${label}` : text;
}

/**
 * Zone label for a tournament as a whole (for a "Times are PST" line):
 * measured at noon on its first day. "" for league time.
 */
export function tournamentZoneLabel(tournament) {
  const tz = tournamentTimeZone(tournament);
  if (!isAwayZone(tz)) return "";
  const day = /^\d{4}-\d{2}-\d{2}/.test(String(tournament?.start_date ?? ""))
    ? `${String(tournament.start_date).slice(0, 10)}T20:00:00Z`
    : Date.now();
  return zoneLabel(day, tz);
}
