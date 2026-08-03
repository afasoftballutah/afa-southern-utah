// Resolving a registration to stored identities: the people on the roster,
// and the team itself.
//
// Team identity (2026-08-03):
//   normalized team name + manager + gender
// Class is NOT part of the key — teams promote (D → E) and stay the same club.
// Without a manager, never merge: each resolve creates a new team row so two
// bulk "Fallen" entries stay separate until managers are known.

/** Trim, collapse whitespace, fold curly apostrophes, lowercase. */
export function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .replace(/’/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Find or create the person a roster entry refers to.
 *
 * Identity is normalized name + birth date. Without a birth date there is no
 * safe key: matching on name alone would fuse two different people, which is
 * worse than leaving a row unlinked for a director to look at. So a member
 * with no birth date returns null, on purpose.
 *
 * @returns {Promise<string|null>} player id, or null when unresolvable
 */
export async function resolvePlayer(supabase, { name, birthDate }) {
  const normalized = normalizeName(name);
  if (!normalized || !birthDate) return null;

  const { data: existing } = await supabase
    .from("players")
    .select("id, merged_into_id")
    .eq("normalized_name", normalized)
    .eq("birth_date", birthDate)
    .maybeSingle();

  // Follow a merge rather than resurrecting a row a director already retired.
  if (existing) return existing.merged_into_id ?? existing.id;

  const { data: created, error } = await supabase
    .from("players")
    .insert({ full_name: String(name).trim(), normalized_name: normalized, birth_date: birthDate })
    .select("id")
    .single();

  // A concurrent registration can win the race to the unique index. Losing it
  // is not an error — the row we wanted now exists, so read it back.
  if (error) {
    const { data: raced } = await supabase
      .from("players")
      .select("id, merged_into_id")
      .eq("normalized_name", normalized)
      .eq("birth_date", birthDate)
      .maybeSingle();
    return raced ? (raced.merged_into_id ?? raced.id) : null;
  }
  return created.id;
}

/**
 * Find or create the team a registration refers to.
 *
 * Key: normalized team name + manager + gender.
 * - Same name, two managers → two teams.
 * - Same name + manager, promoted class → same team (class is not a key).
 * - No manager yet → always a new team (never merge on name alone).
 *
 * @returns {Promise<string|null>} team id, or null when unresolvable
 */
export async function resolveTeam(supabase, { teamName, divisionId, managerName }) {
  const normalized = normalizeName(teamName);
  if (!normalized || !divisionId) return null;

  const managerNorm = normalizeName(managerName);
  const managerDisplay = managerName ? String(managerName).trim() : null;

  const { data: division } = await supabase
    .from("divisions")
    .select("gender, class_id")
    .eq("id", divisionId)
    .maybeSingle();

  const gender = division?.gender ?? null;
  const classId = division?.class_id ?? null;

  // No manager → never match an existing row. Two director bulk-adds of
  // "Fallen" stay two teams until managers exist.
  if (!managerNorm) {
    const { data: created, error } = await supabase
      .from("teams")
      .insert({
        name: String(teamName).trim(),
        normalized_name: normalized,
        gender,
        class_id: classId,
        manager_name: null,
        manager_normalized_name: null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("resolveTeam (no manager) insert failed", error);
      return null;
    }
    return created.id;
  }

  const match = (q) => {
    let out = q
      .eq("normalized_name", normalized)
      .eq("manager_normalized_name", managerNorm);
    return gender === null ? out.is("gender", null) : out.eq("gender", gender);
  };

  const { data: existing } = await match(
    supabase.from("teams").select("id, merged_into_id, class_id")
  ).maybeSingle();

  if (existing) {
    const id = existing.merged_into_id ?? existing.id;
    // Keep class attribute current when the club promotes (not part of the key)
    if (classId && existing.class_id !== classId && !existing.merged_into_id) {
      await supabase.from("teams").update({ class_id: classId }).eq("id", id);
    }
    return id;
  }

  const { data: created, error } = await supabase
    .from("teams")
    .insert({
      name: String(teamName).trim(),
      normalized_name: normalized,
      gender,
      class_id: classId,
      manager_name: managerDisplay,
      manager_normalized_name: managerNorm,
    })
    .select("id")
    .single();

  if (error) {
    const { data: raced } = await match(
      supabase.from("teams").select("id, merged_into_id")
    ).maybeSingle();
    return raced ? (raced.merged_into_id ?? raced.id) : null;
  }
  return created.id;
}
