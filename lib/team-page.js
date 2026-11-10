// Public team pages, one club per URL.
//
// Club identity (lib/identity.js, J.D. 2026-11-08): normalized name + gender
// + (manager email OR manager name). Class is not part of the key. Placeholder
// managers (TBD) and blank managers never merge. Same name, two managers →
// two teams. Men's and Coed stay separate even when the manager matches.
//
// The teams table already stores that identity. Public /teams/[slug] pages
// used to group by the display-name slug only, so every "Fallen" landed on
// one page. When a name is shared, /teams/fallen is a chooser, and each
// club gets /teams/fallen-<manager-or-short-key>. Unique names keep the
// bare slug, so old links stay put.

import { isPlaceholderManager, sameManager, sameRegistrationName } from "@/lib/register-key";
import { normalizeTeam } from "@/lib/quickscores";
import { teamSlug, isRealTeamName, buildTeamHistory, identityLabel } from "@/lib/teams";
import { divisionFamily } from "@/lib/team-feed";

/** First 8 hex chars of a team uuid, or of a provisional `reg:<uuid>`. */
export function shortTeamKey(id) {
  const raw = String(id ?? "");
  const uuid = raw.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (uuid) return uuid[0].replace(/-/g, "").slice(0, 8).toLowerCase();
  const hex = raw.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length >= 8) return hex.slice(0, 8);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 33 + raw.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}

/** True when a manager name is safe to show or to put in a URL. */
export function isDisplayableManager(name) {
  if (isPlaceholderManager(name)) return false;
  const slug = teamSlug(name);
  return Boolean(slug && /[a-z]/.test(slug));
}

export function managerSlugPart(name) {
  if (!isDisplayableManager(name)) return null;
  return teamSlug(name) || null;
}

export function genderSlugPart(gender) {
  if (gender === "mens" || gender === "womens" || gender === "coed") return gender;
  return null;
}

export function teamPagePath(slug) {
  if (!slug) return null;
  return `/teams/${slug}`;
}

/** Longest displayable manager name wins (e.g. "Brayden Brooks" over "Brayden"). */
export function preferredManagerName(...names) {
  let best = null;
  for (const name of names) {
    if (!isDisplayableManager(name)) continue;
    const trimmed = String(name).trim();
    if (!best || trimmed.length > best.length) best = trimmed;
  }
  return best;
}

/**
 * Assign a canonical public slug (and aliases) to each identity.
 * Unique names keep the bare name slug. Shared names use a manager slug
 * when that is unique, then manager+gender, then a short id. The short-id
 * form is always kept as an alias so a later manager edit cannot break it.
 *
 * Mutates and returns the same identities.
 */
export function assignPageSlugs(identities) {
  const groups = new Map();
  for (const ident of identities ?? []) {
    const nameSlug = teamSlug(ident.name);
    ident.nameSlug = nameSlug;
    if (!nameSlug) continue;
    if (!groups.has(nameSlug)) groups.set(nameSlug, []);
    groups.get(nameSlug).push(ident);
  }

  for (const [nameSlug, group] of groups) {
    if (group.length === 1) {
      const ident = group[0];
      ident.slug = nameSlug;
      ident.aliases = [];
      ident.sharedName = false;
      continue;
    }

    const prettyFor = (ident) => {
      const mgr = managerSlugPart(ident.managerName);
      if (!mgr) return null;
      const base = `${nameSlug}-${mgr}`;
      const sameBase = group.filter((other) => managerSlugPart(other.managerName) && `${nameSlug}-${managerSlugPart(other.managerName)}` === base);
      if (sameBase.length === 1) return base;
      const gender = genderSlugPart(ident.gender);
      if (!gender) return null;
      const withGender = `${base}-${gender}`;
      const sameGender = group.filter((other) => {
        const otherMgr = managerSlugPart(other.managerName);
        const otherGender = genderSlugPart(other.gender);
        return otherMgr && otherGender && `${nameSlug}-${otherMgr}-${otherGender}` === withGender;
      });
      return sameGender.length === 1 ? withGender : null;
    };

    const taken = new Set([nameSlug]);
    for (const ident of group) {
      ident.sharedName = true;
      ident.aliases = [];
      const shortAlias = `${nameSlug}-${shortTeamKey(ident.id)}`;
      ident.shortSlug = shortAlias;
      const pretty = prettyFor(ident);
      const slug = pretty && !taken.has(pretty) ? pretty : shortAlias;
      ident.slug = slug;
      taken.add(slug);
      if (shortAlias !== slug) ident.aliases.push(shortAlias);
    }
  }
  return identities;
}

