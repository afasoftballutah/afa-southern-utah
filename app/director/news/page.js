import { requireDirectorPage } from "@/lib/staff-gate";
import { listAllNews } from "@/lib/news";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import NewsAdmin from "@/components/scorekeeper/NewsAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "News — Director" };

export default async function DirectorNewsPage() {
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">News</h1>
        <PinPad room="director" />
      </div>
    );
  }

  const { posts, needsMigration } = await listAllNews();

  return (
    <DirectorShell
      title="News"
      count={
        posts.length === 0
          ? "Homepage updates"
          : `${posts.filter((p) => p.published).length} live · ${posts.length} total`
      }
      back="/director"
    >
      {needsMigration && (
        <div className="card p-4">
          <p className="t-strong">Database table missing</p>
          <p className="t-meta">
            Run{" "}
            <code className="text-sm">
              supabase/migration-2026-08-11-news-posts.sql
            </code>{" "}
            in Supabase, then refresh.
          </p>
        </div>
      )}
      <NewsAdmin initialPosts={posts} />
    </DirectorShell>
  );
}
