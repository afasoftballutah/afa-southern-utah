// Bracket standings: records from the games, finish labels from team_status
// when the QuickScores sync (or equivalent) wrote them.
//
// Settled places sort first; teams still playing sit above anyone already
// out and show no finish rank. Shared by the division standings panel and
// the tournament archive podium.

const SEED_PLACEHOLDER = /^\[?[A-I] #\d+\]?$/;
const PROVENANCE_PREFIX = /^(Winner|Loser) of Game/;

export function isRealTeamName(name) {
  if (!name) return false;
  if (SEED_PLACEHOLDER.test(name)) return false;
  if (PROVENANCE_PREFIX.test(name)) return false;
  return true;
}

/**
 * @param {Array} games  one bracket's games
 * @param {Object} teamStatus  team_name -> { state, placement, ... }
 * @returns {Array<{ team, w, l, finish: null|{ label, n } }>}
 */
export function bracketStandings(games, teamStatus = {}) {
  const byTeam = new Map();
  const add = (name) => {
    if (!isRealTeamName(name)) return null;
    if (!byTeam.has(name)) byTeam.set(name, { team: name, w: 0, l: 0 });
    return byTeam.get(name);
  };
  for (const g of games ?? []) {
    const a = add(g.team1_name);
    const b = add(g.team2_name);
    if (g.status !== "final" || g.team1_score === null || g.team2_score === null) continue;
    if (!a || !b || g.team1_score === g.team2_score) continue;
    const [win, lose] = g.team1_score > g.team2_score ? [a, b] : [b, a];
    win.w += 1;
    lose.l += 1;
  }

  const placeOf = (t) => {
    const st = teamStatus[t];
    if (!st) return null;
    if (st.state === "champion") return { label: st.placement || "Champion", n: 1 };
    const n = st.placement ? Number(String(st.placement).match(/\d+/)?.[0]) : null;
    return Number.isFinite(n) ? { label: st.placement, n } : null;
  };

  return [...byTeam.values()]
    .map((t) => ({ ...t, finish: placeOf(t.team) }))
    .sort((x, y) => {
      if (!x.finish && !y.finish) return y.w - x.w || x.l - y.l || x.team.localeCompare(y.team);
      if (!x.finish) return -1;
      if (!y.finish) return 1;
      return x.finish.n - y.finish.n || x.team.localeCompare(y.team);
    });
}
