// Roster rules that span more than one team.
//
// Policy: Coed + Men's or Coed + Women's is fine (different genders).
// Two teams of the *same* gender (two Men's, two Women's, two Coed) is the
// problem — managers may still add (soft), but both teams get a director
// "Check" flag and the manager sees a warning.

import { normalizeName } from "@/lib/identity";

/**
 * Does this member row look like the same person?
 */
function samePerson(member, { name, birthDate, playerId }) {
  if (playerId && member.player_id && playerId === member.player_id) {
    return true;
  }
  const norm = normalizeName(name);
  if (!norm || normalizeName(member.name) !== norm) return false;
  const birth = birthDate ? String(birthDate).slice(0, 10) : null;
  const mb = member.birth_date ? String(member.birth_date).slice(0, 10) : null;
  if (birth && mb && birth === mb) return true;
  // Name match with no DOB on either side — weak but same as prior gate
  if (!birth && !mb) return true;
  return false;
}

/**
 * Other active teams in this tournament that already list this person.
 *
 * @returns {Promise<Array<{
 *   registrationId: string,
 *   teamName: string,
 *   gender: string|null,
 *   sameGender: boolean,
 *   memberId: string,
 *   memberName: string,
 * }>>}
 */
export async function findPlayerOtherTeams(
  supabase,
  {
    tournamentId,
    divisionGender = null,
    name,
    birthDate = null,
    playerId = null,
    exceptRegistrationId = null,
    exceptMemberId = null,
  }
) {
  if (!tournamentId) return [];

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, team_name, status, divisions(gender)")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");

  const otherRegs = (regs ?? []).filter(
    (r) => !exceptRegistrationId || r.id !== exceptRegistrationId
  );
  if (otherRegs.length === 0) return [];

  const regIds = otherRegs.map((r) => r.id);
  const { data: members } = await supabase
    .from("roster_members")
    .select("id, name, birth_date, player_id, registration_id, removed_at")
    .in("registration_id", regIds)
    .is("removed_at", null);

  const regBy = new Map(otherRegs.map((r) => [r.id, r]));
  const out = [];

  for (const m of members ?? []) {
    if (exceptMemberId && m.id === exceptMemberId) continue;
    if (!samePerson(m, { name, birthDate, playerId })) continue;
    const reg = regBy.get(m.registration_id);
    if (!reg) continue;
    const g = reg.divisions?.gender ?? null;
    const sameGender = Boolean(
      divisionGender && g && divisionGender === g
    );
    out.push({
      registrationId: reg.id,
      teamName: reg.team_name ?? "another team",
      gender: g,
      sameGender,
      memberId: m.id,
      memberName: m.name,
    });
  }
  return out;
}

/**
 * Probe for dual-roster conflicts that matter: same division gender only.
 * Men's + Coed or Women's + Coed is not a conflict.
 * Always allows the add (ok: true); same-gender hits produce warnings.
 *
 * @returns {Promise<{
 *   ok: true,
 *   warnings: string[],
 *   otherTeams: Array,
 *   hasSameGender: boolean,
 * }>}
 */
export async function checkPlayerDualRoster(supabase, args) {
  const all = await findPlayerOtherTeams(supabase, args);
  // Only same-gender doubles are policy issues
  const otherTeams = all.filter((o) => o.sameGender);
  if (otherTeams.length === 0) {
    return { ok: true, warnings: [], otherTeams: [], hasSameGender: false };
  }

  const warnings = otherTeams.map(
    (o) =>
      `${args.name?.trim() || "This player"} is already on ${o.teamName} (same gender — Men's, Women's, or Coed).`
  );
  warnings.push(
    "Two teams of the same gender (including two Coed teams) is not allowed under AFA rules — both teams will show a Check flag for the director."
  );

  return { ok: true, warnings, otherTeams, hasSameGender: true };
}

/**
 * Legacy name used by roster routes. Soft: never blocks; returns warnings.
 * @returns {Promise<{ ok: true, warnings?: string[], otherTeams?: Array, hasSameGender?: boolean } | { ok: false, error: string, otherTeam?: string }>}
 */
export async function assertPlayerFreeForTeam(supabase, args) {
  // Soft dual-roster: managers may add; flags go to director.
  return checkPlayerDualRoster(supabase, args);
}

