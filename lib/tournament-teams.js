import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { seatFromDivision } from "@/lib/division-layout";

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

  const byName = new Map();
  for (const row of data ?? []) {
    const name = String(row.team_name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const seat = seatFromDivision(row.divisions);
    const cur = byName.get(key) ?? {
      name,
      divisionId: row.division_id,
      divisionIds: [],
      seats: [],
      managerNames: [],
      genderKey: seat?.genderKey || "",
      genderLabel: seat?.genderLabel || "",
      levelLabel: seat?.levelLabel || "",
      seatLabel: seat?.seatLabel || "",
    };
    const manager = String(row.manager_name ?? "").trim();
    if (manager && !cur.managerNames.includes(manager)) {
      cur.managerNames.push(manager);
    }
    if (row.division_id && !cur.divisionIds.includes(row.division_id)) {
      cur.divisionIds.push(row.division_id);
    }
    if (seat?.seatLabel && !cur.seats.includes(seat.seatLabel)) {
      cur.seats.push(seat.seatLabel);
    }
    if (!cur.genderKey && seat?.genderKey) {
      cur.genderKey = seat.genderKey;
      cur.genderLabel = seat.genderLabel;
      cur.levelLabel = seat.levelLabel;
      cur.seatLabel = seat.seatLabel;
      cur.divisionId = row.division_id;
    }
    byName.set(key, cur);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Fold directory teams into getTeamSummaries so the grid can highlight them. */
export function mergeTeamSummaries(summaries = {}, directory = []) {
  const out = { ...summaries };
  for (const t of directory) {
    const existing = out[t.name];
    if (existing) {
      const ids = new Set([
        ...(existing.divisionIds ?? []),
        ...(t.divisionIds ?? []),
      ]);
      if (existing.divisionId) ids.add(existing.divisionId);
      if (t.divisionId) ids.add(t.divisionId);
      out[t.name] = {
        ...existing,
        divisionIds: [...ids],
        divisionId: existing.divisionId || t.divisionId,
      };
    } else {
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
  }
  return out;
}