/**
 * Build club identities from teams + registrations (and leftover game names).
 * Pure — no I/O. Emails may be present on registration rows for matching
 * only; they are never copied onto the returned identities.
 *
 * @param {{
 *   teams: Array,
 *   registrations: Array,
 *   divisions: Array,
 *   tournaments: Array,
 *   classes?: Array,
 *   poolGames?: Array,
 *   bracketGames?: Array,
 * }} input
 */
export function buildTeamIdentities({
  teams = [],
  registrations = [],
  divisions = [],
  tournaments = [],
  classes = [],
  poolGames = [],
  bracketGames = [],
} = {}) {
  const classNames = Object.fromEntries((classes ?? []).map((c) => [c.id, c.name]));
  const divisionById = new Map((divisions ?? []).map((d) => [d.id, d]));
  const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const divisionsByTournament = new Map();
  for (const d of divisions ?? []) {
    const tid = d.tournament_id;
    if (!tid) continue;
    if (!divisionsByTournament.has(tid)) divisionsByTournament.set(tid, []);
    divisionsByTournament.get(tid).push(d);
  }

  const liveTeams = (teams ?? []).filter((t) => !t.merged_into_id);
  /** @type {Map<string, object>} */
  const byId = new Map();

  for (const team of liveTeams) {
    const managerName = preferredManagerName(team.manager_name);
    byId.set(team.id, {
      id: team.id,
      source: "team",
      name: team.name,
      normalizedName: team.normalized_name || normalizeTeam(team.name),
      gender: team.gender ?? null,
      classId: team.class_id ?? null,
      className: team.class_id ? classNames[team.class_id] ?? null : null,
      managerName,
      // Private, matching only — stripped before return.
      _managerEmails: [],
      _managerNames: isDisplayableManager(team.manager_name) ? [team.manager_name] : [],
      seats: [],
    });
  }

  const withdrawn = (status) => status === "withdrawn";

  const attachSeat = (ident, reg) => {
    const division = divisionById.get(reg.division_id) ?? null;
    const tournament =
      tournamentById.get(reg.tournament_id) ??
      tournamentById.get(division?.tournament_id) ??
      null;
    const classId = division?.class_id ?? ident.classId;
    ident.seats.push({
      registrationId: reg.id ?? null,
      tournamentId: tournament?.id ?? reg.tournament_id ?? null,
      divisionId: reg.division_id ?? division?.id ?? null,
      tournamentName: tournament?.name ?? null,
      tournamentSlug: tournament?.slug ?? null,
      startDate: tournament?.start_date ?? null,
      endDate: tournament?.end_date ?? null,
      divisionName: division?.display_name ?? division?.name ?? null,
      gender: division?.gender ?? ident.gender,
      classId: classId ?? null,
      className: classId ? classNames[classId] ?? null : null,
    });
    if (isDisplayableManager(reg.manager_name)) ident._managerNames.push(reg.manager_name);
    const email = String(reg.manager_email ?? "").trim();
    if (email.includes("@")) ident._managerEmails.push(email);
    ident.managerName = preferredManagerName(ident.managerName, ...ident._managerNames);
    if (!ident.gender && division?.gender) ident.gender = division.gender;
  };

  const sameClub = (ident, reg, division) => {
    if (!sameRegistrationName(ident.name, reg.team_name)) return false;
    const gender = division?.gender ?? null;
    if ((ident.gender ?? null) !== (gender ?? null)) return false;
    const identKeys = [];
    if (ident._managerEmails.length || ident._managerNames.length) {
      for (const email of ident._managerEmails.length ? ident._managerEmails : [undefined]) {
        for (const name of ident._managerNames.length ? ident._managerNames : [ident.managerName]) {
          identKeys.push({ managerName: name, managerEmail: email });
        }
      }
    }
    const regKey = { managerName: reg.manager_name, managerEmail: reg.manager_email };
    if (!identKeys.length) return false;
    return identKeys.some((k) => sameManager(k, regKey));
  };

  const unlinked = [];
  for (const reg of registrations ?? []) {
    if (withdrawn(reg.status)) continue;
    const name = String(reg.team_name ?? "").trim();
    if (!name) continue;
    if (reg.team_id && byId.has(reg.team_id)) {
      attachSeat(byId.get(reg.team_id), reg);
      continue;
    }
    if (reg.team_id && !byId.has(reg.team_id)) {
      // Team row missing or merged away — treat like unlinked.
    }
    unlinked.push(reg);
  }

  for (const reg of unlinked) {
    const division = divisionById.get(reg.division_id) ?? null;
    const hit = [...byId.values()].find((ident) => sameClub(ident, reg, division));
    if (hit) {
      attachSeat(hit, reg);
      continue;
    }
    const id = `reg:${reg.id}`;
    const ident = {
      id,
      source: "registration",
      name: String(reg.team_name).trim(),
      normalizedName: normalizeTeam(reg.team_name),
      gender: division?.gender ?? null,
      classId: division?.class_id ?? null,
      className: division?.class_id ? classNames[division.class_id] ?? null : null,
      managerName: preferredManagerName(reg.manager_name),
      _managerEmails: String(reg.manager_email ?? "").includes("@")
        ? [String(reg.manager_email).trim()]
        : [],
      _managerNames: isDisplayableManager(reg.manager_name) ? [reg.manager_name] : [],
      seats: [],
    };
    attachSeat(ident, reg);
    byId.set(id, ident);
  }

  // Claim leftover game names so a club that only appears on a bracket
  // (no registration, no teams row) still gets a page — unique names keep
  // the bare slug.
  const claimed = new Set();
  const markClaimed = (ident) => {
    ident.gameDivisionIds = gameDivisionIdsFor(ident, divisionsByTournament);
    for (const divId of ident.gameDivisionIds) {
      claimed.add(`${ident.normalizedName}\0${divId}`);
    }
  };
  for (const ident of byId.values()) markClaimed(ident);

  const leftoverKeys = new Map();
  for (const g of [...(poolGames ?? []), ...(bracketGames ?? [])]) {
    const division = g.divisions ?? divisionById.get(g.division_id) ?? null;
    const divId = division?.id ?? g.division_id;
    for (const raw of [g.team1_name ?? g.team1, g.team2_name ?? g.team2]) {
      if (!isRealTeamName(raw)) continue;
      const norm = normalizeTeam(raw);
      const key = `${norm}\0${divId}`;
      if (!divId || claimed.has(key)) continue;
      if (!leftoverKeys.has(key)) {
        leftoverKeys.set(key, {
          name: String(raw).replace(/^\[[^\]]*\]\s*/, "").trim() || raw,
          normalizedName: norm,
          division,
          divId,
        });
      }
    }
  }

  for (const left of leftoverKeys.values()) {
    const gender = left.division?.gender ?? null;
    const already = [...byId.values()].find(
      (ident) =>
        ident.normalizedName === left.normalizedName && (ident.gender ?? null) === (gender ?? null)
    );
    // A leftover game in a division with no seat: only attach to an existing
    // club when that club is the unique same-name, same-gender identity and
    // has no seat in this tournament already (so two Fallens cannot collide).
    const tournamentId = left.division?.tournament_id ?? left.division?.tournaments?.id;
    if (already) {
      const rivals = [...byId.values()].filter(
        (ident) =>
          ident.normalizedName === left.normalizedName && (ident.gender ?? null) === (gender ?? null)
      );
      const takenInTournament = rivals.some((ident) =>
        ident.seats.some((s) => s.tournamentId === tournamentId)
      );
      if (rivals.length === 1 && !takenInTournament) {
        already.seats.push(seatFromDivision(already, left.division, tournamentById, classNames));
        markClaimed(already);
        continue;
      }
    }

    const id = `game:${left.normalizedName}:${left.divId}`;
    const ident = {
      id,
      source: "game",
      name: left.name,
      normalizedName: left.normalizedName,
      gender,
      classId: left.division?.class_id ?? null,
      className: left.division?.class_id ? classNames[left.division.class_id] ?? null : null,
      managerName: null,
      _managerEmails: [],
      _managerNames: [],
      seats: [seatFromDivision(null, left.division, tournamentById, classNames)],
    };
    byId.set(id, ident);
    markClaimed(ident);
  }

  const identities = [...byId.values()].map((ident) => {
    ident.gameDivisionIds = gameDivisionIdsFor(ident, divisionsByTournament);
    ident.label = identityLabel(ident.gender, ident.className);
    ident.managerName = preferredManagerName(ident.managerName, ...ident._managerNames);
    delete ident._managerEmails;
    delete ident._managerNames;
    return ident;
  });

  assignPageSlugs(identities);
  return identities;
}

