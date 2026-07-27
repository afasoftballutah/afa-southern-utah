import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { listTeams, scopeLabel } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import FilterList from "@/components/scorekeeper/FilterList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams — Control Center" };

// Plain data only — see the note in the People list.
const SORTS = [
  { key: "name", label: "Name (A–Z)" },
  { key: "entries", label: "Most tournaments first", dir: "desc" },
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
    const scope = scopeLabel(t.gender, t.className);
    const unpaid = t.registrations.filter((r) => !r.paid && r.status !== "withdrawn").length;
    const tags = [];
    if (unpaid > 0) tags.push("unpaid");
    if (t.gender) tags.push(t.gender);
    return {
      key: t.id,
      href: `/scorekeeper/teams/${t.id}`,
      label: t.name,
      sub: scope || "No division scope",
      right: String(t.registrations.length),
      rightSub: unpaid > 0 ? `${unpaid} unpaid` : "paid up",
      haystack: `${t.name} ${scope} ${t.registrations.map((r) => r.tournamentName).join(" ")}`,
      tags,
      sortValues: { name: t.name, entries: t.registrations.length },
    };
  });

  return (
    <DirectorShell title="Teams" count={`${teams.length} on file`}>
      <FilterList
        rows={rows}
        sorts={SORTS}
        filters={FILTERS}
        empty="No team matches that."
      />
      <p className="t-meta">
        A team is a name plus gender and class, so the same name in Men&rsquo;s D
        and Coed E is two teams.{" "}
        <Link href="/scorekeeper/players" className="underline">People</Link>
      </p>
    </DirectorShell>
  );
}
