import { requireDirectorPage } from "@/lib/staff-gate";
import { listAllSiteDocuments } from "@/lib/site-docs";
import { loadRulesBookForDirector, RULEBOOK_SLUG } from "@/lib/rules-book";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DocsAdmin from "@/components/scorekeeper/DocsAdmin";
import RulesBookEditor from "@/components/scorekeeper/RulesBookEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents — Director" };

export default async function DirectorDocsPage() {
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Documents</h1>
        <PinPad room="director" />
      </div>
    );
  }

  const [{ docs, needsMigration }, book] = await Promise.all([
    listAllSiteDocuments(),
    loadRulesBookForDirector(),
  ]);
  const otherDocs = docs.filter((d) => d.slug !== RULEBOOK_SLUG);
  const published = otherDocs.filter((d) => d.published).length;

  return (
    <DirectorShell
      title="Documents"
      count={
        needsMigration
          ? "Rules · umpires · waivers"
          : `Rule book · ${published} other live`
      }
      back="/director"
    >
      {needsMigration && (
        <div className="card p-4">
          <p className="t-strong">Database table missing</p>
          <p className="t-meta">
            Run{" "}
            <code className="text-sm">
              supabase/migration-2026-08-11-site-documents.sql
            </code>{" "}
            in Supabase, then refresh.
          </p>
        </div>
      )}

      {!needsMigration && (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="t-heading">Rule book</h2>
            <p className="t-meta">
              Same searchable book as the public Rules page. Edit and save to
              update the site.
            </p>
            <RulesBookEditor
              initialSource={book.source}
              initialSections={book.sections}
              docId={book.doc?.id ?? null}
              initialTitle={book.doc?.title || book.source.title}
              initialSourceUrl={book.doc?.source_url || book.source.url}
              initialPublished={book.doc?.published !== false}
            />
          </section>

          <section className="space-y-3">
            <h2 className="t-heading">Other documents</h2>
            <p className="t-meta">
              Umpire agreements, waivers, and extra house rules. The top
              published waiver is what teams sign at registration.
            </p>
            <DocsAdmin initialDocs={otherDocs} />
          </section>
        </div>
      )}
    </DirectorShell>
  );
}
