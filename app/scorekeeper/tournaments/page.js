import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import NewTournament from "@/components/scorekeeper/NewTournament";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournaments — Control Center" };

const COLUMNS = [
  { key: "name", label: "Tournament" },
  { key: "date", label: "Starts", width: "7rem" },
  { key: "venue", label: "Where", hideBelow: "sm" },
  { key: "divisions", label: "Divs", align: "right", width: "4.5rem" },
  { key: "teams", label: "Teams", align: "right", width: "5rem" },
  { key: "fee", label: "Fee", align: "right", width: "5rem" },
  { key: "closes", label: "Closes", width: "7rem" },
  { key: "open", label: "Open", type: "check", align: "center", width: "5rem" },
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
      tags,
      search: `${t.name} ${t.venue_name ?? ""} ${t.start_date}`,
      cells: {
        name: t.name,
        date: t.start_date,
        venue: t.venue_name ?? "—",
        divisions: (t.divisions ?? []).length,
        teams: (t.registrations ?? []).length,
        // A blank fee is not a free tournament, it is one nobody has priced.
        fee: t.entry_fee_cents == null ? "—" : `$${t.entry_fee_cents / 100}`,
        closes: t.registration_closes ? String(t.registration_closes).slice(0, 10) : "—",
        open,
      },
      sortValues: {
        name: t.name.toLowerCase(),
        date: t.start_date,
        divisions: (t.divisions ?? []).length,
        teams: (t.registrations ?? []).length,
        fee: t.entry_fee_cents ?? -1,
        closes: t.registration_closes ?? "",
      },
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
      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        filters={FILTERS}
        defaultSort={{ key: "date", dir: "asc" }}
        empty="No tournament matches that."
        searchPlaceholder="Tournament or venue…"
      />
    </DirectorShell>
  );
}
