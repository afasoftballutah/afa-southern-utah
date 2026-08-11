// Director-managed public documents (rules, umpire agreements, waivers).

import { getServiceClient } from "@/lib/supabase";
import {
  RELEASE_TEXT,
  RELEASE_TEXT_VERSION,
} from "@/lib/waiver";
export {
  DOC_KINDS,
  kindLabel,
  slugifyTitle,
} from "@/lib/site-docs-kinds";

function isMissingTable(error) {
  if (!error) return false;
  const msg = error.message || "";
  return (
    error.code === "42P01" ||
    msg.includes("site_documents") ||
    msg.includes("does not exist")
  );
}

/** All docs for director desk (including drafts). */
export async function listAllSiteDocuments() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_documents")
    .select("*")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingTable(error)) {
      return { docs: [], needsMigration: true };
    }
    console.error("listAllSiteDocuments", error);
    return { docs: [], needsMigration: false, error: error.message };
  }
  return { docs: data ?? [], needsMigration: false };
}

/** Published docs for public pages. Optional kind filter. */
export async function listPublishedSiteDocuments(kind = null) {
  const supabase = getServiceClient();
  let q = supabase
    .from("site_documents")
    .select("id, slug, kind, title, body, source_url, version, sort_order, updated_at")
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    console.error("listPublishedSiteDocuments", error);
    return [];
  }
  return data ?? [];
}

export async function getPublishedDocBySlug(slug) {
  if (!slug) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_documents")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    console.error("getPublishedDocBySlug", error);
    return null;
  }
  return data;
}

/**
 * Active liability release for registration / signing / PDF.
 * Uses the first published waiver by sort_order, else code defaults.
 */
export async function getActiveWaiver() {
  const docs = await listPublishedSiteDocuments("waiver");
  const doc = docs[0] ?? null;
  if (doc?.body?.trim()) {
    return {
      text: doc.body.trim(),
      version: doc.version?.trim() || `waiver-db-${doc.id.slice(0, 8)}`,
      title: doc.title,
      fromDb: true,
    };
  }
  return {
    text: RELEASE_TEXT,
    version: RELEASE_TEXT_VERSION,
    title: "Liability Release",
    fromDb: false,
  };
}
