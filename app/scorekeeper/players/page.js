import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { listPeople, listTeams } from "@/lib/director";
import { RATINGS } from "@/lib/class";
import { lastNameFirst, lastNameKey, bornWithAge } from "@/lib/names";
import { leagueToday } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import InlineSelect from "@/components/scorekeeper/InlineSelect";
import PlayerDetail from "@/components/scorekeeper/PlayerDetail";
import Link from "next/link";

export const dynamic = "force-dynamic"; // reads PII — never cached
export const metadata = { title: "Players — Control Center" };

// One line per player, sorted by last name, sorted by clicking a heading.
// JD, 2026-07-27: "We dont want player cards, we want a list... alphabetized
// by last name, sortable and filterable... Waiting to Sign is way verbose.
// Waiver with a checkbox is more realistic... Class is important - Fallen D
// is different than Fallen E."
const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "gender", label: "M/F", align: "center", width: "4rem" },
  { key: "dob", label: "Born", width: "9rem" },
  { key: "rating", label: "Rating", align: "center", width: "5rem" },
  { key: "waiver", label: "Waiver", type: "check", align: "center", width: "5rem" },
  { key: "team", label: "Team" },
  { key: "tournament", label: "Tournament" },
  { key: "events", label: "#", align: "right", width: "3.5rem" },
];

const FILTERS = [
  { key: "unsigned", label: "Waiver missing", tag: "unsigned" },
  { key: "managers", label: "Managers", tag: "manager" },
  { key: "norating", label: "Unranked", tag: "norating" },
  { key: "nogender", label: "No M/F", tag: "nogender" },
  { key: "nodob", label: "No birth date", tag: "nodob" },
];

// Sort by strength, not alphabetically. A is strongest, and unranked sorts to
// one end rather than scattering under "—".
const ratingRank = (r) => {
  const i = RATINGS.indexOf(r);
  return i === -1 ? -1 : RATINGS.length - i;
};

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

  const [{ players, unmatched }, teams] = await Promise.all([listPeople(), listTeams()]);

  // Built once for every row rather than per open — the whole league is a few
  // hundred people, and a fetch on expand would make the accordion feel slow
  // for no saving.
  const openRegistrations = teams.flatMap((t) =>
    t.registrations
      .filter((r) => r.status !== "withdrawn")
      .map((r) => ({ id: r.registrationId, label: `${t.name} — ${r.tournamentName}` }))
  );
  // One clock for the whole table, so two rows can never disagree about today.
  const today = leagueToday();

  const rows = players.map((p) => {
    const active = p.appearances.filter((a) => !a.removed);
    const unsigned = active.filter((a) => !a.signed).length;
    const lastAppearance = active[active.length - 1] ?? null;
    const teams = [...new Set(active.map((a) => a.teamName))];

    const tags = [];
    if (unsigned > 0) tags.push("unsigned");
    if (active.some((a) => a.role === "manager")) tags.push("manager");
    if (!p.birth_date) tags.push("nodob");
    if (!p.rating) tags.push("norating");
    if (!p.gender) tags.push("nogender");

    return {
      key: p.id,
      // Every event, in the same columns as the row above. The waiver tick
      // is per event, because that is what a signature actually is.
      detailRows: active.map((a) => ({
        key: a.memberId,
        cells: {
          // Nothing in the name column. The team's class is the same letter
          // ladder as the player's rating, so "D class" next to a Rating of D
          // reads as a contradiction when it is two different facts.
          name: "",
          waiver: a.signed,
          tournament: a.tournamentName,
          team: (
            <Link
              href={`/scorekeeper/registrations/${a.registrationId}`}
              className="text-afa-navy hover:underline"
            >
              {a.teamName}
            </Link>
          ),
        },
      })),
      detailActions: (
        <PlayerDetail
          person={{ id: p.id, name: p.full_name }}
          appearances={active}
          registrations={openRegistrations}
          otherPeople={players
            .filter((o) => o.id !== p.id)
            .map((o) => ({
              id: o.id,
              label: `${o.full_name}${o.birth_date ? ` (${o.birth_date})` : ""}`,
            }))}
        />
      ),
      tags,
      search: `${p.full_name} ${teams.join(" ")} ${active.map((a) => a.tournamentName).join(" ")} ${p.rating ?? ""}`,
      cells: {
        name: lastNameFirst(p.full_name),
        // The MOST RECENT event only. Every event this person played opens
        // underneath, in these same columns.
        tournament: lastAppearance?.tournamentName ?? "—",
        team: lastAppearance ? (
          <Link
            href={`/scorekeeper/registrations/${lastAppearance.registrationId}`}
            className="text-afa-navy hover:underline"
          >
            {lastAppearance.teamName}
          </Link>
        ) : (
          "—"
        ),
        // Editable in place. A director working down a roster of twelve
        // should not have to open twelve pages.
        rating: (
          <InlineSelect
            label="Rating"
            action="setPlayerRating"
            valueKey="rating"
            payload={{ playerId: p.id }}
            value={p.rating ?? ""}
            options={RATINGS}
          />
        ),
        gender: (
          <InlineSelect
            label="M/F"
            action="setPlayerGender"
            valueKey="gender"
            payload={{ playerId: p.id }}
            value={p.gender ?? ""}
            options={["M", "F"]}
          />
        ),
        events: active.length,
        // Ticked when every roster they are on is signed. A paper roster is
        // marked off the same way, and it scans far faster than a sentence.
        waiver: active.length > 0 && unsigned === 0,
        dob: bornWithAge(p.birth_date, today),
      },
      sortValues: {
        name: lastNameKey(p.full_name),
        dob: p.birth_date ?? "",
        team: lastAppearance?.teamName ?? "",
        tournament: lastAppearance?.tournamentName ?? "",
        events: active.length,
        rating: ratingRank(p.rating),
        gender: p.gender ?? "",
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

    </DirectorShell>
  );
}
