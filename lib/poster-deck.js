/**
 * Helpers for the home poster carousel: short division codes + gender groups.
 * Codes are DIVISION initials (G/S/B brackets, O/D/E/R classes, U/L), not place medals.
 */

import { isRealPoster } from "@/lib/data";
import { isRegistrationOpen } from "@/lib/tournament-state";

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

/**
 * Build carousel slides from region groups that already have
 * finished + champions from withArchiveSummaries.
 */
export function buildPosterDeckSlides(seasonGroups, { today, formatWhen }) {
  const all = (seasonGroups ?? []).flatMap((g) =>
    (g.tournaments ?? []).map((t) => ({ ...t, regionLabel: g.label }))
  );

  const withPosters = all.filter((t) => isRealPoster(t) && !t.is_placeholder);

  const slides = withPosters
    .slice()
    .sort((a, b) => {
      const da = String(a.start_date ?? "");
      const db = String(b.start_date ?? "");
      return da < db ? -1 : da > db ? 1 : 0;
    })
    .map((t) => {
      const finished = Boolean(t.finished);
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
        posterUrl: t.poster_url,
        when: formatWhen(t.start_date, t.end_date),
        where: t.venue_name ?? null,
        finished,
        champions: flat,
        championGroups,
        registerHref,
        externalRegister: Boolean(t.registration_url && regOpen),
      };
    });

  return slides;
}
