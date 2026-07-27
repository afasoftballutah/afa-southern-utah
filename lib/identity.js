// Resolving a registration to stored identities: the people on the roster,
// and the team itself.
//
// These MUST agree with the backfill in
// supabase/migration-2026-07-27-people-and-teams.sql. If normalisation drifts
// between the two, a person registered before the drift and after it becomes
// two people, and nothing will say so.

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
 * Identity is normalized name + the DIVISION's gender and class — the same
 * key the public team pages use. Two teams called "Backwards K" in Men's D
 * and Coed E are two teams.
 *
 * @returns {Promise<string|null>} team id, or null when unresolvable
 */
export async function resolveTeam(supabase, { teamName, divisionId }) {
  const normalized = normalizeName(teamName);
  if (!normalized || !divisionId) return null;

  const { data: division } = await supabase
    .from("divisions")
    .select("gender, class_id")
    .eq("id", divisionId)
    .maybeSingle();

  const gender = division?.gender ?? null;
  const classId = division?.class_id ?? null;

  const match = (q) => {
    let out = q.eq("normalized_name", normalized);
    out = gender === null ? out.is("gender", null) : out.eq("gender", gender);
    return classId === null ? out.is("class_id", null) : out.eq("class_id", classId);
  };

  const { data: existing } = await match(
    supabase.from("teams").select("id, merged_into_id")
  ).maybeSingle();

  if (existing) return existing.merged_into_id ?? existing.id;

  const { data: created, error } = await supabase
    .from("teams")
    .insert({
      name: String(teamName).trim(),
      normalized_name: normalized,
      gender,
      class_id: classId,
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
