// "Find my team" on a tournament page (components/FindTournamentTeam.js).
//
// JD, 2026-11-09: "highlight the division but also make it so we can click
// straight in to the team's bracket from the dropdown options. right now
// its a little confusing flow." Before, picking a result only lit up a
// division card further down the page, and you had to find and tap that
// card next. Now each result is one team in one division, and picking it
// opens that division's bracket with the team already chosen — the
// division page's TeamFinder reads the same afa-team-<slug> memory.

/**
 * Results for the search box: one per team per division, so Fallen in
 * Men's D and Fallen in Men's E are two results. Matches team or manager.
 * @param {{name: string, divisionId?: string|null, seatLabel?: string, managerNames?: string[]}[]} teams
 */
export function searchTournamentTeams(teams, query, limit = 12) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];
  const seen = new Set();
  const out = [];
  for (const t of teams ?? []) {
    const byName = t.name.toLowerCase().includes(needle);
    const byManager = (t.managerNames ?? []).some((m) =>
      String(m).toLowerCase().includes(needle)
    );
    if (!byName && !byManager) continue;
    const key = teamSearchKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** One result's identity: the team name in its division. */
export function teamSearchKey(t) {
  return `${t.name}\u0000${t.divisionId || t.seatLabel || ""}`;
}

/** The division page a result opens (its bracket), or null with no division. */
export function teamBracketHref(slug, t) {
  if (!slug || !t?.divisionId) return null;
  return `/tournaments/${slug}/division/${t.divisionId}`;
}
