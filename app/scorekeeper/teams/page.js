import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { listTeams, scopeLabel, genderLabel, moneyCents } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams — Control Center" };

// Balance = sum of (entry fee − amount paid) across live registrations.
// Not a payment processor — fee from tournament, paid_at / amount from director.
const COLUMNS = [
  { key: "name", label: "Team" },
  { key: "class", label: "Class", width: "5rem" },
  { key: "division", label: "Division", width: "6rem" },
  { key: "manager", label: "Manager", hideBelow: "sm" },
  { key: "events", label: "Events", align: "right", width: "5rem" },
  { key: "balance", label: "Balance", align: "right", width: "6.5rem" },
];

const FILTERS = [
  { key: "unpaid", label: "Unpaid", tag: "unpaid" },
  { key: "mens", label: "Men's", tag: "mens" },
  { key: "womens", label: "Women's", tag: "womens" },
  { key: "coed", label: "Coed", tag: "coed" },
];

function balanceCell(money) {
  if (!money || money.liveCount === 0) {
    return <span className="text-afa-muted/60">—</span>;
  }
  if (money.balanceTotal != null) {
    if (money.balanceTotal > 0) {
      return (
        <span className="font-semibold text-afa-red">
          {moneyCents(money.balanceTotal)}
          {money.unknownUnpaid > 0 ? "*" : ""}
        </span>
      );
    }
    return (
      <span className="font-semibold text-afa-go">
        {moneyCents(0)}
        {money.unknownUnpaid > 0 ? "*" : ""}
      </span>
    );
  }
  // Fee unknown for every live reg — fall back to paid/unpaid language
  if (money.hasUnpaid) {
    return <span className="font-semibold text-afa-red">Unpaid</span>;
  }
  return <span className="font-semibold text-afa-go">Paid</span>;
}

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
    const money = t.money;
    const tags = [];
    if (money?.hasUnpaid) tags.push("unpaid");
    if (t.gender) tags.push(t.gender);
    // Sort: unknown unpaid last among balances; null balance sorts as -1 when paid, 1e12 when unpaid
    let sortBalance = 0;
    if (money?.liveCount) {
      if (money.balanceTotal != null) sortBalance = money.balanceTotal;
      else sortBalance = money.hasUnpaid ? 1e12 : 0;
    }
    return {
      key: t.id,
      href: `/scorekeeper/teams/${t.id}`,
      tags,
      search: `${t.name} ${scopeLabel(t.gender, t.className)} ${t.registrations.map((r) => r.tournamentName).join(" ")}`,
      cells: {
        name: t.name,
        class: t.className ?? "—",
        division: genderLabel(t.gender) ?? "—",
        manager: t.registrations[0]?.managerName ?? "—",
        events: t.registrations.length,
        balance: balanceCell(money),
      },
      sortValues: {
        name: t.name.toLowerCase(),
        events: t.registrations.length,
        balance: sortBalance,
      },
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
        A team is name + manager + gender (class not in the key — clubs promote).
        Most Heat Stroker rows were bulk-entered from results with no manager,
        so they show — until you set one on the registration. Balance is entry
        fee minus recorded paid.{" "}
        <Link href="/scorekeeper/players" className="underline">
          Players
        </Link>
      </p>
    </DirectorShell>
  );
}
