/**
 * Directory people for manager "pick existing player" dropdowns.
 * Service-role only — players table is not public.
 */

/**
 * @param {Array<{
 *   id: string,
 *   full_name?: string|null,
 *   legal_first_name?: string|null,
 *   legal_last_name?: string|null,
 *   preferred_name?: string|null,
 *   gender?: string|null,
 *   birth_date?: string|null,
 * }>} rows
 */
export function mapDirectoryPlayers(rows) {
  return (rows ?? [])
    .map((p) => {
      const first =
        String(p.legal_first_name ?? "").trim() ||
        String(p.full_name ?? "").trim().split(/\s+/)[0] ||
        "";
      const last =
        String(p.legal_last_name ?? "").trim() ||
        String(p.full_name ?? "")
          .trim()
          .split(/\s+/)
          .slice(1)
          .join(" ") ||
        "";
      const label =
        [last, first].filter(Boolean).join(", ") ||
        p.preferred_name ||
        p.full_name ||
        "—";
      const birth = p.birth_date ? String(p.birth_date).slice(0, 10) : null;
      return {
        id: p.id,
        label: birth ? `${label} (${birth})` : label,
        search: [
          first,
          last,
          p.preferred_name,
          p.full_name,
          birth,
          p.gender,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        firstName: first,
        lastName: last,
        gender: p.gender === "M" || p.gender === "F" ? p.gender : null,
      };
    })
    .filter((p) => p.firstName || p.lastName)
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ limit?: number }} [opts]
 */
export async function loadKnownPlayers(supabase, { limit = 800 } = {}) {
  const { data, error } = await supabase
    .from("players")
    .select(
      "id, full_name, legal_first_name, legal_last_name, preferred_name, gender, birth_date"
    )
    .is("merged_into_id", null)
    .order("legal_last_name", { ascending: true, nullsFirst: false })
    .order("legal_first_name", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error("loadKnownPlayers", error);
    return [];
  }
  return mapDirectoryPlayers(data);
}
