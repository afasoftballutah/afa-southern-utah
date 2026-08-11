import { getServiceClient } from "@/lib/supabase";
import { requireDirectorSession } from "@/lib/scorekeeper-auth";
import { DOC_KINDS, slugifyTitle } from "@/lib/site-docs-kinds";

export const runtime = "nodejs";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

const KIND_SET = new Set(DOC_KINDS.map((k) => k.value));

/** List all documents (director). */
export async function GET() {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_documents")
    .select("*")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) {
    if (
      error.code === "42P01" ||
      error.message?.includes("site_documents")
    ) {
      return Response.json({ docs: [], needsMigration: true });
    }
    return bad(error.message, 500);
  }
  return Response.json({ docs: data ?? [] });
}

/** Create a document. */
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
  const kind = String(body.kind ?? "other").trim();
  if (!title) return bad("Title is required");
  if (!KIND_SET.has(kind)) return bad("Invalid document type");
  // Waivers and short notices need body; rules may be PDF-only via source_url
  const sourceUrl = body.sourceUrl ? String(body.sourceUrl).trim() : null;
  if (!text && !sourceUrl) {
    return bad("Add body text or a PDF / link URL");
  }

  let slug = String(body.slug ?? "").trim() || slugifyTitle(title);
  slug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug) slug = `doc-${Date.now().toString(36)}`;

  const published = body.published !== false;
  const sortOrder = Number.isFinite(Number(body.sortOrder))
    ? Math.trunc(Number(body.sortOrder))
    : 0;
  const version = body.version ? String(body.version).trim() : null;

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  // Ensure unique slug
  const { data: clash } = await supabase
    .from("site_documents")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const { data, error } = await supabase
    .from("site_documents")
    .insert({
      slug,
      kind,
      title,
      body: text,
      source_url: sourceUrl || null,
      published,
      sort_order: sortOrder,
      version: version || null,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    console.error("site_documents insert", error);
    return bad(error.message || "Could not save", 500);
  }
  return Response.json({ doc: data });
}
