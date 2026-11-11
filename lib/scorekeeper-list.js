import { isPlayableGame, isStillToPlay } from "./tournament-state.js";
import { mootIfRounds } from "./bracket/if-game.js";
import { isWaitingSlot, slotLabel, sourceLabeler } from "./slot-label.js";
import {
  fieldDisplayName,
  compareFields,
  localParts,
  divisionTone,
} from "./schedule-timeline.js";
import { clockTime, withZone, resolveTimeZone } from "./zone.js";
import { DIVISION_TONES } from "./division-tones.js";

const WEEKDAY_SHORT = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

/** True only when both sides are real teams, not empty or Winner/Loser G# slots. */
export function bothTeamsReady(game) {
  return !isWaitingSlot(game?.team1_name) && !isWaitingSlot(game?.team2_name);
}

/**
 * Field label for the scorekeeper. Uses the same spelling as the Timeline
 * (H → Hunter, P → Pioneer). A stored "Hunter F1" stays "Hunter F1". A bare
 * "F2" or "Field 2" is left as stored — this does not guess a park.
 */
export function scorekeeperFieldName(field) {
  const raw = String(field ?? "").trim();
  return raw ? fieldDisplayName(raw) : null;
}

/**
 * Slider label: first letter of the park plus the field number.
 * "Hunter F1" / "H1" → "H1", "Pioneer F2" → "P2". A field with no park
 * ("F2", "Field 4") is left as stored — this does not guess a park.
 */
export function scorekeeperFieldAbbrev(field) {
  const name = scorekeeperFieldName(field);
  if (!name) return null;
  const m = /^(.*?)\s+(?:field|f)\s*#?\s*(\d+)$/i.exec(name);
  const park = m?.[1]?.trim();
  if (park) return `${park[0].toUpperCase()}${m[2]}`;
  return name;
}


/**
 * Two-letter scorekeeper mark: first letter of the gender plus first
 * letter of the class. "Men's D" → "MD", "Coed Rec" → "CR", "Women's E" → "WE".
 */
export function scorekeeperDivisionAbbrev(divisionName) {
  const s = String(divisionName ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const gender = /women/.test(lower) ? "W" : /\bmen/.test(lower) ? "M" : /coed/.test(lower) ? "C" : null;
  const klass = /\brec\b/.test(lower)
    ? "R"
    : /\bopen\b/.test(lower)
    ? "O"
    : /\bupper\b/.test(lower)
    ? "U"
    : /\blower\b/.test(lower)
    ? "L"
    : (lower.match(/\b([a-e])\b(?!.*\b[a-e]\b)/)?.[1]?.toUpperCase() ?? null);
  if (gender && klass) return `${gender}${klass}`;
  if (gender) return gender;
  if (klass) return klass;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0].toUpperCase()).join("").slice(0, 3);
  return s.slice(0, 2).toUpperCase();
}

