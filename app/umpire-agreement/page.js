import Link from "next/link";
import { listPublishedSiteDocuments } from "@/lib/site-docs";
import SiteDocList from "@/components/SiteDocList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Umpire Agreement — AFA Southern Utah" };

export default async function UmpireAgreementPage() {
  const docs = await listPublishedSiteDocuments("umpire_agreement");

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="t-title">Umpire Agreement</h1>
      <p className="t-meta">
        Terms for officiating AFA Southern Utah events. Directors maintain
        these under Control Center → Documents.
      </p>
      <SiteDocList
        docs={docs}
        empty="No umpire agreement published yet. Check back soon, or ask the area director."
      />
      <p>
        <Link href="/rules" className="btn-transient">
          ← Rules
        </Link>
      </p>
    </div>
  );
}