/**
 * For a full roster, find members who also appear on another *same-gender*
 * team this event. Coed + Men's / Coed + Women's does not count.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{
 *   tournamentId: string,
 *   registrationId: string,
 *   divisionGender?: string|null,
 *   members: Array<{ id: string, name: string, playerId?: string|null, player_id?: string|null, birthDate?: string|null, birth_date?: string|null }>,
 * }} args
 * @returns {Promise<{
 *   ok: boolean,
 *   conflicts: Array<{ memberId: string, name: string, otherTeams: string[] }>,
 * }>}
 */
export async function dualRosterCheckForRoster(supabase, {
  tournamentId,
  registrationId,
  divisionGender = null,
  members,
}) {
  const active = (members ?? []).filter((m) => m && !m.removed);
  if (!tournamentId || active.length === 0) {
    return { ok: true, conflicts: [] };
  }

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, team_name, status, divisions(gender)")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");

  // Only compare against other teams with the same division gender
  const thisGender =
    divisionGender ??
    (regs ?? []).find((r) => r.id === registrationId)?.divisions?.gender ??
    null;

  const others = (regs ?? []).filter((r) => {
    if (r.id === registrationId) return false;
    if (!thisGender) return true; // unknown gender: be conservative
    const g = r.divisions?.gender ?? null;
    return g === thisGender;
  });
  if (others.length === 0) return { ok: true, conflicts: [] };

  const { data: allMembers } = await supabase
    .from("roster_members")
    .select("id, name, birth_date, player_id, registration_id, removed_at")
    .in(
      "registration_id",
      others.map((r) => r.id)
    )
    .is("removed_at", null);

  const regBy = new Map(others.map((r) => [r.id, r]));
  const conflicts = [];

  for (const m of active) {
    const playerId = m.playerId ?? m.player_id ?? null;
    const birthDate = m.birthDate ?? m.birth_date ?? null;
    const name = m.name;
    const teams = new Set();
    for (const o of allMembers ?? []) {
      if (samePerson(o, { name, birthDate, playerId })) {
        const reg = regBy.get(o.registration_id);
        if (reg?.team_name) teams.add(reg.team_name);
      }
    }
    if (teams.size > 0) {
      conflicts.push({
        memberId: m.id,
        name: m.name,
        otherTeams: [...teams],
      });
    }
  }

  return { ok: conflicts.length === 0, conflicts };
}

/**
 * Release an active roster member into the tournament free-agent pool.
 * Soft-removes them from their current roster.
 */
export async function releaseMemberToPool(supabase, memberId) {
  const { data: member } = await supabase
    .from("roster_members")
    .select(
      "id, name, birth_date, player_id, registration_id, removed_at, signed_at, role"
    )
    .eq("id", memberId)
    .maybeSingle();

  if (!member) return { ok: false, error: "Player not found" };
  if (member.removed_at) return { ok: false, error: `${member.name} is already off the roster` };

  const { data: reg } = await supabase
    .from("registrations")
    .select("id, tournament_id, manager_member_id, divisions(gender)")
    .eq("id", member.registration_id)
    .maybeSingle();

  if (!reg) return { ok: false, error: "Registration not found" };
  if (member.id === reg.manager_member_id) {
    return { ok: false, error: "The manager cannot be released to the pool" };
  }

  const now = new Date().toISOString();
  const { error: remErr } = await supabase
    .from("roster_members")
    .update({ removed_at: now })
    .eq("id", member.id);
  if (remErr) return { ok: false, error: "Could not remove from roster" };

  const { data: poolRow, error: poolErr } = await supabase
    .from("tournament_player_pool")
    .insert({
      tournament_id: reg.tournament_id,
      division_gender: reg.divisions?.gender ?? null,
      player_id: member.player_id,
      name: member.name,
      birth_date: member.birth_date,
      source_registration_id: reg.id,
      source_member_id: member.id,
      released_at: now,
    })
    .select("id, name, birth_date, division_gender")
    .single();

  if (poolErr) {
    console.error("pool insert failed", poolErr);
    return { ok: false, error: "Could not add to free-agent pool" };
  }

  return { ok: true, poolEntry: poolRow, member };
}