function channel(hex, i) {
  const v = parseInt(String(hex).replace("#", "").slice(i, i + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function contrastWithWhite(hex) {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return 21;
  const L = 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
  return 1.05 / (L + 0.05);
}

/** True when white text would wash out on this tone's solid fill. */
export function scorekeeperToneNeedsDarkInk(tone) {
  const solid = DIVISION_TONES[tone]?.solid ?? DIVISION_TONES.other.solid;
  return contrastWithWhite(solid) < 3;
}

export function gameNumber(game, kind) {
  return kind === "pool" ? (game.pool ?? "—") : game.round;
}

function dayLabel(parts) {
  if (!parts) return null;
  return WEEKDAY_SHORT[parts.weekday] ?? parts.weekday;
}

/** "Thu 2 PM PST" in the tournament zone; whole hours have no ":00". */
export function scorekeeperWhen(scheduledTime, timeZone) {
  if (!scheduledTime) return "";
  const tz = resolveTimeZone(timeZone);
  const d = new Date(scheduledTime);
  if (Number.isNaN(d.getTime())) return "";
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  return withZone(`${dow} ${clockTime(d, tz)}`, d, tz);
}

/** "Thu 2 PM" / "Thu 10:30 AM" — no zone; Worlds PST is labeled once on the page. */
export function scorekeeperWhenPill(scheduledTime, timeZone) {
  if (!scheduledTime) return "";
  const tz = resolveTimeZone(timeZone);
  const d = new Date(scheduledTime);
  if (Number.isNaN(d.getTime())) return "";
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  return `${dow} ${clockTime(d, tz)}`;
}

const WEEKDAY_MARK = {
  Sunday: "Su",
  Monday: "Mo",
  Tuesday: "Tu",
  Wednesday: "We",
  Thursday: "Th",
  Friday: "Fr",
  Saturday: "Sa",
};

/**
 * Compact badge time: 2-letter day plus the 12-hour clock, no am/pm.
 * "Th1", "Th10", "Fr9:30". Whole hours drop :00.
 */
export function scorekeeperWhenMark(scheduledTime, timeZone) {
  if (!scheduledTime) return null;
  const tz = resolveTimeZone(timeZone);
  const parts = localParts(scheduledTime, tz);
  if (!parts) return null;
  const day = WEEKDAY_MARK[parts.weekday] ?? String(parts.weekday ?? "").slice(0, 2);
  const h24 = Math.floor(parts.minutes / 60);
  const min = parts.minutes % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const clock = min === 0 ? String(h) : `${h}:${String(min).padStart(2, "0")}`;
  return {
    label: `${day}${clock}`,
    day,
    clock,
    hasMinutes: min !== 0,
  };
}

/**
 * Playable games that already have both teams, across every division, sorted
 * by start time then game number. Waiting slots, byes, cancelled games, and
 * moot if-games are left off — there is nothing to score.
 */
export function buildScorekeeperCatalog(divisions, timeZone) {
  const tz = resolveTimeZone(timeZone);
  const out = [];
  for (const d of divisions ?? []) {
    const divisionLabel = d.display_name ?? d.name ?? "Division";
    const tone = divisionTone(divisionLabel);
    const pool = d.pool_games ?? [];
    const bracket = d.games ?? [];
    const moot = mootIfRounds(bracket);
    const labelFor = sourceLabeler(bracket);

    const push = (game, kind, mootRounds) => {
      if (!isPlayableGame(game, mootRounds)) return;
      if (!bothTeamsReady(game)) return;
      const parts = game.scheduled_time ? localParts(game.scheduled_time, tz) : null;
      const number = gameNumber(game, kind);
      const team1From =
        kind === "bracket"
          ? labelFor(game.team1_source_game_id, game.team1_source_result)
          : null;
      const team2From =
        kind === "bracket"
          ? labelFor(game.team2_source_game_id, game.team2_source_result)
          : null;
      out.push({
        id: game.id,
        game,
        kind,
        divisionId: d.id,
        divisionLabel,
        divisionAbbrev: scorekeeperDivisionAbbrev(divisionLabel),
        tone,
        toneInkDark: scorekeeperToneNeedsDarkInk(tone),
        fieldName: scorekeeperFieldName(game.field),
        fieldAbbrev: scorekeeperFieldAbbrev(game.field),
        number,
        open: isStillToPlay(game, mootRounds),
        scored: game.status === "final",
        dayKey: parts?.dayKey ?? null,
        dayLabel: dayLabel(parts),
        whenLabel: scorekeeperWhen(game.scheduled_time, tz),
        whenPill: scorekeeperWhenPill(game.scheduled_time, tz),
        whenMark: scorekeeperWhenMark(game.scheduled_time, tz),
        sortKey: `${game.scheduled_time ?? "9999-99-99"}|${String(number).padStart(4, "0")}`,
        team1Label: slotLabel(game.team1_name, team1From),
        team2Label: slotLabel(game.team2_name, team2From),
      });
    };

    for (const game of pool) push(game, "pool", null);
    for (const game of bracket) push(game, "bracket", moot);
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return out;
}

export function scorekeeperFieldOptions(catalog) {
  const map = new Map();
  for (const row of catalog) {
    if (!row.fieldName) continue;
    if (!map.has(row.fieldName)) map.set(row.fieldName, { key: row.fieldName, open: 0 });
    if (row.open) map.get(row.fieldName).open += 1;
  }
  return [...map.values()].sort((a, b) => compareFields(a.key, b.key));
}

export function scorekeeperDayOptions(catalog) {
  const map = new Map();
  for (const row of catalog) {
    if (!row.dayKey) continue;
    if (!map.has(row.dayKey)) {
      map.set(row.dayKey, { key: row.dayKey, label: row.dayLabel, open: 0 });
    }
    if (row.open) map.get(row.dayKey).open += 1;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function filterScorekeeperCatalog(catalog, { field = "all", day = "all" } = {}) {
  return catalog.filter((row) => {
    if (field !== "all" && row.fieldName !== field) return false;
    if (day !== "all" && row.dayKey !== day) return false;
    return true;
  });
}

/** Index of the first game that still needs a score, or -1. */
export function firstOpenIndex(rows) {
  return rows.findIndex((row) => row.open);
}

export function defaultDayKey(catalog) {
  const days = scorekeeperDayOptions(catalog);
  if (days.length <= 1) return "all";
  const open = catalog.find((row) => row.open && row.dayKey);
  return open?.dayKey ?? days[0].key;
}

export const FIELD_STORAGE_PREFIX = "afa-scorekeeper-field:";

export function fieldStorageKey(tournamentId) {
  return `${FIELD_STORAGE_PREFIX}${tournamentId || "default"}`;
}
