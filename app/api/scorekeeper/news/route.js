import { getServiceClient } from "@/lib/supabase";
import { requireDirectorSession } from "@/lib/scorekeeper-auth";

export const runtime = "nodejs";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

/** List all posts (director) or create a post. */
export async function GET() {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("news_posts")
    .select("*")
    .order("published_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.message?.includes("news_posts")) {
      return Response.json({ posts: [], needsMigration: true });
    }
    return bad(error.message, 500);
  }
  return Response.json({ posts: data ?? [] });
}

export async function POST(request) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON");
  }

  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title) return bad("Title is required");
  if (!text) return bad("Body is required");

  const linkUrl = body.linkUrl ? String(body.linkUrl).trim() : null;
  const linkLabel = body.linkLabel ? String(body.linkLabel).trim() : null;
  const published = body.published !== false;

  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("news_posts")
    .insert({
      title,
      body: text,
      link_url: linkUrl || null,
      link_label: linkLabel || null,
      published,
      published_at: published ? now : now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    console.error("news create", error);
    return bad(error.message || "Could not create post", 500);
  }
  return Response.json({ ok: true, post: data });
}
