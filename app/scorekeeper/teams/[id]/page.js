import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getTeam, listTeams, scopeLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import RowAction from "@/components/scorekeeper/RowAction";
import ContactButton from "@/components/scorekeeper/ContactButton";

export const dynamic = "force-dynamic"; // reads PII — never cached

// Same table as everywhere else. This page used to be a bespoke list of cards
// with 44px buttons, which is why it looked like a different product from the
// four pages around it (JD, 2026-07-27: "We need the formatting to be
// consistent everywhere").
const COLUMNS = [
  { key: "tournament", label: "Tournament" },
  { key: "manager", label: "Manager" },
  { key: "status", label: "Status", width: "7rem" },
  { key: "paid", label: "Paid", type: "check", align: "center", width: "5rem" },
  { key: "actions", label: "", align: "right", width: "11rem" },
];

// Titles are PUBLIC — Next runs this for anyone who requests the URL.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) return { title: "Team" };
  const team = await getTeam(id);
  return { title: team ? `${team.name} — Control Center` : "Team" };
}

export default async function TeamPage({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Team</h1>
        <PinPad />
      </div>
    );
  }

  const team = await getTeam(id);
  if (!team) notFound();
  const all = await listTeams();
  const others = all
    .filter((t) => t.id !== team.id)
    .map((t) => ({
      id: t.id,
      label: `${t.name}${scopeLabel(t.gender, t.className) ? ` (${scopeLabel(t.gender, t.className)})` : ""}`,
    }));

  const rows = team.registrations.map((r) => ({
    key: r.registrationId,
    search: `${r.tournamentName} ${r.managerName ?? ""}`,
    sortValues: { tournament: r.startDate ?? "", manager: r.managerName ?? "" },
    cells: {
      tournament: (
        <Link href={`/scorekeeper/registrations/${r.registrationId}`} className="hover:underline">
          {r.tournamentName}
        </Link>
      ),
      manager: r.managerName ?? "—",
      status: r.status,
      paid: r.paid,
      actions: (
        <span className="flex justify-end gap-2">
          <ContactButton name={r.managerName} phone={r.managerPhone} email={r.managerEmail} />
          <Link href={`/scorekeeper/registrations/${r.registrationId}`} className="pill">
            Roster
          </Link>
        </span>
      ),
    },
  }));

  return (
    <DirectorShell
      title={team.name}
      count={scopeLabel(team.gender, team.className) || "No division scope"}
      back="/scorekeeper/teams"
      inline={
        <RowAction
          label="Merge duplicate"
          title={`Merge into ${team.name}`}
          note="Every registration on the duplicate moves here. Nothing is deleted."
          placeholder="Pick the duplicate…"
          action="mergeTeams"
          valueKey="dropId"
          payload={{ keepId: team.id }}
          options={others}
        />
      }
    >
      <h2 className="t-heading">Tournaments entered</h2>
      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        defaultSort={{ key: "tournament", dir: "desc" }}
        empty="This team has not entered a tournament yet."
        searchPlaceholder="Find a tournament…"
      />
    </DirectorShell>
  );
}