function seatFromDivision(ident, division, tournamentById, classNames) {
  const tournament =
    tournamentById.get(division?.tournament_id) ?? division?.tournaments ?? null;
  const classId = division?.class_id ?? ident?.classId ?? null;
  return {
    registrationId: null,
    tournamentId: tournament?.id ?? division?.tournament_id ?? null,
    divisionId: division?.id ?? null,
    tournamentName: tournament?.name ?? null,
    tournamentSlug: tournament?.slug ?? null,
    startDate: tournament?.start_date ?? null,
    endDate: tournament?.end_date ?? null,
    divisionName: division?.display_name ?? division?.name ?? null,
    gender: division?.gender ?? ident?.gender ?? null,
    classId,
    className: classId ? classNames[classId] ?? null : null,
  };
}

function gameDivisionIdsFor(ident, divisionsByTournament) {
  const ids = new Set();
  for (const seat of ident.seats ?? []) {
    if (!seat.divisionId) continue;
    const list = divisionsByTournament.get(seat.tournamentId) ?? [];
    const family = list.length ? divisionFamily(list, seat.divisionId) : null;
    if (family) {
      for (const id of family) ids.add(id);
    } else {
      ids.add(seat.divisionId);
    }
  }
  return ids;
}

export function hrefKey(name, divisionId) {
  return `${normalizeTeam(name)}\0${divisionId || ""}`;
}

