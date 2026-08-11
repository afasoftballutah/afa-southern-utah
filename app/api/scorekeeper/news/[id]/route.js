import { getServiceClient } from "@/lib/supabase";
import { requireDirectorSession } from "@/lib/scorekeeper-auth";

export const runtime = "nodejs";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function PATCH(request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return bad("Which post?");

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON");
  }

  const patch = { updated_at: new Date().toISOString() };
  if ("title" in body) {
    const title = String(body.title ?? "").trim();
    if (!title) return bad("Title is required");
    patch.title = title;
  }
  if ("body" in body) {
    const text = String(body.body ?? "").trim();
    if (!text) return bad("Body is required");
    patch.body = text;
  }
  if ("linkUrl" in body) {
    patch.link_url = body.linkUrl ? String(body.linkUrl).trim() : null;
  }
  if ("linkLabel" in body) {
    patch.link_label = body.linkLabel ? String(body.linkLabel).trim() : null;
  }
  if ("published" in body) {
    patch.published = Boolean(body.published);
    if (body.published) patch.published_at = new Date().toISOString();
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("news_posts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("news update", error);
    return bad(error.message || "Could not update", 500);
  }
  return Response.json({ ok: true, post: data });
}

export async function DELETE(_request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return bad("Which post?");

  const supabase = getServiceClient();
  const { error } = await supabase.from("news_posts").delete().eq("id", id);
  if (error) {
    console.error("news delete", error);
    return bad(error.message || "Could not delete", 500);
  }
  return Response.json({ ok: true });
}
