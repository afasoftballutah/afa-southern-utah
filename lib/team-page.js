// Public team pages, one page per name + gender + class.
//
// J.D., 2026-11-09 on PR #24: "merge the ones by team, gender, division."
// A public page is normalized name + gender + division class (D, E, Rec,
// Open, …). The manager is not part of this key, so Brayden Brooks's Coed D
// Fallen and a Worlds Coed D Fallen share /teams/fallen-coed-d. A team with
// no class (Heat Stroker Silver / pool) gets its own gender page
// (/teams/fallen-coed) rather than being folded into Coed D.
//
// This is page grouping only. Team rows in the database are not merged.
// Placeholder (TBD) manager rows stay as they are. Unique names keep the
// bare slug. Shared names keep /teams/fallen as a chooser. Old manager and
// short-id slugs from the first version of this work stay as aliases.

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

/** Folded class for a URL: "D" → "d", "Rec" → "rec". */
export function classSlugPart(className) {
  const slug = teamSlug(className);
  return slug || null;
}

/**
 * Readable disambiguator for a shared name: "coed-d", "mens-e", or "coed"
 * when the division has no class.
 */
export function divisionPageSlug(gender, className) {
  const g = genderSlugPart(gender);
  const c = classSlugPart(className);
  if (g && c) return `${g}-${c}`;
  if (g) return g;
  if (c) return c;
  return null;
}

/** Page-group key: normalized name + gender + class (class may be empty). */
export function pageGroupKey(normalizedName, gender, className) {
  const klass = String(className ?? "").trim().toLowerCase();
  return `${normalizedName || ""}\0${gender ?? ""}\0${klass}`;
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
 * Unique names keep the bare name slug. Shared names use gender + class
 * ("fallen-coed-d", "fallen-mens-e", or "fallen-coed" when there is no
 * class). Old manager slugs and short-id slugs stay as aliases so links
 * from the first version of this work do not break.
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
    const taken = new Set([nameSlug]);
    const uniqueName = group.length === 1;

    for (const ident of group) {
      ident.sharedName = !uniqueName;
      const aliases = new Set();

      const memberIds = ident.memberIds?.length ? ident.memberIds : [ident.id];
      for (const id of memberIds) {
        if (!id) continue;
        aliases.add(`${nameSlug}-${shortTeamKey(id)}`);
      }

      // Previous public slugs used the manager when one was known.
      const managers = new Set(
        [ident.managerName, ...(ident.memberManagers ?? [])]
          .map(managerSlugPart)
          .filter(Boolean)
      );
      const gender = genderSlugPart(ident.gender);
      for (const mgr of managers) {
        aliases.add(`${nameSlug}-${mgr}-${gender}`);
        // Bare manager slug only if it uniquely points at this page.
        const bare = `${nameSlug}-${mgr}`;
        const conflict = group.some((other) => {
          if (other === ident) return false;
          const otherMgrs = [other.managerName, ...(other.memberManagers ?? [])]
            .map(managerSlugPart)
            .filter(Boolean);
          return otherMgrs.includes(mgr);
        });
        if (!conflict) aliases.add(bare);
      }

      if (uniqueName) {
        ident.slug = nameSlug;
        ident.aliases = [...aliases].filter((a) => a !== nameSlug);
        continue;
      }

      const part = divisionPageSlug(ident.gender, ident.className);
      const pretty = part ? `${nameSlug}-${part}` : null;
      const fallback = `${nameSlug}-${shortTeamKey(ident.id)}`;
      const slug = pretty && !taken.has(pretty) ? pretty : fallback;
      ident.slug = slug;
      taken.add(slug);
      ident.aliases = [...aliases].filter((a) => a && a !== slug && a !== nameSlug);
    }
  }
  return identities;
}

/** Class this identity should page under, from its seats when they agree. */
export function classNameForPage(ident) {
  const fromSeats = [...new Set((ident.seats ?? []).map((s) => s.className ?? null))];
  if (fromSeats.length === 1) return fromSeats[0];
  if (fromSeats.length > 1) return undefined;
  return ident.className ?? null;
}

/**
 * Fold source rows (team / registration / leftover game) into public
 * pages by name + gender + class. Does not write or merge database rows.
 */