/**
 * Map of `normalize(name)\\0divisionId` → `/teams/...` for every seat
 * (and the division family, so a pool-parent link hits the same club).
 */
export function buildHrefMap(identities, divisions = []) {
  const divisionsByTournament = new Map();
  for (const d of divisions ?? []) {
    const tid = d.tournament_id ?? d.tournaments?.id;
    if (!tid) continue;
    if (!divisionsByTournament.has(tid)) divisionsByTournament.set(tid, []);
    divisionsByTournament.get(tid).push(d);
  }
  const map = {};
  for (const ident of identities ?? []) {
    const path = teamPagePath(ident.slug);
    if (!path) continue;
    const name = ident.name;
    // Unique names also resolve with no division.
    if (!ident.sharedName) {
      map[hrefKey(name, "")] = path;
    } else {
      map[hrefKey(name, "")] = teamPagePath(ident.nameSlug);
    }
    for (const divId of ident.gameDivisionIds ?? []) {
      map[hrefKey(name, divId)] = path;
    }
  }
  return map;
}

/** Public href for a team name, with a division when we have one. */
export function teamPageHref(name, { divisionId = null, hrefMap = null } = {}) {
  const fallback = teamPagePath(teamSlug(name));
  if (!name) return fallback;
  if (hrefMap) {
    if (divisionId && hrefMap[hrefKey(name, divisionId)]) {
      return hrefMap[hrefKey(name, divisionId)];
    }
    if (hrefMap[hrefKey(name, "")]) return hrefMap[hrefKey(name, "")];
  }
  return fallback;
}

export function findIdentityBySlug(identities, slug) {
  if (!slug) return null;
  return (
    (identities ?? []).find(
      (ident) => ident.slug === slug || (ident.aliases ?? []).includes(slug)
    ) ?? null
  );
}

export function identitiesForNameSlug(identities, nameSlug) {
  return (identities ?? []).filter((ident) => ident.nameSlug === nameSlug);
}

/**
 * Filter pool/bracket rows to the ones this club actually played.
 * A row belongs here when the name matches and the division is in the
 * club's family (the registered division, its parent, and sibling stages).
 */
