import { championOf, championshipGameOf, mootIfRounds } from "./bracket/if-game.js";
import { eliminationPlacings, placeLabel } from "./bracket/placing.js";
import { isPlayableGame } from "./tournament-state.js";
import { isRealTeamName } from "./bracket/standings.js";

export const RESULT_GENDER_KEYS = ["womens", "mens", "coed"];

/** Max scored games shown per gender in the Recent games view. */
export const RECENT_GAMES_CAP = 12;

export function compareFinalRecency(a, b) {
  const ta = Date.parse(a.scheduled_time ?? "") || 0;
  const tb = Date.parse(b.scheduled_time ?? "") || 0;
  if (tb !== ta) return tb - ta;
  const ra = a.round ?? 0;
  const rb = b.round ?? 0;
  if (rb !== ra) return rb - ra;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

export function gameNumberLabel(game) {
  if (game?.pool != null && game.pool !== "") return `Pool ${game.pool}`;
  if (game?.round != null && game.round !== "") return `Game ${game.round}`;
  return null;
}

function divisionGender(d, byId) {
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
}

function divisionTint(name) {
  if (/^gold$/i.test(name)) return "Gold";
  if (/^silver$/i.test(name)) return "Silver";
  if (/^bronze$/i.test(name)) return "Bronze";
  return null;
}

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
  finals.sort(compareFinalRecency);
  return finals[0];
}


const STANDINGS_MEDAL = { 1: "\u{1F3C6}", 2: "\u{1F948}", 3: "\u{1F949}" };

/**
 * W-L from scored (final, non-tie) games in this division only.
 * Includes pool play and an if-necessary game when it was actually played.
 * Unscored, cancelled, bye, and moot games do not count.
 */
export function divisionScoredRecords(division) {
  const rec = new Map();
  const touch = (name) => {
    if (!isRealTeamName(name)) return null;
    if (!rec.has(name)) rec.set(name, { team: name, w: 0, l: 0 });
    return rec.get(name);
  };
  const bracket = division?.games ?? [];
  const moot = mootIfRounds(bracket);
  for (const g of [...bracket, ...(division?.pool_games ?? [])]) {
    if (g.is_bye || g.status === "cancelled") continue;
    if (g.round != null && moot.has(g.round)) continue;
    const a = touch(g.team1_name);
    const b = touch(g.team2_name);
    if (g.status !== "final" || g.team1_score == null || g.team2_score == null) continue;
    if (!a || !b || g.team1_score === g.team2_score) continue;
    const [win, lose] = g.team1_score > g.team2_score ? [a, b] : [b, a];
    win.w += 1;
    lose.l += 1;
  }
  return rec;
}

/**
 * Final standings for a completed division, or null while the championship
 * is still open (championshipGameOf / championOf). Places come from
 * eliminationPlacings (shared labels like "5th"); 1st is the champion.
 * Does not invent places for teams the placer cannot rank.
 */
export function divisionFinalStandings(division) {
  const games = division?.games ?? [];
  const champ = championOf(games);
  if (!champ) return null;
  const format =
    (division.brackets ?? []).find((b) => (b.bracket_group ?? "main") === "main")
      ?.format ?? null;
  const placings = eliminationPlacings(games, format);
  const records = divisionScoredRecords(division);
  const byTeam = new Map();

  const add = (team, place, label, tied) => {
    if (!isRealTeamName(team) || byTeam.has(team)) return;
    const rec = records.get(team) ?? { w: 0, l: 0 };
    byTeam.set(team, {
      team,
      w: rec.w,
      l: rec.l,
      place,
      label: label ?? (place != null ? placeLabel(place) : null),
      tied: Boolean(tied),
      medal: place != null ? (STANDINGS_MEDAL[place] ?? null) : null,
    });
  };

  add(champ, 1, "1st", false);
  for (const p of placings.values()) add(p.team, p.place, p.label, p.tied);
  for (const rec of records.values()) {
    if (byTeam.has(rec.team)) continue;
    byTeam.set(rec.team, {
      team: rec.team,
      w: rec.w,
      l: rec.l,
      place: null,
      label: null,
      tied: false,
      medal: null,
    });
  }

  return [...byTeam.values()].sort((a, b) => {
    const pa = a.place ?? Number.POSITIVE_INFINITY;
    const pb = b.place ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return b.w - a.w || a.l - b.l || a.team.localeCompare(b.team);
  });
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
    const gender = divisionGender(d, byId);
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
      const tint = divisionTint(pick.name);
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
        standings: pick.championship ? divisionFinalStandings(pick.d) : null,
      };
    });
  }
  return out;
}

/**
 * Latest scored games for the Recent games toggle, grouped by gender.
 * Newest scheduled_time first (then round, then id). Capped per gender.
 * Includes pool and bracket finals. No extra database read — callers pass
 * the tournament already loaded for Recent Results.
 */
function collectRecentGameRows(tournament) {
  const rows = [];
  if (!tournament) return rows;
  const divisions = tournament.divisions ?? [];
  const byId = new Map(divisions.map((d) => [d.id, d]));

  for (const d of divisions) {
    const gender = divisionGender(d, byId);
    if (!gender) continue;
    const name = d.display_name ?? d.name ?? "";
    const games = d.games ?? [];
    const champId = championshipGameOf(games)?.id ?? null;
    const list = [...games, ...(d.pool_games ?? [])];
    const moot = mootIfRounds(list);
    for (const g of list) {
      if (!isPlayableGame(g, moot) || g.status !== "final") continue;
      const number = gameNumberLabel(g);
      const caption = [name, number].filter(Boolean).join(" · ") || "Result";
      rows.push({
        key: `${d.id}:${g.id}`,
        team1: g.team1_name,
        team2: g.team2_name,
        score1: g.team1_score,
        score2: g.team2_score,
        caption,
        divisionTint: divisionTint(name),
        divisionName: name,
        divisionId: d.id,
        gameNumber: number,
        scheduledTime: g.scheduled_time ?? null,
        championship: champId != null && g.id === champId,
        gender,
        _sort: g,
      });
    }
  }
  return rows;
}

function stripRecentGameRow(row) {
  const { gender, _sort, ...card } = row;
  return card;
}

export function recentGamesByGender(tournament, cap = RECENT_GAMES_CAP) {
  const out = { womens: [], mens: [], coed: [] };
  const rows = collectRecentGameRows(tournament);
  const limit = Math.max(1, cap);
  for (const key of Object.keys(out)) {
    out[key] = rows
      .filter((r) => r.gender === key)
      .sort((a, b) => compareFinalRecency(a._sort, b._sort))
      .slice(0, limit)
      .map(stripRecentGameRow);
  }
  return out;
}

/**
 * Latest scored games keyed by division id (capped per division).
 * Used when the home picker is on a single division, so a division is
 * not dropped just because it fell outside the gender cap of 12.
 */
export function recentGamesByDivision(tournament, cap = RECENT_GAMES_CAP) {
  const out = {};
  const rows = collectRecentGameRows(tournament);
  const limit = Math.max(1, cap);
  const grouped = new Map();
  for (const row of rows) {
    if (!row.divisionId) continue;
    const list = grouped.get(row.divisionId) ?? [];
    list.push(row);
    grouped.set(row.divisionId, list);
  }
  for (const [id, list] of grouped) {
    out[id] = list
      .sort((a, b) => compareFinalRecency(a._sort, b._sort))
      .slice(0, limit)
      .map(stripRecentGameRow);
  }
  return out;
}

/** Newest start_date first, for the all-regions Recent Results list. */
export function sortResultEventsByRecency(events) {
  return (events ?? [])
    .slice()
    .sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")));
}
