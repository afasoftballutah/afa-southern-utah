import { championOf } from "@/lib/bracket/if-game";
import { poolFinishOrder } from "@/lib/bracket/seed";
import { isTournamentFinished } from "@/lib/tournament-state";

/**
 * Champion headlines for a tournament card / archive index.
 * One line per division that produced a champion, in sort_order.
 * Pure — needs games/pool_games already on the tournament row.
 *
 * @returns {Array<{ team: string, divisionName: string, sortOrder: number }>}
 */
export function deriveChampionLines(tournament) {
  if (!tournament || !isTournamentFinished(tournament)) return [];
  const divisions = [...(tournament.divisions ?? [])].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name);
  });

  const bracketDivisions = divisions.filter((d) =>
    (d.games ?? []).some((g) => !g.is_bye && g.status !== "cancelled")
  );

  const lines = [];
  if (bracketDivisions.length === 0) {
    // Pool-only: pool winners, still ordered by the division they sit under.
    for (const d of divisions) {
      const poolGames = d.pool_games ?? [];
      if (poolGames.length === 0) continue;
      const byPool = {};
      for (const g of poolGames) (byPool[g.pool] ??= []).push(g);
      for (const letter of Object.keys(byPool).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      )) {
        const { standings } = poolFinishOrder(byPool[letter]);
        for (const s of (standings ?? []).filter((row) => row.rank === 1)) {
          lines.push({
            team: s.team,
            divisionName: "Pool " + letter,
            sortOrder: d.sort_order ?? 0,
          });
        }
      }
    }
    return lines;
  }

  for (const d of bracketDivisions) {
    const champ = championOf(d.games ?? []);
    if (!champ) continue;
    lines.push({
      team: champ,
      divisionName: d.display_name ?? d.name,
      sortOrder: d.sort_order ?? 0,
    });
  }
  return lines;
}

/** Cap champion lines at three, with a leftover count for "+N more". */
export function capChampionLines(lines, cap = 3) {
  const list = lines ?? [];
  return {
    lines: list.slice(0, cap),
    more: Math.max(0, list.length - cap),
  };
}
