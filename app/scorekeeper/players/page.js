import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { listPeople } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import FilterList from "@/components/scorekeeper/FilterList";

export const dynamic = "force-dynamic"; // reads PII — never cached
export const metadata = { title: "People — Control Center" };

// Plain data only — a server component cannot hand a function to a client
// one, so rows carry their own sort values and tags and FilterList does the
// comparing.
const SORTS = [
  { key: "name", label: "Name (A–Z)" },
  { key: "appearances", label: "Most tournaments first", dir: "desc" },
  { key: "waiting", label: "Waiting to sign first", dir: "desc" },
];

const FILTERS = [
  { key: "waiting", label: "Waiting to sign", tag: "waiting" },
  { key: "managers", label: "Managers", tag: "manager" },
  { key: "nodob", label: "No birth date", tag: "nodob" },
];

const unsigned = (p) => p.appearances.filter((a) => !a.removed && !a.signed).length;

export default async function PeoplePage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">People</h1>
        <PinPad />
      </div>
    );
  }

  const { players, unmatched } = await listPeople();

  const rows = players.map((p) => {
    const teams = [...new Set(p.appearances.filter((a) => !a.removed).map((a) => a.teamName))];
    const waiting = unsigned(p);
    const tags = [];
    if (waiting > 0) tags.push("waiting");
    if (p.appearances.some((a) => a.role === "manager")) tags.push("manager");
    if (!p.birth_date) tags.push("nodob");
    return {
      key: p.id,
      href: `/scorekeeper/players/${p.id}`,
      label: p.full_name,
      sub: teams.join(", ") || "No team yet",
      right: String(p.appearances.length),
      rightSub: waiting > 0 ? `${waiting} to sign` : "all signed",
      haystack: `${p.full_name} ${teams.join(" ")}`,
      tags,
      sortValues: { name: p.full_name, appearances: p.appearances.length, waiting },
    };
  });

  return (
    <DirectorShell title="People" count={`${players.length} on file`}>
      {unmatched.length > 0 && (
        <div className="card p-4">
          <p className="t-strong">{unmatched.length} roster {unmatched.length === 1 ? "entry has" : "entries have"} no person record</p>
          <p className="t-meta">
            They have no birth date, so there is nothing safe to match them on.
            Add one on the team and they join the list.
          </p>
          <ul className="mt-2">
            {unmatched.map((m) => (
              <li key={m.memberId} className="t-meta">
                {m.name} — {m.teamName}, {m.tournamentName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterList
        rows={rows}
        sorts={SORTS}
        filters={FILTERS}
        empty="Nobody matches that."
      />

      <p className="t-meta">
        A person is a name plus a birth date. Two people with the same name are
        two rows. <Link href="/scorekeeper/teams" className="underline">Teams</Link>
      </p>
    </DirectorShell>
  );
}
