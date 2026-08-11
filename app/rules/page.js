import Link from "next/link";
import { loadRulesBook, RULEBOOK_SLUG } from "@/lib/rules-book";
import { listPublishedSiteDocuments } from "@/lib/site-docs";
import RulesBrowser from "@/components/RulesBrowser";
import SiteDocList from "@/components/SiteDocList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rules — AFA Southern Utah" };

// Full searchable rule book is the page. Extra house-rule docs sit below.
export default async function RulesPage() {
  const book = await loadRulesBook();
  const allRulesDocs = await listPublishedSiteDocuments("rules");
  const houseRules = allRulesDocs.filter(
    (d) => d.slug !== RULEBOOK_SLUG && !String(d.body || "").trim().startsWith('{"format":"rules-sections-v1"')
  );

  return (
    <div className="space-y-4">
      <h1 className="t-title">Rules</h1>
      <p className="t-meta">
        {book.source.title}
        {book.source.year ? ` (${book.source.year})` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {book.source.url && (
          <a
            href={book.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-info"
          >
            View the original PDF
          </a>
        )}
        <Link href="/umpire-agreement" className="btn-transient">
          Umpire agreement
        </Link>
      </div>
      <p className="text-sm text-afa-ink/70">
        Tournament-specific rules are listed on each tournament page.
      </p>

      <RulesBrowser sections={book.sections} />

      {houseRules.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="t-heading">Southern Utah &amp; house rules</h2>
          <SiteDocList docs={houseRules} />
        </section>
      )}
    </div>
  );
}
