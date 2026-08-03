// Roster rules that span more than one team.
//
// A player may not be active on two teams in the same tournament that share
// a division gender (two Men's teams, two Coed teams, etc.). Different
// genders in the same weekend are allowed (e.g. Men's + Coed only if we ever
// permit it — for now the key is tournament + gender).

import { normalizeName } from "@/lib/identity";

/**
 * @returns {Promise<{ ok: true } | { ok: false, error: string, otherTeam?: string }>}
 */
export async function assertPlayerFreeForTeam(supabase, {
  tournamentId,
  divisionGender,
  name,
  birthDate,
  playerId,
  /** Skip this registration (adding to self / re-adding). */
  exceptRegistrationId = null,
  /** Skip this roster member row (moving within a flow). */
  exceptMemberId = null,
}) {
  if (!tournamentId) return { ok: true };

  // Active members on other registrations in this tournament
  const { data: regs } = await supabase
    .from("registrations")
    .select("id, team_name, status, divisions(gender)")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");

  const sameGenderRegIds = (regs ?? [])
    .filter((r) => {
      if (exceptRegistrationId && r.id === exceptRegistrationId) return false;
      const g = r.divisions?.gender ?? null;
      // If we know both genders, they must match. Unknown gender is treated
      // as a conflict to be safe when the division has no gender set.
      if (divisionGender && g && g !== divisionGender) return false;
      return true;
    })
    .map((r) => r.id);

  if (sameGenderRegIds.length === 0) return { ok: true };

  const { data: members } = await supabase
    .from("roster_members")
    .select("id, name, birth_date, player_id, registration_id, removed_at")
    .in("registration_id", sameGenderRegIds)
    .is("removed_at", null);

  const norm = normalizeName(name);
  const birth = birthDate ? String(birthDate).slice(0, 10) : null;

  for (const m of members ?? []) {
    if (exceptMemberId && m.id === exceptMemberId) continue;

    let samePerson = false;
    if (playerId && m.player_id && playerId === m.player_id) {
      samePerson = true;
    } else if (norm && normalizeName(m.name) === norm) {
      // Name + birth date is the person key; name alone is too weak unless
      // neither side has a birth date and we only warn... we block when
      // both births match, or when both lack birth and names match (same
      // manager typing the same person twice across teams).
      const mb = m.birth_date ? String(m.birth_date).slice(0, 10) : null;
      if (birth && mb && birth === mb) samePerson = true;
      else if (!birth && !mb) samePerson = true;
    }

    if (samePerson) {
      const other = (regs ?? []).find((r) => r.id === m.registration_id);
      return {
        ok: false,
        error: `${name.trim()} is already on ${other?.team_name ?? "another team"} in this tournament (same gender). Remove or release them there first.`,
        otherTeam: other?.team_name ?? null,
      };
    }
  }

  return { ok: true };
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
