/**
 * Helpers for the home poster carousel: short division codes + gender groups.
 * Codes are DIVISION initials (G/S/B brackets, O/D/E/R classes, U/L), not place medals.
 */

import { isRealPoster } from "@/lib/data";
import { isRegistrationOpen } from "@/lib/tournament-state";
import { venueParts } from "@/lib/director";

/** @returns {{ code: string, tint: 'g'|'s'|'b'|null }} */
export function shortDivisionCode(divisionName) {
  const raw = String(divisionName ?? "").trim();
  const n = raw.toLowerCase();

  // Whole name is a known short label
  if (/^gold$/i.test(raw)) return { code: "G", tint: "g" };
  if (/^silver$/i.test(raw)) return { code: "S", tint: "s" };
  if (/^bronze$/i.test(raw)) return { code: "B", tint: "b" };
  if (/^open$/i.test(raw)) return { code: "O", tint: null };
  if (/^rec$/i.test(raw)) return { code: "R", tint: null };
  if (/^upper$/i.test(raw)) return { code: "U", tint: null };
  if (/^lower$/i.test(raw)) return { code: "L", tint: null };
  if (/^[de]$/i.test(raw)) return { code: raw.toUpperCase(), tint: null };

  // "Men's D", "Coed E", "Women's Upper", "Coed Gold"
  const last = raw.split(/\s+/).pop() ?? raw;
  if (/^(gold|silver|bronze|open|rec|upper|lower|[de])$/i.test(last)) {
    return shortDivisionCode(last);
  }

  // Fallback: first letter of last token
  return { code: (last[0] || "?").toUpperCase(), tint: null };
}

/** @returns {'w'|'m'|'c'} */
export function genderKeyFromDivisionName(divisionName) {
  const n = String(divisionName ?? "").toLowerCase();
  if (n.includes("women")) return "w";
  if (n.includes("coed") || n.includes("co-ed")) return "c";
  if (n.includes("men") || n.includes("mens")) return "m";
  // Bracket-only names (Gold/Silver/Bronze) under a coed weekend → coed
  if (/^(gold|silver|bronze)$/i.test(String(divisionName).trim())) return "c";
  // Class-only (Open/D/E/Rec) without gender prefix → men by convention
  if (/^(open|rec|[de])$/i.test(String(divisionName).trim())) return "m";
  if (/upper|lower/.test(n)) return "w";
  return "c";
}

/** YYYY-MM-DD end (or start) for date comparisons. */
function eventEndDate(t) {
  return String(t?.end_date ?? t?.start_date ?? "").slice(0, 10) || null;
}

/**
 * Still on the calendar: end date is today or later (league “today”).
 * Prefer this over games-finished alone — past events with no box score
 * still count as past.
 */
export function isUpcomingEvent(t, today) {
  if (t?.is_placeholder) return false;
  const end = eventEndDate(t);
  return Boolean(end && today && end >= today);
}

/**
 * Next tournament in a list for a region (or global): soonest upcoming
 * with a real poster. Sorted by start_date ascending.
 */
export function nextTournament(list, today) {
  return (list ?? [])
    .filter((t) => isUpcomingEvent(t, today) && isRealPoster(t) && !t.is_placeholder)
    .slice()
    .sort((a, b) => {
      const da = String(a.start_date ?? "");
      const db = String(b.start_date ?? "");
      return da < db ? -1 : da > db ? 1 : 0;
    })[0] ?? null;
}

/**
 * Build carousel slides from region groups that already have
 * finished + champions from withArchiveSummaries.
 *
 * Order: **next / upcoming first** (by start), then completed (most recent first).
 * Carousel centers on index 0 = next for the current filter.
 */
export function buildPosterDeckSlides(seasonGroups, { today, formatWhen }) {
  const all = (seasonGroups ?? []).flatMap((g) =>
    (g.tournaments ?? []).map((t) => ({
      ...t,
      region: g.region ?? t.region,
      regionLabel: g.label,
    }))
  );

  const withPosters = all.filter((t) => isRealPoster(t) && !t.is_placeholder);

  const slides = withPosters
    .map((t) => {
      const pastByDate = !isUpcomingEvent(t, today);
      // Done if games settled OR the calendar date has passed
      const finished = Boolean(t.finished) || pastByDate;
      const lines = t.champions ?? [];
      const championGroups = { w: [], m: [], c: [] };
      const flat = [];
      for (const line of lines) {
        const { code, tint } = shortDivisionCode(line.divisionName);
        const row = {
          code,
          tint,
          team: line.team,
          divisionName: line.divisionName,
        };
        flat.push(row);
        const gk = genderKeyFromDivisionName(line.divisionName);
        championGroups[gk].push(row);
      }

      const regOpen = !finished && isRegistrationOpen(t);
      let registerHref = null;
      if (regOpen) {
        registerHref = t.registration_url
          ? t.registration_url
          : `/register?tournament=${encodeURIComponent(t.slug)}`;
      }

      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        region: t.region ?? null,
        startDate: t.start_date ?? null,
        posterUrl: t.poster_url,
        when: formatWhen(t.start_date, t.end_date),
        // Short venue for captions ("Canyons", not full sports-complex string)
        where:
          venueParts(t.venue_name, t.venue_address).name || t.venue_name || null,
        finished,
        champions: flat,
        championGroups,
        registerHref,
        externalRegister: Boolean(t.registration_url && regOpen),
      };
    })
    .sort((a, b) => {
      // Upcoming first (soonest start), then finished (latest first)
      if (a.finished !== b.finished) return a.finished ? 1 : -1;
      const da = String(a.startDate ?? "");
      const db = String(b.startDate ?? "");
      if (!a.finished) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    });

  return slides;
}
