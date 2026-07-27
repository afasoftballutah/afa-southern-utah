// Team identity and page helpers — no teams table.
// Spec: M5-Share/spec-team-pages.md (2026-07-27).
//
// A team is a text name on a game row. Identity is normalized name + gender +
// class (from the division the game sat under). Gender alone is enough today;
// class activates when a division is named "Coed E" etc.

import { normalizeTeam, isPlaceholderName, stripSeedPrefix } from "@/lib/quickscores";
import { championOf } from "@/lib/bracket/if-game";
import { bracketStandings } from "@/lib/bracket/standings";
import { isPlayableGame } from "@/lib/tournament-state";
import { mootIfRounds } from "@/lib/bracket/if-game";

const PODIUM_MEDAL = { 1: "\u{1F3C6}", 2: "\u{1F948}", 3: "\u{1F949}" };

/** URL slug from the display name only. */
export function teamSlug(name) {
  const base = stripSeedPrefix(name ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base;
}

export function isRealTeamName(name) {
  if (!name) return false;
  if (isPlaceholderName(name)) return false;
  // Seed refs before pool fill — not a team.
  if (/^\[?[A-I] ?#?\d+\]?$/i.test(String(name).trim())) return false;
  return true;
}

export function identityKey(normalizedName, gender, classId) {
  return `${normalizedName}\0${gender ?? ""}\0${classId ?? ""}`;
}

/** Human label for an identity section: "Coed", "Men's · D". */
export function identityLabel(gender, className) {
  const g =
    gender === "mens" ? "Men's" : gender === "womens" ? "Women's" : gender === "coed" ? "Coed" : null;
  if (g && className) return `${g} \u00b7 ${className}`;
  if (g) return g;
  if (className) return className;
  return null;
}

/**
 * Placement for one team in one division's bracket, using the same fallback
 * chain as the archive: team_status first, then championOf / standings.
 */
export function placementForTeam(team, games, teamStatus) {
  const st = teamStatus?.[team];
  if (st?.state === "champion") {
    return { place: 1, label: st.placement || "Champion", medal: PODIUM_MEDAL[1] };
  }
  if (st?.placement) {
    const n = Number(String(st.placement).match(/\d+/)?.[0]);
    if (Number.isFinite(n)) {
      return {
        place: n,
        label: st.placement,
        medal: PODIUM_MEDAL[n] ?? null,
      };
    }
    return { place: null, label: st.placement, medal: null };
  }

  const champ = championOf(games ?? []);
  if (champ && normalizeTeam(champ) === normalizeTeam(team)) {
    return { place: 1, label: "Champion", medal: PODIUM_MEDAL[1] };
  }

  const rows = bracketStandings(games ?? [], teamStatus ?? {});
  const row = rows.find((r) => normalizeTeam(r.team) === normalizeTeam(team));
  if (row?.finish) {
    return {
      place: row.finish.n,
      label: row.finish.label,
      medal: PODIUM_MEDAL[row.finish.n] ?? null,
    };
  }
  return null;
}

/**
 * Build history sections from raw rows already loaded.
 * Pure — easy to test without Supabase.
 *
 * @param {string} displayName  preferred spelling for the heading
 * @param {Array} poolGames     pool_games rows with division + tournament join
 * @param {Array} bracketGames  games rows with division + tournament join
 * @param {Object} teamStatusByTournament  tournamentId -> { [teamName]: statusRow }
 * @param {Object} classNames  classId -> name
 */
export function buildTeamHistory(displayName, poolGames, bracketGames, teamStatusByTournament, classNames = {}) {
  const target = normalizeTeam(displayName);
  if (!target) return null;

  // identityKey -> section accumulator
  const sections = new Map();

  const ensure = (gender, classId, nameSpelling) => {
    const key = identityKey(target, gender, classId);
    if (!sections.has(key)) {
      sections.set(key, {
        key,
        name: nameSpelling || displayName,
        gender: gender ?? null,
        classId: classId ?? null,
        className: classId ? classNames[classId] ?? null : null,
        totalW: 0,
        totalL: 0,
        // tournamentId -> card accumulator
        byTournament: new Map(),
      });
    }
    return sections.get(key);
  };

  const touchTournament = (section, tournament, division, stage) => {
    const tid = tournament?.id;
    if (!tid) return null;
    if (!section.byTournament.has(tid)) {
      section.byTournament.set(tid, {
        tournament,
        division,
        stage,
        w: 0,
        l: 0,
        games: [],
        placement: null,
        medal: null,
        placeLabel: null,
      });
    }
    const card = section.byTournament.get(tid);
    // Prefer the latest stage (bracket over pool) — same idea as getTeamSummaries.
    if (stage && (!card.stage || card.stage.startsWith("Pool"))) {
      card.stage = stage;
      card.division = division ?? card.division;
    }
    return card;
  };

  const considerGame = (g, isBracket) => {
    const side =
      normalizeTeam(g.team1_name) === target
        ? 1
        : normalizeTeam(g.team2_name) === target
          ? 2
          : 0;
    if (!side) return;

    const division = g.divisions ?? g.division ?? null;
    const tournament = division?.tournaments ?? division?.tournament ?? null;
    const gender = division?.gender ?? null;
    const classId = division?.class_id ?? null;
    const spelling = side === 1 ? g.team1_name : g.team2_name;
    const section = ensure(gender, classId, stripSeedPrefix(spelling));

    const stage = isBracket
      ? division?.display_name ?? division?.name ?? "Bracket"
      : g.pool
        ? `Pool ${g.pool}`
        : "Pool";

    const card = touchTournament(section, tournament, division, stage);
    if (!card) return;

    const opponentRaw = side === 1 ? g.team2_name : g.team1_name;
    const opponent = isRealTeamName(opponentRaw) ? stripSeedPrefix(opponentRaw) : null;
    const score1 = g.team1_score;
    const score2 = g.team2_score;
    const isFinal = g.status === "final";

    let result = null;
    if (isFinal && score1 != null && score2 != null && score1 !== score2) {
      const mine = side === 1 ? score1 : score2;
      const theirs = side === 1 ? score2 : score1;
      const won = mine > theirs;
      if (won) {
        section.totalW += 1;
        card.w += 1;
        result = "W";
      } else {
        section.totalL += 1;
        card.l += 1;
        result = "L";
      }
    }

    card.games.push({
      id: g.id,
      pool: g.pool ?? null,
      round: g.round ?? null,
      field: g.field,
      scheduledTime: g.scheduled_time,
      team1: stripSeedPrefix(g.team1_name),
      team2: stripSeedPrefix(g.team2_name),
      score1,
      score2,
      isFinal,
      opponent,
      result,
      divisionName: division?.display_name ?? division?.name ?? null,
      divisionId: division?.id ?? g.division_id,
      tournamentSlug: tournament?.slug ?? null,
      label: isBracket
        ? g.round
          ? `Game ${g.round}`
          : null
        : g.pool
          ? `Pool ${g.pool}`
          : null,
    });
  };

  // Group bracket games by division for moot / playable filter.
  const bracketByDiv = new Map();
  for (const g of bracketGames ?? []) {
    const id = g.division_id;
    if (!bracketByDiv.has(id)) bracketByDiv.set(id, []);
    bracketByDiv.get(id).push(g);
  }
  const mootByDiv = new Map();
  for (const [id, list] of bracketByDiv) mootByDiv.set(id, mootIfRounds(list));

  for (const g of poolGames ?? []) {
    if (g.status === "cancelled") continue;
    considerGame(g, false);
  }
  for (const g of bracketGames ?? []) {
    if (!isPlayableGame(g, mootByDiv.get(g.division_id))) continue;
    considerGame(g, true);
  }

  // Placement per tournament card (finished brackets only).
  for (const section of sections.values()) {
    for (const card of section.byTournament.values()) {
      const tid = card.tournament?.id;
      const statusMap = teamStatusByTournament?.[tid] ?? {};
      // Prefer status keyed by any spelling of this team in the map.
      const statusForTeam = (() => {
        if (statusMap[section.name]) return statusMap;
        const hit = Object.keys(statusMap).find((k) => normalizeTeam(k) === target);
        if (hit && hit !== section.name) {
          // alias key for placementForTeam
          return { ...statusMap, [section.name]: statusMap[hit] };
        }
        return statusMap;
      })();

      const divId = card.division?.id;
      const divGames = (bracketGames ?? []).filter((g) => g.division_id === divId);
      const place = placementForTeam(section.name, divGames, statusForTeam);
      if (place) {
        card.placement = place.label;
        card.medal = place.medal;
        card.place = place.place;
      }

      // Newest games first.
      card.games.sort((a, b) =>
        String(b.scheduledTime ?? "").localeCompare(String(a.scheduledTime ?? ""))
      );
    }
  }

  const out = [...sections.values()].map((s) => {
    const tournaments = [...s.byTournament.values()].sort((a, b) =>
      String(b.tournament?.start_date ?? "").localeCompare(String(a.tournament?.start_date ?? ""))
    );
    return {
      key: s.key,
      name: s.name,
      gender: s.gender,
      classId: s.classId,
      className: s.className,
      label: identityLabel(s.gender, s.className),
      totalW: s.totalW,
      totalL: s.totalL,
      tournaments,
    };
  });

  // Stable order: more games first, then label.
  out.sort((a, b) => b.totalW + b.totalL - (a.totalW + a.totalL) || String(a.label).localeCompare(String(b.label)));

  return {
    name: displayName,
    identities: out,
    // Convenience when there is exactly one identity (the common case).
    totalW: out.reduce((n, s) => n + s.totalW, 0),
    totalL: out.reduce((n, s) => n + s.totalL, 0),
    tournamentCount: new Set(out.flatMap((s) => s.tournaments.map((t) => t.tournament?.id))).size,
  };
}
