import { notFound } from "next/navigation";
import Link from "next/link";
import { getTournamentBySlug, getTournamentSchedule } from "@/lib/data";
import { formatFieldTime } from "@/lib/bracket/tree";
import ScheduleBrowser from "@/components/ScheduleBrowser";

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `Schedule — ${tournament.name}` : "Schedule" };
}

export default async function SchedulePage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const rawRows = await getTournamentSchedule(slug);
  // Server hands the client caption PARTS, not a pre-built string
  // (dispatch-brief-16) — ScheduleBrowser composes the right caption per
  // view (By field drops the field name since it's the row heading; By
  // time drops the time since its heading already states it). timeLabel
  // keeps using the same Mountain-time helper this page has always used
  // (lib/bracket/tree.js) — no new date code on the client. Pass no
  // `field` key so it returns just the weekday/time half.
  const rows = rawRows.map((row) => ({
    ...row,
    timeLabel: formatFieldTime({ scheduled_time: row.scheduledTime }),
  }));

  return (
    <div className="space-y-6">
      <Link
        href={`/tournaments/${slug}`}
        className="text-sm text-afa-navy underline min-h-11 inline-flex items-center"
      >
        ← {tournament.name}
      </Link>

      <div className="text-center">
        <h1 className="font-display text-2xl text-afa-navy">Schedule</h1>
        <p className="text-sm text-afa-ink/70 mt-1">{tournament.name}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-afa-ink/70">No schedule posted yet — check back.</p>
      ) : (
        <ScheduleBrowser rows={rows} />
      )}
    </div>
  );
}
