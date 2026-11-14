import { revalidatePath } from "next/cache";
import { getPublicClient, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Safety fallback, not the primary freshness path. Score / result writes
 * call revalidateTournamentPages immediately. 24 hours covers a date
 * rollover (Completed chip, registration window, bracket-live default)
 * for a first paint or a no-JS client, before the client clock catches up.
 */
export const SAFETY_REVALIDATE = 86400;

export async function tournamentSlugParams() {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getPublicClient()
    .from("tournaments")
    .select("slug")
    .not("slug", "is", null);
  if (error) {
    console.error("tournamentSlugParams", error.message);
    return [];
  }
  return (data ?? []).filter((t) => t?.slug).map((t) => ({ slug: t.slug }));
}

export async function tournamentDivisionParams() {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getPublicClient()
    .from("divisions")
    .select("id, tournaments!inner(slug)");
  if (error) {
    console.error("tournamentDivisionParams", error.message);
    return [];
  }
  return (data ?? [])
    .map((d) => ({ slug: d.tournaments?.slug, divisionId: d.id }))
    .filter((p) => p.slug && p.divisionId);
}

async function resolveSlugs({ slug, tournamentId, divisionId, divisionIds, gameId, poolGameId } = {}) {
  if (slug) return [slug];
  const slugs = new Set();
  const db = getPublicClient();

  if (tournamentId) {
    const { data, error } = await db
      .from("tournaments")
      .select("slug")
      .eq("id", tournamentId)
      .maybeSingle();
    if (error) throw error;
    if (data?.slug) slugs.add(data.slug);
  }

  const ids = [...new Set([divisionId, ...(divisionIds ?? [])].filter(Boolean))];
  if (ids.length) {
    const { data, error } = await db
      .from("divisions")
      .select("id, tournaments!inner(slug)")
      .in("id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.tournaments?.slug) slugs.add(row.tournaments.slug);
    }
  }

  if (gameId) {
    const { data, error } = await db
      .from("games")
      .select("divisions!inner(tournaments!inner(slug))")
      .eq("id", gameId)
      .maybeSingle();
    if (error) throw error;
    const s = data?.divisions?.tournaments?.slug;
    if (s) slugs.add(s);
  }

  if (poolGameId) {
    const { data, error } = await db
      .from("pool_games")
      .select("divisions!inner(tournaments!inner(slug))")
      .eq("id", poolGameId)
      .maybeSingle();
    if (error) throw error;
    const s = data?.divisions?.tournaments?.slug;
    if (s) slugs.add(s);
  }

  return [...slugs];
}

/**
 * Invalidate the public tournament tree (detail, schedule, divisions)
 * plus the home and /tournaments list, which also show scores / finished.
 * Lookup failures are logged and swallowed so a cache miss never fails a
 * score write.
 */
export async function revalidateTournamentPages(opts = {}) {
  try {
    const slugs = await resolveSlugs(opts);
    if (!slugs.length) return;
    for (const s of slugs) {
      revalidatePath(`/tournaments/${s}`, "layout");
    }
    revalidatePath("/tournaments");
    revalidatePath("/");
  } catch (err) {
    console.error("revalidateTournamentPages failed", err);
  }
}
