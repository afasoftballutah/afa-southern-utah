import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import FilterList from "@/components/scorekeeper/FilterList";
import NewTournament from "@/components/scorekeeper/NewTournament";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournaments — Control Center" };

const SORTS = [
  { key: "date", label: "Soonest first" },
  { key: "dateDesc", label: "Newest first", dir: "desc" },
  { key: "name", label: "Name (A–Z)" },
];
const FILTERS = [
  { key: "open", label: "Open for registration", tag: "open" },
  { key: "nofee", label: "No entry fee set", tag: "nofee" },
  { key: "nodeadline", label: "No deadline set", tag: "nodeadline" },
];

export default async function TournamentsPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Tournaments</h1>
        <PinPad />
      </div>
    );
  }

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, slug, start_date, end_date, entry_fee_cents, registration_closes, is_placeholder, venue_name, divisions(id), registrations(id)")
    .order("start_date");

  const tournaments = (data ?? []).filter((t) => !t.is_placeholder);

  const rows = tournaments.map((t) => {
    const open = isRegistrationOpen(t);
    const tags = [];
    if (open) tags.push("open");
    if (t.entry_fee_cents == null) tags.push("nofee");
    if (!t.registration_closes) tags.push("nodeadline");
    return {
      key: t.id,
      href: `/scorekeeper/tournaments/${t.id}`,
      label: t.name,
      sub: `${t.start_date} · ${t.venue_name ?? "No venue"}`,
      stats: [
        { label: "teams", value: String((t.registrations ?? []).length) },
        { label: "divisions", value: String((t.divisions ?? []).length) },
      ],
      footer: open
        ? t.registration_closes
          ? `Open · closes ${String(t.registration_closes).slice(0, 10)}`
          : "Open · no deadline set"
        : "Registration closed",
      tone: open ? undefined : "quiet",
      haystack: `${t.name} ${t.venue_name ?? ""} ${t.start_date}`,
      tags,
      sortValues: { date: t.start_date, dateDesc: t.start_date, name: t.name },
    };
  });

  const missingFee = rows.filter((r) => r.tags.includes("nofee")).length;
  const missingDeadline = rows.filter((r) => r.tags.includes("nodeadline")).length;

  return (
    <DirectorShell title="Tournaments" count={`${rows.length} on file`}>
      {(missingFee > 0 || missingDeadline > 0) && (
        <div className="card p-4">
          <p className="t-strong">Some terms are missing</p>
          <p className="t-meta">
            {missingFee} without an entry fee, {missingDeadline} without a
            registration deadline. Those lines stay off the public page until
            they are filled in.
          </p>
        </div>
      )}
      <NewTournament />
      <FilterList rows={rows} sorts={SORTS} filters={FILTERS} empty="No tournament matches that." />
    </DirectorShell>
  );
}
