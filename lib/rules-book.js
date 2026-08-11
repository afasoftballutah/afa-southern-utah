// Live rule book: director-editable copy in site_documents, with static fallback.

import { getServiceClient } from "@/lib/supabase";
import { RULES_SOURCE, RULES_SECTIONS } from "@/lib/content/rules";

export const RULEBOOK_SLUG = "afa-slow-pitch-rule-book";
const FORMAT = "rules-sections-v1";

function isMissingTable(error) {
  if (!error) return false;
  const msg = error.message || "";
  return (
    error.code === "42P01" ||
    msg.includes("site_documents") ||
    msg.includes("does not exist")
  );
}

/** Parse body if it is our structured rule book JSON. */
export function parseRulesBookBody(body) {
  if (!body || typeof body !== "string") return null;
  const t = body.trim();
  if (!t.startsWith("{")) return null;
  try {
    const data = JSON.parse(t);
    if (data?.format !== FORMAT) return null;
    if (!Array.isArray(data.sections) || data.sections.length === 0) return null;
    return {
      source: {
        title: data.source?.title || RULES_SOURCE.title,
        year: data.source?.year || RULES_SOURCE.year,
        url: data.source?.url || RULES_SOURCE.url,
      },
      sections: data.sections,
    };
  } catch {
    return null;
  }
}

export function serializeRulesBook({ source, sections }) {
  return JSON.stringify(
    {
      format: FORMAT,
      source: {
        title: source?.title || RULES_SOURCE.title,
        year: source?.year || RULES_SOURCE.year,
        url: source?.url || RULES_SOURCE.url,
      },
      sections,
    },
    null,
    0
  );
}

/**
 * Rule book for public + director. Prefers published DB copy; else static file.
 */
export async function loadRulesBook() {
  const fallback = {
    source: RULES_SOURCE,
    sections: RULES_SECTIONS,
    doc: null,
    fromDb: false,
  };

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("site_documents")
      .select("*")
      .eq("slug", RULEBOOK_SLUG)
      .maybeSingle();

    if (error) {
      if (!isMissingTable(error)) console.error("loadRulesBook", error);
      return fallback;
    }
    if (!data) return fallback;

    const parsed = parseRulesBookBody(data.body);
    if (!parsed) {
      // Stub blurb still on file — use static book but keep doc id for save.
      return {
        ...fallback,
        doc: data,
        fromDb: false,
      };
    }

    // Unpublished: public gets static; director still sees draft via loadRulesBookForDirector
    if (!data.published) {
      return {
        ...fallback,
        doc: data,
        fromDb: false,
      };
    }

    return {
      source: parsed.source,
      sections: parsed.sections,
      doc: data,
      fromDb: true,
    };
  } catch (err) {
    console.error("loadRulesBook", err);
    return fallback;
  }
}

/** Director always sees DB draft if structured, else static as starting point. */
export async function loadRulesBookForDirector() {
  const publicBook = await loadRulesBook();
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("site_documents")
      .select("*")
      .eq("slug", RULEBOOK_SLUG)
      .maybeSingle();

    if (error || !data) {
      return {
        source: publicBook.source,
        sections: publicBook.sections,
        doc: data ?? null,
        fromDb: publicBook.fromDb,
      };
    }

    const parsed = parseRulesBookBody(data.body);
    if (parsed) {
      return {
        source: {
          ...parsed.source,
          url: data.source_url || parsed.source.url,
          title: data.title || parsed.source.title,
        },
        sections: parsed.sections,
        doc: data,
        fromDb: true,
      };
    }

    return {
      source: {
        ...RULES_SOURCE,
        title: data.title || RULES_SOURCE.title,
        url: data.source_url || RULES_SOURCE.url,
      },
      sections: RULES_SECTIONS,
      doc: data,
      fromDb: false,
    };
  } catch (err) {
    console.error("loadRulesBookForDirector", err);
    return publicBook;
  }
}

/** True when a site_documents row is the structured main rule book. */
export function isStructuredRuleBook(doc) {
  return doc?.slug === RULEBOOK_SLUG || Boolean(parseRulesBookBody(doc?.body));
}
