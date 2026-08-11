import Link from "next/link";
import { RULES_SOURCE, RULES_SECTIONS } from "@/lib/content/rules";
import { listPublishedSiteDocuments } from "@/lib/site-docs";
import RulesBrowser from "@/components/RulesBrowser";
import SiteDocList from "@/components/SiteDocList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rules — AFA Southern Utah" };

// Director-managed rules docs first; full transcribed book still searchable below.
export default async function RulesPage() {
  const directorRules = await listPublishedSiteDocuments("rules");

  return (
    <div className="space-y-4">
      <h1 className="t-title">Rules</h1>
      <p className="t-meta">
        {RULES_SOURCE.title} ({RULES_SOURCE.year})
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={RULES_SOURCE.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-info"
        >
          View the original PDF
        </a>
        <Link href="/umpire-agreement" className="btn-transient">
          Umpire agreement
        </Link>
      </div>
      <p className="text-sm text-afa-ink/70">
        Tournament-specific rules are listed on each tournament page.
      </p>

      {directorRules.length > 0 && (
        <section className="space-y-2">
          <h2 className="t-heading">Southern Utah &amp; house rules</h2>
          <SiteDocList docs={directorRules} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="t-heading">Rule book (searchable)</h2>
        <RulesBrowser sections={RULES_SECTIONS} />
      </section>
    </div>
  );
}
