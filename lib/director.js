import { getServiceClient } from "@/lib/supabase";

// Every read the control center does. Service-role only — these queries touch
// names, dates of birth, emails and phone numbers, and no public page may
// call them.
//
// The league is tens of teams and hundreds of people, so these load whole
// tables and join in memory. That is deliberate: it keeps every page one
// round trip and the filtering instant. If it ever outgrows that it needs
// paging, not a different shape.

/** Everything the control center counts on its front page. */
export async function getDirectorCounts() {
  const supabase = getServiceClient();
  const [players, teams, registrations, tournaments, progress] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }).is("merged_into_id", null),
    supabase.from("teams").select("id", { count: "exact", head: true }).is("merged_into_id", null),
    supabase.from("registrations").select("id, status"),
    supabase.from("tournaments").select("id, start_date, end_date, registration_closes, is_placeholder"),
    supabase.from("registration_signing_progress").select("*"),
  ]);

  const regs = registrations.data ?? [];
  const prog = progress.data ?? [];
  const outstanding = prog.reduce(
    (n, p) => n + Math.max(0, (p.active_members ?? 0) - (p.signed_members ?? 0)),
    0
  );

  return {
    players: players.count ?? 0,
    teams: teams.count ?? 0,
    registrations: regs.filter((r) => r.status !== "withdrawn").length,
    outstandingSignatures: outstanding,
    tournaments: (tournaments.data ?? []).filter((t) => !t.is_placeholder).length,
    tournamentRows: tournaments.data ?? [],
  };
}

/** Every person, with the teams and tournaments they have played for. */
export async function listPeople() {
  const supabase = getServiceClient();
  const [{ data: players }, { data: members }, { data: registrations }, { data: tournaments }] =
    await Promise.all([
      supabase.from("players").select("*").order("full_name"),
      supabase
        .from("roster_members")
        .select("id, player_id, registration_id, name, role, signed_at, removed_at, email, phone"),
      supabase.from("registrations").select("id, team_name, tournament_id, manager_member_id"),
      supabase.from("tournaments").select("id, name, start_date"),
    ]);

  const regBy = new Map((registrations ?? []).map((r) => [r.id, r]));
  const tourBy = new Map((tournaments ?? []).map((t) => [t.id, t]));

  const byPlayer = new Map();
  for (const m of members ?? []) {
    if (!m.player_id) continue;
    if (!byPlayer.has(m.player_id)) byPlayer.set(m.player_id, []);
    const reg = regBy.get(m.registration_id);
    byPlayer.get(m.player_id).push({
      memberId: m.id,
      registrationId: m.registration_id,
      teamName: reg?.team_name ?? "—",
      tournamentName: tourBy.get(reg?.tournament_id)?.name ?? "—",
      startDate: tourBy.get(reg?.tournament_id)?.start_date ?? null,
      role: reg?.manager_member_id === m.id ? "manager" : m.role,
      signed: Boolean(m.signed_at),
      removed: Boolean(m.removed_at),
      email: m.email,
      phone: m.phone,
    });
  }

  // Roster entries with no person behind them — no birth date, so nothing
  // safe to match on. The director needs to see these, not have them hidden.
  const unmatched = (members ?? [])
    .filter((m) => !m.player_id && !m.removed_at)
    .map((m) => {
      const reg = regBy.get(m.registration_id);
      return {
        memberId: m.id,
        name: m.name,
        teamName: reg?.team_name ?? "—",
        tournamentName: tourBy.get(reg?.tournament_id)?.name ?? "—",
      };
    });

  return {
    players: (players ?? [])
      .filter((p) => !p.merged_into_id)
      .map((p) => ({ ...p, appearances: byPlayer.get(p.id) ?? [] })),
    unmatched,
  };
}

/** One person, everything about them. */
export async function getPerson(id) {
  const { players } = await listPeople();
  return players.find((p) => p.id === id) ?? null;
}

/** Every team, with the tournaments they entered. */
export async function listTeams() {
  const supabase = getServiceClient();
  const [{ data: teams }, { data: registrations }, { data: tournaments }, { data: classes }] =
    await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase
        .from("registrations")
        .select("id, team_id, team_name, tournament_id, division_id, status, paid_at, manager_name, manager_email, manager_phone"),
      supabase.from("tournaments").select("id, name, start_date"),
      supabase.from("classes").select("id, name"),
    ]);

  const tourBy = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const classBy = new Map((classes ?? []).map((c) => [c.id, c.name]));

  const byTeam = new Map();
  for (const r of registrations ?? []) {
    if (!r.team_id) continue;
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
    byTeam.get(r.team_id).push({
      registrationId: r.id,
      tournamentName: tourBy.get(r.tournament_id)?.name ?? "—",
      startDate: tourBy.get(r.tournament_id)?.start_date ?? null,
      status: r.status,
      paid: Boolean(r.paid_at),
      managerName: r.manager_name,
      managerEmail: r.manager_email,
      managerPhone: r.manager_phone,
    });
  }

  return (teams ?? [])
    .filter((t) => !t.merged_into_id)
    .map((t) => ({
      ...t,
      className: t.class_id ? (classBy.get(t.class_id) ?? null) : null,
      registrations: byTeam.get(t.id) ?? [],
    }));
}

export async function getTeam(id) {
  const teams = await listTeams();
  return teams.find((t) => t.id === id) ?? null;
}

/** Gender as a director would say it, not as the column stores it. */
export function genderLabel(gender) {
  return { mens: "Men's", womens: "Women's", coed: "Coed" }[gender] ?? null;
}

/** "Coed · D" — the scope line used everywhere a team is named. */
export function scopeLabel(gender, className) {
  return [genderLabel(gender), className].filter(Boolean).join(" · ");
}