export function groupPagesByDivision(identities) {
  const sources = [];
  for (const ident of identities ?? []) {
    const byClass = new Map();
    const seats = ident.seats ?? [];
    if (seats.length === 0) {
      const klass = ident.className ?? null;
      byClass.set(klass, { ...ident, seats: [], className: klass });
    } else {
      for (const seat of seats) {
        const klass = seat.className ?? null;
        if (!byClass.has(klass)) {
          byClass.set(klass, {
            ...ident,
            seats: [],
            className: klass,
            classId: seat.classId ?? ident.classId ?? null,
          });
        }
        byClass.get(klass).seats.push(seat);
      }
    }
    for (const part of byClass.values()) sources.push(part);
  }

  const buckets = new Map();
  for (const ident of sources) {
    const key = pageGroupKey(ident.normalizedName, ident.gender, ident.className ?? null);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ident);
  }

  return [...buckets.values()].map((members) => {
    const first = members[0];
    const seats = [];
    const seenSeat = new Set();
    for (const m of members) {
      for (const seat of m.seats ?? []) {
        const k = `${seat.tournamentId ?? ""}\0${seat.divisionId ?? ""}\0${seat.registrationId ?? ""}`;
        if (seenSeat.has(k)) continue;
        seenSeat.add(k);
        seats.push(seat);
      }
    }
    const gameDivisionIds = new Set();
    for (const m of members) {
      for (const id of m.gameDivisionIds ?? []) gameDivisionIds.add(id);
    }
    const className = classNameForPage({ ...first, seats, className: first.className }) ?? first.className ?? null;
    const memberIds = members.map((m) => m.id).filter(Boolean);
    const memberManagers = members.map((m) => m.managerName).filter(Boolean);
    const teamMember = members.find((m) => m.source === "team") ?? first;
    return {
      id: teamMember.id,
      memberIds,
      memberManagers,
      source: members.length === 1 ? first.source : "group",
      name: first.name,
      normalizedName: first.normalizedName,
      gender: first.gender ?? null,
      classId: seats.find((s) => s.classId)?.classId ?? first.classId ?? null,
      className,
      managerName: preferredManagerName(...memberManagers, first.managerName),
      seats,
      gameDivisionIds,
      label: identityLabel(first.gender, className),
    };
  });
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
    const leftClass = left.division?.class_id ? classNames[left.division.class_id] ?? null : null;
    const already = [...byId.values()].find(
      (ident) =>
        ident.normalizedName === left.normalizedName &&
        (ident.gender ?? null) === (gender ?? null) &&
        (ident.className ?? null) === (leftClass ?? null)
    );
    // A leftover game in a division with no seat: only attach to an existing
    // club when that club is the unique same-name, same-gender, same-class
    // identity and has no seat in this tournament already.
    const tournamentId = left.division?.tournament_id ?? left.division?.tournaments?.id;
    if (already) {
      const rivals = [...byId.values()].filter(
        (ident) =>
          ident.normalizedName === left.normalizedName &&
          (ident.gender ?? null) === (gender ?? null) &&
          (ident.className ?? null) === (leftClass ?? null)
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

  const sources = [...byId.values()].map((ident) => {
    ident.gameDivisionIds = gameDivisionIdsFor(ident, divisionsByTournament);
    ident.label = identityLabel(ident.gender, ident.className);
    ident.managerName = preferredManagerName(ident.managerName, ...ident._managerNames);
    delete ident._managerEmails;
    delete ident._managerNames;
    return ident;
  });

  const identities = groupPagesByDivision(sources);
  // Recompute families on the grouped pages so merged seats (Worlds Coed D
  // + T-Shirts Coed D) all contribute games.
  for (const ident of identities) {
    ident.gameDivisionIds = gameDivisionIdsFor(ident, divisionsByTournament);
    ident.label = identityLabel(ident.gender, ident.className);
  }
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
 * Attach a tournament object onto each game's divisions.tournaments,
 * matching the shape buildTeamHistory already reads.
 */
export function attachTournamentsToGames(games, tournamentById) {
  for (const g of games ?? []) {
    const div = g.divisions;
    if (!div) continue;
    const tid = div.tournament_id ?? div.tournaments?.id;
    const t = tid ? tournamentById.get(tid) : undefined;
    if (t) g.divisions = { ...div, tournaments: t };
  }
  return games;
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
 * One page's history (name + gender + class), across that club's tournaments.
 */
export function buildClubPage(ident, poolGames, bracketGames, teamStatusByTournament, classNames = {}) {
  const { pool, bracket } = gamesForIdentity(ident, poolGames, bracketGames);
  const history = buildTeamHistory(ident.name, pool, bracket, teamStatusByTournament, classNames, bracketGames);
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
