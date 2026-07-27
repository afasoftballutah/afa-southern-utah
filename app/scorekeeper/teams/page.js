import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { listTeams, scopeLabel, genderLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams — Control Center" };

// Plain data only — see the note in the People list.
const COLUMNS = [
  { key: "name", label: "Team" },
  { key: "class", label: "Class", width: "5rem" },
  { key: "division", label: "Division", width: "6rem" },
  { key: "manager", label: "Manager", hideBelow: "sm" },
  { key: "events", label: "Events", align: "right", width: "5rem" },
  { key: "paid", label: "Paid", type: "check", align: "center", width: "5rem" },
];

const FILTERS = [
  { key: "unpaid", label: "Unpaid", tag: "unpaid" },
  { key: "mens", label: "Men's", tag: "mens" },
  { key: "womens", label: "Women's", tag: "womens" },
  { key: "coed", label: "Coed", tag: "coed" },
];

export default async function TeamsPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Teams</h1>
        <PinPad />
      </div>
    );
  }

  const teams = await listTeams();

  const rows = teams.map((t) => {
    const live = t.registrations.filter((r) => r.status !== "withdrawn");
    const unpaid = live.filter((r) => !r.paid).length;
    const tags = [];
    if (unpaid > 0) tags.push("unpaid");
    if (t.gender) tags.push(t.gender);
    return {
      key: t.id,
      href: `/scorekeeper/teams/${t.id}`,
      tags,
      search: `${t.name} ${scopeLabel(t.gender, t.className)} ${t.registrations.map((r) => r.tournamentName).join(" ")}`,
      cells: {
        name: t.name,
        // A team IS its name plus gender and class, so both are columns, not
        // a subtitle. Fallen D and Fallen E are two teams.
        class: t.className ?? "—",
        division: genderLabel(t.gender) ?? "—",
        manager: t.registrations[0]?.managerName ?? "—",
        events: t.registrations.length,
        paid: live.length > 0 && unpaid === 0,
      },
      sortValues: { name: t.name.toLowerCase(), events: t.registrations.length },
    };
  });

  return (
    <DirectorShell title="Teams" count={`${teams.length} on file`}>
      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        filters={FILTERS}
        defaultSort={{ key: "name", dir: "asc" }}
        empty="No team matches that."
        searchPlaceholder="Team, class or tournament…"
      />
      <p className="t-meta">
        A team is a name plus gender and class, so the same name in Men&rsquo;s D
        and Coed E is two teams.{" "}
        <Link href="/scorekeeper/players" className="underline">Players</Link>
      </p>
    </DirectorShell>
  );
}
