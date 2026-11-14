// Load club identities (teams + registrations) and build public team pages.
// Registrations and teams are service_role only — this module is server-only.
// Returned page objects never include emails, phones, or tokens.

import { cache } from "react";
import { getPublicClient, getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeTeam } from "@/lib/quickscores";
import { teamSlug } from "@/lib/teams";
import {
  buildTeamIdentities,
  buildHrefMap,
  pageForSlug,
  teamPageHref as hrefFor,
} from "@/lib/team-page";

const TEAM_DIVISION_SELECT = `
  id, name, display_name, gender, class_id, parent_division_id, tournament_id,
  brackets ( id, format, bracket_group ),
  tournaments ( * )
`.replace(/\s+/g, " ").trim();

const REG_SELECT = "id, team_id, team_name, tournament_id, division_id, manager_name, manager_email, status";

async function loadIdentityTables() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getServiceClient();
  const [teams, registrations, divisions, tournaments, classes] = await Promise.all([
    supabase
      .from("teams")
      .select(
        "id, name, normalized_name, gender, class_id, manager_name, manager_normalized_name, merged_into_id"
      ),
    supabase.from("registrations").select(REG_SELECT),
    supabase
      .from("divisions")
      .select("id, name, display_name, gender, class_id, parent_division_id, tournament_id"),
    supabase.from("tournaments").select("id, name, slug, start_date, end_date, status, timezone"),
    supabase.from("classes").select("id, name"),
  ]);
  if (teams.error) throw teams.error;
  if (registrations.error) throw registrations.error;
  if (divisions.error) throw divisions.error;
  if (tournaments.error) throw tournaments.error;
  return {
    teams: teams.data ?? [],
    registrations: registrations.data ?? [],
    divisions: divisions.data ?? [],
    tournaments: tournaments.data ?? [],
    classes: classes.data ?? [],
  };
}

async function loadGames() {
  const supabase = getPublicClient();
  const [pool, bracket, classes] = await Promise.all([
    supabase
      .from("pool_games")
      .select(
        `id, division_id, pool, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, status, divisions ( ${TEAM_DIVISION_SELECT} )`
      ),
    supabase
      .from("games")
      .select(
        `id, division_id, round, field, scheduled_time, team1_name, team2_name, team1_score, team2_score, status, is_bye, team1_source_game_id, team1_source_result, team2_source_game_id, team2_source_result, divisions ( ${TEAM_DIVISION_SELECT} )`
      ),
    supabase.from("classes").select("id, name"),
  ]);
  if (pool.error) throw pool.error;
  if (bracket.error) throw bracket.error;
  return {
    poolGames: pool.data ?? [],
    bracketGames: bracket.data ?? [],
    classNames: Object.fromEntries((classes.data ?? []).map((c) => [c.id, c.name])),
  };
}

async function loadTeamStatus(poolGames, bracketGames) {
  const supabase = getPublicClient();
  const tournamentIds = [
    ...new Set(
      [...(poolGames ?? []), ...(bracketGames ?? [])]
        .map((g) => g.divisions?.tournaments?.id)
        .filter(Boolean)
    ),
  ];
  const teamStatusByTournament = {};
  if (!tournamentIds.length) return teamStatusByTournament;
  const { data: statusRows } = await supabase
    .from("team_status")
    .select("tournament_id, team_name, state, placement, bracket_name")
    .in("tournament_id", tournamentIds);
  for (const r of statusRows ?? []) {
    (teamStatusByTournament[r.tournament_id] ??= {})[r.team_name] = r;
  }
  return teamStatusByTournament;
}

async function loadAll() {
  const tables = await loadIdentityTables();
  const games = await loadGames();
  if (!tables) {
    return {
      identities: buildTeamIdentities({
        teams: [],
        registrations: [],
        divisions: [],
        tournaments: [],
        classes: games.classNames
          ? Object.entries(games.classNames).map(([id, name]) => ({ id, name }))
          : [],
        poolGames: games.poolGames,
        bracketGames: games.bracketGames,
      }),
      ...games,
      teamStatusByTournament: await loadTeamStatus(games.poolGames, games.bracketGames),
    };
  }
  const identities = buildTeamIdentities({
    ...tables,
    poolGames: games.poolGames,
    bracketGames: games.bracketGames,
  });
  const teamStatusByTournament = await loadTeamStatus(games.poolGames, games.bracketGames);
  return { identities, ...games, teamStatusByTournament, divisions: tables.divisions };
}

export const loadTeamPageData = cache(loadAll);

export async function getTeamIdentities() {
  const data = await loadTeamPageData();
  return data.identities;
}

export const getTeamPageHrefMap = cache(async () => {
  const data = await loadTeamPageData();
  return buildHrefMap(data.identities, data.divisions ?? []);
});

export function teamPageHref(name, { divisionId = null, hrefMap = null } = {}) {
  return hrefFor(name, { divisionId, hrefMap });
}

/**
 * Full team page payload for one slug: a single club, or a chooser when
 * the slug is a shared name.
 */
export async function getTeamPageBySlug(slug) {
  if (!slug) return null;
  const data = await loadTeamPageData();
  return pageForSlug(slug, {
    identities: data.identities,
    poolGames: data.poolGames,
    bracketGames: data.bracketGames,
    teamStatusByTournament: data.teamStatusByTournament,
    classNames: data.classNames,
  });
}

/** Spec shape: history for a known display name (not a slug). */
export async function getTeamHistory(teamName) {
  const slug = teamSlug(teamName);
  const page = await getTeamPageBySlug(slug);
  if (!page) return null;
  if (page.kind === "chooser") {
    return {
      name: page.name,
      identities: page.options,
      chooser: true,
    };
  }
  if (page.identities.length === 1) {
    const id = page.identities[0];
    return {
      name: page.name,
      tournaments: id.tournaments,
      totalW: id.totalW,
      totalL: id.totalL,
    };
  }
  return {
    name: page.name,
    identities: page.identities,
    totalW: page.totalW,
    totalL: page.totalL,
  };
}

/** Preferred spellings from game rows — used by older name listings. */
export function preferredNamesFromGames(poolGames, bracketGames) {
  const preferred = new Map();
  const add = (raw) => {
    const n = normalizeTeam(raw);
    if (!n) return;
    const display = String(raw).replace(/^\[[^\]]*\]\s*/, "").trim();
    if (!display) return;
    const prev = preferred.get(n);
    if (!prev || display.length > prev.length) preferred.set(n, display);
  };
  for (const g of [...(poolGames ?? []), ...(bracketGames ?? [])]) {
    add(g.team1_name ?? g.team1);
    add(g.team2_name ?? g.team2);
  }
  return [...preferred.values()].sort((a, b) => a.localeCompare(b));
}
