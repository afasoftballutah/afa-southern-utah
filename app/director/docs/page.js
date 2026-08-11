import { requireDirectorPage } from "@/lib/staff-gate";
import { listAllSiteDocuments } from "@/lib/site-docs";
import { loadRulesBookForDirector, RULEBOOK_SLUG } from "@/lib/rules-book";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DocsDesk from "@/components/scorekeeper/DocsDesk";

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
          : `${published + 1} on file`
      }
      back="/director"
    >
      <p className="t-meta">
        Open <strong>Rules</strong> to view or edit the public rule book.
        Other rows are waivers, umpire agreements, and house rules.
      </p>
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
        <DocsDesk
          otherDocs={otherDocs}
          bookSource={book.source}
          bookSections={book.sections}
          bookDocId={book.doc?.id ?? null}
          bookTitle={book.doc?.title || book.source.title}
          bookSourceUrl={book.doc?.source_url || book.source.url}
          bookPublished={book.doc?.published !== false}
        />
      )}
    </DirectorShell>
  );
}
