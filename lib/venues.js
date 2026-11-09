// Parks for a tournament played at more than one (tournaments.venues, see
// supabase/migration-2026-11-08-tournament-venues.sql). games.field names
// the park by its field_prefix: "Hunter F1", "Pioneer F3". A tournament with
// no venues list keeps its single venue_name / venue_address.

/** Google Maps search link for a place. */
export function mapSearchUrl(text) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

/** [{ name, address, field_prefix, map_url }] — empty when single-venue. */
export function tournamentVenues(tournament) {
  const list = Array.isArray(tournament?.venues) ? tournament.venues : [];
  return list
    .filter((v) => v && String(v.name ?? "").trim())
    .map((v) => ({
      name: String(v.name).trim(),
      address: v.address ? String(v.address).trim() : null,
      field_prefix: v.field_prefix ? String(v.field_prefix).trim() : null,
      map_url: v.map_url || mapSearchUrl([v.name, v.address].filter(Boolean).join(", ")),
    }));
}

/** The park a games.field belongs to, or null. */
export function venueForField(tournament, field) {
  const f = String(field ?? "").trim().toLowerCase();
  if (!f) return null;
  return (
    tournamentVenues(tournament).find((v) => {
      const p = String(v.field_prefix ?? "").toLowerCase();
      return p && (f === p || f.startsWith(`${p} `));
    }) ?? null
  );
}

/**
 * Short field label for a compact card. "Field 3" → "F3" (unchanged league
 * habit). A park prefix stays: "Hunter F1" → "Hunter F1", "Hunter Field 1" →
 * "Hunter F1", so two parks' F1s never read the same.
 */
export function shortField(field) {
  if (!field) return "";
  const s = String(field).trim();
  const m = /^(.*?)\s*\b(?:field|f)\s*#?\s*(\d+)\s*$/i.exec(s);
  if (m) return [m[1].trim(), `F${m[2]}`].filter(Boolean).join(" ");
  const d = s.match(/\d+/);
  return d ? `F${d[0]}` : s;
}
