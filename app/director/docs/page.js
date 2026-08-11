import { requireDirectorPage } from "@/lib/staff-gate";
import { listAllSiteDocuments } from "@/lib/site-docs";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DocsAdmin from "@/components/scorekeeper/DocsAdmin";

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

  const { docs, needsMigration } = await listAllSiteDocuments();
  const published = docs.filter((d) => d.published).length;

  return (
    <DirectorShell
      title="Documents"
      count={
        docs.length === 0
          ? "Rules · umpires · waivers"
          : `${published} live · ${docs.length} total`
      }
      back="/director"
    >
      <p className="t-meta">
        Edit public Rules, Umpire Agreements, and Waivers. The top published
        waiver is what teams sign at registration.
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
      {!needsMigration && <DocsAdmin initialDocs={docs} />}
    </DirectorShell>
  );
}
