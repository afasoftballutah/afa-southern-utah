// The AFA MCP's data layer in production: the same public, anon-key reads
// the site's pages use (lib/data.js). Tests inject a fixture instead.
import {
  getSeasonListByRegion,
  getTournamentBySlug,
  getTournamentSchedule,
  getTeamStatus,
  isPublicEvent,
  canonicalRegion,
  REGION_LABEL,
} from "@/lib/data";

/** Public on the site: not a placeholder, and its own flyer or a bracket the site carries. */
export function isPublicTournament(t) {
  return Boolean(t) && !t.is_placeholder && isPublicEvent(t);
}

export function createAfaData() {
  return {
    async tournaments() {
      const groups = await getSeasonListByRegion();
      return groups.flatMap((g) => g.tournaments.map((t) => ({ ...t, regionLabel: g.label })));
    },
    async tournament(slug) {
      const t = await getTournamentBySlug(slug);
      return t ? { ...t, regionLabel: REGION_LABEL[canonicalRegion(t)] ?? null } : null;
    },
    schedule: (slug) => getTournamentSchedule(slug),
    teamStatus: (tournamentId) => getTeamStatus(tournamentId),
    isPublic: isPublicTournament,
  };
}