export function gamesForIdentity(ident, poolGames, bracketGames) {
  const norms = new Set([ident.normalizedName, normalizeTeam(ident.name)].filter(Boolean));
  const divs = ident.gameDivisionIds ?? new Set();
  const hit = (g) => {
    const n1 = normalizeTeam(g.team1_name ?? g.team1);
    const n2 = normalizeTeam(g.team2_name ?? g.team2);
    if (!norms.has(n1) && !norms.has(n2)) return false;
    const divId = g.division_id ?? g.divisions?.id ?? g.divisionId;
    // No seats at all (shouldn't happen): fall back to name-only so a unique
    // club with no registration still lists its games.
    if (divs.size === 0) return true;
    return divs.has(divId);
  };
  return {
    pool: (poolGames ?? []).filter(hit),
    bracket: (bracketGames ?? []).filter(hit),
  };
}

/**
 * One club's history, flattened across class changes (class is not a key).
 */
export function buildClubPage(ident, poolGames, bracketGames, teamStatusByTournament, classNames = {}) {
  const { pool, bracket } = gamesForIdentity(ident, poolGames, bracketGames);
  const history = buildTeamHistory(ident.name, pool, bracket, teamStatusByTournament, classNames);
  const identities = history?.identities ?? [];
  const tournaments = identities
    .flatMap((section) =>
      (section.tournaments ?? []).map((card) => ({
        ...card,
        className: section.className ?? ident.className,
        gender: section.gender ?? ident.gender,
        label: section.label ?? ident.label,
      }))
    )
    .sort((a, b) =>
      String(b.tournament?.start_date ?? "").localeCompare(String(a.tournament?.start_date ?? ""))
    );
  const totalW = identities.reduce((n, s) => n + (s.totalW ?? 0), 0);
  const totalL = identities.reduce((n, s) => n + (s.totalL ?? 0), 0);
  const tournamentCount = new Set(tournaments.map((t) => t.tournament?.id).filter(Boolean)).size;
  return {
    kind: "team",
    slug: ident.slug,
    nameSlug: ident.nameSlug,
    sharedName: Boolean(ident.sharedName),
    name: ident.name,
    managerName: ident.managerName,
    gender: ident.gender,
    className: ident.className,
    label: ident.label,
    identities: [
      {
        key: ident.id,
        name: ident.name,
        gender: ident.gender,
        className: ident.className,
        label: ident.label,
        totalW,
        totalL,
        tournaments,
      },
    ],
    totalW,
    totalL,
    tournamentCount,
    seats: ident.seats,
  };
}

export function buildChooserPage(nameSlug, group) {
  const name = group[0]?.name ?? nameSlug;
  const options = [...group]
    .map((ident) => ({
      id: ident.id,
      slug: ident.slug,
      href: teamPagePath(ident.slug),
      name: ident.name,
      managerName: ident.managerName,
      gender: ident.gender,
      className: ident.className,
      label: ident.label,
      seats: ident.seats,
      tournamentCount: new Set((ident.seats ?? []).map((s) => s.tournamentId).filter(Boolean)).size,
    }))
    .sort((a, b) => {
      const la = a.label || "";
      const lb = b.label || "";
      if (la !== lb) return la.localeCompare(lb);
      const ma = a.managerName || "";
      const mb = b.managerName || "";
      if (ma !== mb) return ma.localeCompare(mb);
      return String(a.slug).localeCompare(String(b.slug));
    });
  return {
    kind: "chooser",
    slug: nameSlug,
    nameSlug,
    name,
    options,
  };
}

/**
 * Resolve a URL slug to either a single club page or a chooser.
 * Returns null when nothing matches.
 */
export function pageForSlug(slug, { identities, poolGames, bracketGames, teamStatusByTournament, classNames } = {}) {
  if (!slug) return null;
  const ident = findIdentityBySlug(identities, slug);
  if (ident) {
    return buildClubPage(ident, poolGames, bracketGames, teamStatusByTournament, classNames);
  }
  const group = identitiesForNameSlug(identities, slug);
  if (group.length > 1) return buildChooserPage(slug, group);
  if (group.length === 1) {
    return buildClubPage(group[0], poolGames, bracketGames, teamStatusByTournament, classNames);
  }
  return null;
}
