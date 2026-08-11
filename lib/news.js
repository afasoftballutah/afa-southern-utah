import { getServiceClient } from "@/lib/supabase";

/** Published posts for the homepage, newest first. */
export async function listPublishedNews({ limit = 12 } = {}) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("news_posts")
    .select("id, title, body, link_url, link_label, published_at, image_urls")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Table may not exist yet on a stale deploy
    if (error.code === "42P01" || error.message?.includes("news_posts")) {
      return [];
    }
    console.error("listPublishedNews", error);
    return [];
  }
  return data ?? [];
}

/** All posts for the director list (drafts + published). */
export async function listAllNews() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("news_posts")
    .select("*")
    .order("published_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.message?.includes("news_posts")) {
      return { posts: [], needsMigration: true };
    }
    throw error;
  }
  return { posts: data ?? [], needsMigration: false };
}

export function formatNewsDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Denver",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** Normalize image_urls from DB (jsonb array or null). */
export function newsImageUrls(post) {
  const raw = post?.image_urls;
  if (!Array.isArray(raw)) return [];
  return raw.map((u) => String(u ?? "").trim()).filter(Boolean);
}
