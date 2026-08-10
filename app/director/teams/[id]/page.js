import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasValidDirectorSession } from "@/lib/scorekeeper-auth";
import { requireDirectorPage } from "@/lib/staff-gate";
import { getTeam, listTeams, scopeLabel, moneyCents } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import RowAction from "@/components/scorekeeper/RowAction";
import ContactButton from "@/components/scorekeeper/ContactButton";

export const dynamic = "force-dynamic"; // reads PII — never cached

const COLUMNS = [
  { key: "tournament", label: "Tournament" },
  { key: "manager", label: "Manager" },
  { key: "status", label: "Status", width: "7rem" },
  { key: "due", label: "Due", align: "right", width: "5rem" },
  { key: "paid", label: "Paid", align: "right", width: "5rem" },
  { key: "balance", label: "Balance", align: "right", width: "5.5rem" },
  { key: "actions", label: "", align: "right", width: "11rem" },
];

function dueCell(r) {
  if (r.external && r.dueCents == null) {
    return <span className="text-afa-muted/70">External</span>;
  }
  if (r.dueCents == null) return <span className="text-afa-muted/60">—</span>;
  return moneyCents(r.dueCents);
}

function paidCell(r) {
  if (r.paid || (r.paidCents ?? 0) > 0) {
    if (r.amountPaidCents != null || r.dueCents != null) {
      return (
        <span className="font-semibold text-afa-go">
          {moneyCents(r.paidCents) ?? "☑"}
        </span>
      );
    }
    return <span className="font-semibold text-afa-go">☑</span>;
  }
  return <span className="text-afa-muted/60">—</span>;
}

function balanceCell(r) {
  if (r.status === "withdrawn") {
    return <span className="text-afa-muted/60">—</span>;
  }
  if (r.balanceCents != null) {
    if (r.balanceCents > 0) {
      return (
        <span className="font-semibold text-afa-red">{moneyCents(r.balanceCents)}</span>
      );
    }
    return <span className="font-semibold text-afa-go">{moneyCents(0)}</span>;
  }
  if (r.fullyPaid) {
    return <span className="font-semibold text-afa-go">Paid</span>;
  }
  return <span className="font-semibold text-afa-red">Unpaid</span>;
}

// Titles are PUBLIC — Next runs this for anyone who requests the URL.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const store = await cookies();
  if (!hasValidDirectorSession(store)) return { title: "Team" };
  const team = await getTeam(id);
  return { title: team ? `${team.name} — Director` : "Team" };
}

export default async function TeamPage({ params }) {
  const { id } = await params;
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Team</h1>
        <PinPad room="director" />
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

  const money = team.money;
  const countBits = [
    scopeLabel(team.gender, team.className) || "No division scope",
    money?.balanceTotal != null
      ? money.balanceTotal > 0
        ? `Owes ${moneyCents(money.balanceTotal)}`
        : "Balance $0"
      : money?.hasUnpaid
        ? "Unpaid"
        : money?.liveCount
          ? "Paid"
          : null,
  ].filter(Boolean);

  const rows = team.registrations.map((r) => ({
    key: r.registrationId,
    search: `${r.tournamentName} ${r.managerName ?? ""}`,
    sortValues: {
      tournament: r.startDate ?? "",
      manager: r.managerName ?? "",
      due: r.dueCents ?? -1,
      paid: r.paidCents ?? 0,
      balance: r.balanceCents ?? (r.fullyPaid ? 0 : 1e12),
    },
    cells: {
      tournament: (
        <Link href={`/director/registrations/${r.registrationId}`} className="hover:underline">
          {r.tournamentName}
          {r.external ? (
            <span className="t-meta ml-1">(external)</span>
          ) : null}
        </Link>
      ),
      manager: r.managerName ?? "—",
      status: r.status,
      due: dueCell(r),
      paid: paidCell(r),
      balance: balanceCell(r),
      actions: (
        <span className="flex justify-end gap-2">
          <ContactButton name={r.managerName} phone={r.managerPhone} email={r.managerEmail} />
          <Link href={`/director/registrations/${r.registrationId}`} className="pill">
            Roster
          </Link>
        </span>
      ),
    },
  }));

  return (
    <DirectorShell
      title={team.name}
      count={countBits.join(" · ")}
      back="/director/teams"
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
        width="max-w-5xl"
      />
      <p className="t-meta">
        Due is the tournament entry fee. Paid is what the director recorded.
        Balance is what is still owed.
      </p>
    </DirectorShell>
  );
}
