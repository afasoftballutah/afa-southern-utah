import { getServiceClient } from "@/lib/supabase";
import { requireDirectorSession } from "@/lib/scorekeeper-auth";
import { DOC_KINDS } from "@/lib/site-docs-kinds";

export const runtime = "nodejs";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

const KIND_SET = new Set(DOC_KINDS.map((k) => k.value));

/** Update a document. */
export async function PATCH(request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return bad("Missing id");

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON");
  }

  const patch = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!title) return bad("Title is required");
    patch.title = title;
  }
  if (body.body !== undefined) {
    patch.body = String(body.body ?? "").trim();
  }
  if (body.kind !== undefined) {
    const kind = String(body.kind ?? "").trim();
    if (!KIND_SET.has(kind)) return bad("Invalid document type");
    patch.kind = kind;
  }
  if (body.sourceUrl !== undefined) {
    const u = String(body.sourceUrl ?? "").trim();
    patch.source_url = u || null;
  }
  if (body.published !== undefined) {
    patch.published = Boolean(body.published);
  }
  if (body.sortOrder !== undefined) {
    patch.sort_order = Number.isFinite(Number(body.sortOrder))
      ? Math.trunc(Number(body.sortOrder))
      : 0;
  }
  if (body.version !== undefined) {
    const v = String(body.version ?? "").trim();
    patch.version = v || null;
  }
  if (body.slug !== undefined) {
    let slug = String(body.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    if (!slug) return bad("Slug is required");
    patch.slug = slug;
  }

  if (
    patch.body !== undefined &&
    !patch.body &&
    body.sourceUrl === undefined
  ) {
    // Allow empty body only when an existing or incoming source_url covers it;
    // checked after load if needed.
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_documents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("site_documents update", error);
    if (error.code === "23505") return bad("That slug is already in use", 409);
    return bad(error.message || "Could not update", 500);
  }
  if (!data) return bad("Document not found", 404);
  return Response.json({ doc: data });
}

/** Delete a document. */
export async function DELETE(_request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return bad("Missing id");

  const supabase = getServiceClient();
  const { error } = await supabase.from("site_documents").delete().eq("id", id);
  if (error) {
    console.error("site_documents delete", error);
    return bad(error.message || "Could not delete", 500);
  }
  return Response.json({ ok: true });
}
