import {
  formatLeagueDateOnly,
  formatPlayDayLabel,
  formatTimeOfDayLabel,
} from "./league-time";
import { venueLabel } from "./director";

/** "3GG" is the column; "3" is what a director types. */
export function gamesShown(stored) {
  return String(stored ?? "").replace(/\s*GG$/i, "").trim();
}

export function gamesStored(typed) {
  const t = gamesShown(typed);
  if (!t) return null;
  return /^\d+$/.test(t) ? `${t}GG` : t;
}

export function dollars(cents) {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/** "Sat, Aug 22" or "Sat, Aug 22 – Sun, Aug 23". */
export function dateSpan(start, end) {
  const a = formatPlayDayLabel(start);
  const b = formatPlayDayLabel(end);
  if (a && b && String(start).slice(0, 10) !== String(end).slice(0, 10)) {
    return `${a} – ${b}`;
  }
  return a || b || "";
}

/**
 * Quiet lines for the Event door. Empty optional facts stay off the page
 * so a director reads what is set, not a wall of blank boxes.
 */
export function tournamentTermsLines(t) {
  const dates = dateSpan(t.start_date, t.end_date);
  const firstPitch = formatTimeOfDayLabel(t.day_start_time);
  const when = [dates, firstPitch ? `first pitch ${firstPitch}` : ""]
    .filter(Boolean)
    .join(" · ");

  const bits = [];
  const entry = dollars(t.entry_fee_cents);
  const deposit = dollars(t.deposit_cents);
  const ump = dollars(t.ump_fee_cents);
  const gg = gamesShown(t.game_guarantee);
  if (entry) bits.push(`${entry} entry`);
  if (deposit) bits.push(`${deposit} deposit`);
  if (ump) bits.push(`${ump} ump`);
  if (gg) bits.push(/^\d+$/.test(gg) ? `${gg}GG` : gg);

  const closes = formatLeagueDateOnly(t.registration_closes);

  return {
    name: String(t.name ?? "").trim() || "Untitled",
    when,
    venue: venueLabel(t.venue_name, t.venue_address),
    money: bits.join(" · "),
    closes: closes ? `Closes ${closes}` : "",
  };
}

/** One line for the Divisions play-days bar while it is shut. */
export function playDaysSummary({ startDate, endDate, divisions = [] }) {
  const start = startDate ? String(startDate).slice(0, 10) : "";
  const end = endDate ? String(endDate).slice(0, 10) : start;
  const oneDay = Boolean(start && end && start === end);
  const parents = divisions.filter((d) => !d.parentDivisionId);

  if (oneDay) {
    const label = formatPlayDayLabel(start) || start;
    return label ? `All divisions ${label}` : "Not set";
  }

  const mwDate =
    parents.find((d) => d.gender === "mens" && d.dayDate)?.dayDate ||
    parents.find((d) => d.gender === "womens" && d.dayDate)?.dayDate;
  const coedDate = parents.find((d) => d.gender === "coed" && d.dayDate)?.dayDate;
  const parts = [];
  if (mwDate) {
    parts.push(
      `${formatPlayDayLabel(String(mwDate).slice(0, 10))} Men's / Women's`
    );
  }
  if (coedDate) {
    parts.push(`${formatPlayDayLabel(String(coedDate).slice(0, 10))} Coed`);
  }
  return parts.join(" · ") || "Not set";
}
