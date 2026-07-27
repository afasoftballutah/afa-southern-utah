import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { listPeople, scopeLabel } from "@/lib/director";
import { lastNameFirst, lastNameKey } from "@/lib/names";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";

export const dynamic = "force-dynamic"; // reads PII — never cached
export const metadata = { title: "Players — Control Center" };

// One line per player, sorted by last name, sorted by clicking a heading.
// JD, 2026-07-27: "We dont want player cards, we want a list... alphabetized
// by last name, sortable and filterable... Waiting to Sign is way verbose.
// Waiver with a checkbox is more realistic... Class is important - Fallen D
// is different than Fallen E."
const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "team", label: "Team" },
  { key: "class", label: "Class", width: "5rem" },
  { key: "division", label: "Division", width: "6rem", hideBelow: "sm" },
  { key: "events", label: "Events", align: "right", width: "5rem" },
  { key: "waiver", label: "Waiver", type: "check", align: "center", width: "5rem" },
  { key: "dob", label: "Born", width: "7rem", hideBelow: "sm" },
];

const FILTERS = [
  { key: "unsigned", label: "Waiver missing", tag: "unsigned" },
  { key: "managers", label: "Managers", tag: "manager" },
  { key: "noclass", label: "No class", tag: "noclass" },
  { key: "nodob", label: "No birth date", tag: "nodob" },
];

// Sort Class by strength, not alphabetically — D before E is meaningless as
// letters, and unrated belongs at one end rather than under "—".
const classRank = (id, classes) =>
  id ? (classes.find((c) => c.id === id)?.sort_order ?? 0) : -1;

export default async function PlayersPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Players</h1>
        <PinPad />
      </div>
    );
  }

  const { players, unmatched, classes } = await listPeople();

  const rows = players.map((p) => {
    const active = p.appearances.filter((a) => !a.removed);
    const latest = active[active.length - 1] ?? null;
    const unsigned = active.filter((a) => !a.signed).length;
    const teams = [...new Set(active.map((a) => a.teamName))];

    const tags = [];
    if (unsigned > 0) tags.push("unsigned");
    if (active.some((a) => a.role === "manager")) tags.push("manager");
    if (!p.birth_date) tags.push("nodob");
    if (!p.class_id) tags.push("noclass");

    return {
      key: p.id,
      href: `/scorekeeper/players/${p.id}`,
      tags,
      search: `${p.full_name} ${teams.join(" ")} ${p.className ?? ""}`,
      cells: {
        name: lastNameFirst(p.full_name),
        team: teams.join(", ") || "—",
        // The player's own rating, which is what decides a team's class.
        class: p.className ?? "—",
        division: scopeLabel(latest?.gender, null) || "—",
        events: active.length,
        // Ticked when every roster they are on is signed. A paper roster is
        // marked off the same way, and it scans far faster than a sentence.
        waiver: active.length > 0 && unsigned === 0,
        dob: p.birth_date ?? "—",
      },
      sortValues: {
        name: lastNameKey(p.full_name),
        events: active.length,
        class: classRank(p.class_id, classes),
      },
    };
  });

  return (
    <DirectorShell title="Players" count={`${rows.length} on file`}>
      {unmatched.length > 0 && (
        <div className="card p-4">
          <p className="t-strong">
            {unmatched.length} roster {unmatched.length === 1 ? "entry has" : "entries have"} no
            player record
          </p>
          <p className="t-meta">
            No birth date, so there is nothing safe to match them on:{" "}
            {unmatched.map((m) => `${m.name} (${m.teamName})`).join(", ")}
          </p>
        </div>
      )}

      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        filters={FILTERS}
        defaultSort={{ key: "name", dir: "asc" }}
        empty="Nobody matches that."
        searchPlaceholder="Name, team or class…"
      />

      <p className="t-meta">
        A player is a name plus a birth date, so two people with the same name
        stay apart. <Link href="/scorekeeper/teams" className="underline">Teams</Link>
      </p>
    </DirectorShell>
  );
}
