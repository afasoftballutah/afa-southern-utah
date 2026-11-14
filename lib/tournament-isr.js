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

async function resolveTargets({ slug, tournamentId, divisionId, divisionIds, gameId, poolGameId } = {}) {
  const slugs = new Set(slug ? [slug] : []);
  const resolvedDivisionIds = new Set(
    [divisionId, ...(divisionIds ?? [])].filter(Boolean)
  );
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

  const ids = [...resolvedDivisionIds];
  if (ids.length) {
    const { data, error } = await db
      .from("divisions")
      .select("id, tournaments!inner(slug)")
      .in("id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.tournaments?.slug) slugs.add(row.tournaments.slug);
      if (row.id) resolvedDivisionIds.add(row.id);
    }
  }

  if (gameId) {
    const { data, error } = await db
      .from("games")
      .select("division_id, divisions!inner(id, tournaments!inner(slug))")
      .eq("id", gameId)
      .maybeSingle();
    if (error) throw error;
    const s = data?.divisions?.tournaments?.slug;
    if (s) slugs.add(s);
    const d = data?.division_id ?? data?.divisions?.id;
    if (d) resolvedDivisionIds.add(d);
  }

  if (poolGameId) {
    const { data, error } = await db
      .from("pool_games")
      .select("division_id, divisions!inner(id, tournaments!inner(slug))")
      .eq("id", poolGameId)
      .maybeSingle();
    if (error) throw error;
    const s = data?.divisions?.tournaments?.slug;
    if (s) slugs.add(s);
    const d = data?.division_id ?? data?.divisions?.id;
    if (d) resolvedDivisionIds.add(d);
  }

  return { slugs: [...slugs], divisionIds: [...resolvedDivisionIds] };
}

/**
 * Invalidate the public tournament tree (detail, schedule, divisions)
 * plus the home and /tournaments list, which also show scores / finished.
 * Lookup failures are logged and swallowed so a cache miss never fails a
 * score write.
 *
 * Literal paths must omit the type argument (Next.js docs: if the path is
 * `/product/1`, omit type). Passing "layout" on `/tournaments/${slug}` does
 * not match a layout file — there is none under app/tournaments/[slug] —
 * and does not invalidate the prerendered page, schedule, or division
 * routes. After PR #66 those routes are SSG, so a no-op left the build
 * snapshot in the CDN until the 24h safety fallback.
 */
export async function revalidateTournamentPages(opts = {}) {
  try {
    const { slugs, divisionIds } = await resolveTargets(opts);
    if (!slugs.length) return;

    for (const s of slugs) {
      revalidatePath(`/tournaments/${s}`);
      revalidatePath(`/tournaments/${s}/schedule`);
      for (const id of divisionIds) {
        revalidatePath(`/tournaments/${s}/division/${id}`);
      }
    }
    // Route-file form (type required when the path has [slug]).
    // 'layout' covers schedule and division pages nested under [slug]
    // even though that segment has no layout.js; 'page' covers the
    // tournament page itself.
    revalidatePath("/tournaments/[slug]", "layout");
    revalidatePath("/tournaments/[slug]", "page");
    revalidatePath("/tournaments/[slug]/schedule", "page");
    revalidatePath("/tournaments/[slug]/division/[divisionId]", "page");
    revalidatePath("/tournaments");
    revalidatePath("/");
  } catch (err) {
    console.error("revalidateTournamentPages failed", err);
  }
}
