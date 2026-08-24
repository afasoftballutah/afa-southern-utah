import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { seatFromDivision } from "@/lib/division-layout";
import {
  isPlaceholderManager,
  sameManager,
  sameRegistrationName,
} from "@/lib/register-key";

/**
 * Registered teams for a tournament (names + seats only — no tokens).
 * Service-role: registrations are not publicly readable.
 */
export async function listTournamentTeams(tournament) {
  if (!tournament?.id || !isSupabaseConfigured()) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(
      "team_name, manager_name, division_id, status, divisions(id, name, display_name, gender)"
    )
    .eq("tournament_id", tournament.id)
    .neq("status", "withdrawn")
    .order("team_name");
  if (error) {
    console.error("listTournamentTeams", error);
    return [];
  }

  const GENDER_ORDER = { womens: 0, mens: 1, coed: 2 };
  const list = [];
  for (const row of data ?? []) {
    const name = String(row.team_name ?? "").trim();
    if (!name) continue;
    const seat = seatFromDivision(row.divisions);
    const manager = String(row.manager_name ?? "").trim();
    list.push({
      name,
      divisionId: row.division_id,
      divisionIds: row.division_id ? [row.division_id] : [],
      managerNames: manager ? [manager] : [],
      genderKey: seat?.genderKey || "",
      genderLabel: seat?.genderLabel || "",
      levelLabel: seat?.levelLabel || "",
      seatLabel: seat?.seatLabel || "",
    });
  }
  return list.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName) return byName;
    const ga = GENDER_ORDER[a.genderKey] ?? 9;
    const gb = GENDER_ORDER[b.genderKey] ?? 9;
    if (ga !== gb) return ga - gb;
    return (a.seatLabel || "").localeCompare(b.seatLabel || "");
  });
}

/**
 * Divisions this club actually plays — same team name AND same manager.
 * TBD stubs do not inherit Brayden Brooks' seats, or each other's.
 */
export function clubDivisionIds(
  directory,
  { teamName, managerName, managerEmail, divisionId } = {}
) {
  if (!teamName) return [];
  if (isPlaceholderManager(managerName) && !managerEmail) {
    return divisionId ? [divisionId] : [];
  }
  const me = { managerName, managerEmail };
  const ids = [];
  for (const t of directory ?? []) {
    if (!sameRegistrationName(t.name, teamName)) continue;
    const them = { managerName: (t.managerNames ?? [])[0] || "" };
    if (!sameManager(me, them)) continue;
    if (t.divisionId && !ids.includes(t.divisionId)) ids.push(t.divisionId);
  }
  return ids;
}

/** Fold directory teams into getTeamSummaries so the grid can highlight them.
 * Same name is not the same club — do not union TBD Fallen into Brooks Fallen.
 */
export function mergeTeamSummaries(summaries = {}, directory = []) {
  const out = { ...summaries };
  for (const t of directory) {
    if (out[t.name]) continue;
    out[t.name] = {
      team: t.name,
      stage: null,
      divisionId: t.divisionId || null,
      divisionIds: t.divisionIds ?? [],
      next: null,
      played: 0,
      w: 0,
      l: 0,
    };
  }
  return out;
}
