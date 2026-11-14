import { championshipGameOf, mootIfRounds } from "./bracket/if-game.js";
import { isPlayableGame } from "./tournament-state.js";

export const RESULT_GENDER_KEYS = ["womens", "mens", "coed"];

/** True when a tournament has at least one playable final (scored) game. */
export function hasScoredFinal(tournament) {
  for (const d of tournament?.divisions ?? []) {
    const list = [...(d.games ?? []), ...(d.pool_games ?? [])];
    const moot = mootIfRounds(list);
    if (list.some((g) => isPlayableGame(g, moot) && g.status === "final")) {
      return true;
    }
  }
  return false;
}

/**
 * Most recently completed playable final in a game list, or null.
 * Prefer scheduled_time, then round, then id — never the wall clock.
 */
export function latestFinalGame(games) {
  const list = games ?? [];
  const moot = mootIfRounds(list);
  const finals = list.filter((g) => isPlayableGame(g, moot) && g.status === "final");
  if (!finals.length) return null;
  finals.sort((a, b) => {
    const ta = Date.parse(a.scheduled_time ?? "") || 0;
    const tb = Date.parse(b.scheduled_time ?? "") || 0;
    if (tb !== ta) return tb - ta;
    const ra = a.round ?? 0;
    const rb = b.round ?? 0;
    if (rb !== ra) return rb - ra;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return finals[0];
}

/**
 * Cards for home Recent Results, grouped by gender.
 * A finished division still shows its championship final. An in-progress
 * division with scores shows its most recent final game. Past/finished
 * tournaments keep the championship-only cards they have today.
 */
export function recentFinalsByGender(tournament) {
  const out = { womens: [], mens: [], coed: [] };
  if (!tournament) return out;

  const divisions = tournament.divisions ?? [];
  const byId = new Map(divisions.map((d) => [d.id, d]));

  const genderOf = (d) => {
    if (d.gender === "womens" || d.gender === "mens" || d.gender === "coed") {
      return d.gender;
    }
    if (d.parent_division_id) {
      const p = byId.get(d.parent_division_id);
      if (p?.gender === "womens" || p?.gender === "mens" || p?.gender === "coed") {
        return p.gender;
      }
      const pn = String(p?.display_name ?? p?.name ?? "").toLowerCase();
      if (pn.includes("women")) return "womens";
      if (/\bmen/.test(pn) && !pn.includes("women")) return "mens";
      if (pn.includes("coed") || pn.includes("co-ed")) return "coed";
    }
    const n = String(d.display_name ?? d.name ?? "").toLowerCase();
    if (n.includes("women")) return "womens";
    if (/\bmen/.test(n) && !n.includes("women")) return "mens";
    if (n.includes("coed") || n.includes("co-ed")) return "coed";
    return null;
  };

  const bracketRank = (name) => {
    if (/^gold$/i.test(name)) return 0;
    if (/^silver$/i.test(name)) return 1;
    if (/^bronze$/i.test(name)) return 2;
    return 10;
  };

  const candidates = [];
  for (const d of divisions) {
    const games = d.games ?? [];
    const all = [...games, ...(d.pool_games ?? [])];
    const champ = championshipGameOf(games);
    const game = champ ?? latestFinalGame(all);
    if (!game) continue;
    const gender = genderOf(d);
    if (!gender) continue;
    const name = d.display_name ?? d.name ?? "";
    candidates.push({ d, game, gender, name, championship: Boolean(champ) });
  }

  for (const key of Object.keys(out)) {
    const pool = candidates
      .filter((c) => c.gender === key)
      .sort((a, b) => {
        const br = bracketRank(a.name) - bracketRank(b.name);
        if (br !== 0) return br;
        const so = (a.d.sort_order ?? 0) - (b.d.sort_order ?? 0);
        if (so !== 0) return so;
        return a.name.localeCompare(b.name);
      });

    out[key] = pool.map((pick) => {
      const g = pick.game;
      const tint = /^gold$/i.test(pick.name)
        ? "Gold"
        : /^silver$/i.test(pick.name)
          ? "Silver"
          : /^bronze$/i.test(pick.name)
            ? "Bronze"
            : null;
      const caption = pick.name || (pick.championship ? "Championship" : "Result");
      return {
        key: pick.d.id,
        team1: g.team1_name,
        team2: g.team2_name,
        score1: g.team1_score,
        score2: g.team2_score,
        caption,
        divisionTint: tint,
        divisionName: pick.name,
        championship: pick.championship,
      };
    });
  }
  return out;
}

/** Newest start_date first, for the all-regions Recent Results list. */
export function sortResultEventsByRecency(events) {
  return (events ?? [])
    .slice()
    .sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")));
}
