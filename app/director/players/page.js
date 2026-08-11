import { requireDirectorPage } from "@/lib/staff-gate";
import { listPeople, listTeams, resultsByTeamAndTournament, formatResult } from "@/lib/director";
import { RATINGS } from "@/lib/class";
import { lastNameFirst, lastNameKey, bornWithAge } from "@/lib/names";
import { leagueToday } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import InlineSelect from "@/components/scorekeeper/InlineSelect";
import RowAction from "@/components/scorekeeper/RowAction";
import DeletePlayer from "@/components/scorekeeper/DeletePlayer";
import ContactButton from "@/components/scorekeeper/ContactButton";
import Link from "next/link";
import { Fragment } from "react";

export const dynamic = "force-dynamic"; // reads PII — never cached
export const metadata = { title: "Players — Director" };

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
  { key: "team", label: "Team" },
  { key: "tournament", label: "Tournament" },
  { key: "class", label: "Class", align: "center", width: "4.5rem" },
  { key: "events", label: "#", align: "right", width: "3.5rem" },
  { key: "waiver", label: "Waiver", type: "check", align: "center", width: "5rem" },
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
  const gate = await requireDirectorPage();
  if (gate.needPin) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Players</h1>
        <PinPad room="director" />
      </div>
    );
  }

  const [{ players, unmatched }, teams, results] = await Promise.all([
    listPeople(),
    listTeams(),
    resultsByTeamAndTournament(),
  ]);

  // Live registrations for Switch Team. Label carries team · division · class
  // · manager; options are filtered per appearance to the same tournament.
  const openRegistrations = teams.flatMap((t) =>
    t.registrations
      .filter((r) => r.status !== "withdrawn")
      .map((r) => ({
        id: r.registrationId,
        tournamentId: r.tournamentId,
        // Prefer explicit switchLabel; fall back for older listTeams shapes
        label:
          r.switchLabel ||
          [
            t.name,
            r.divisionLabel,
            r.className,
            r.managerName ? `mgr ${r.managerName}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        // Group key for the dropdown note
        tournamentName: r.tournamentName,
      }))
  );
  // One clock for the whole table, so two rows can never disagree about today.
  const today = leagueToday();

  const rows = players.map((p) => {
    const active = p.appearances.filter((a) => !a.removed);
    const unsigned = active.filter((a) => !a.signed).length;
    const lastAppearance = active[active.length - 1] ?? null;
    const own = active.find((a) => a.email || a.phone);
    const viaManager = active.find((a) => a.managerEmail || a.managerPhone);
    const contact = own
      ? { phone: own.phone, email: own.email, via: null }
      : viaManager
        ? {
            phone: viaManager.managerPhone,
            email: viaManager.managerEmail,
            via: viaManager.managerName,
          }
        : null;
    const teams = [...new Set(active.map((a) => a.teamName))];

    const tags = [];
    if (unsigned > 0) tags.push("unsigned");
    if (active.some((a) => a.role === "manager")) tags.push("manager");
    if (!p.birth_date) tags.push("nodob");
    if (!p.rating) tags.push("norating");
    if (!p.gender) tags.push("nogender");

    return {
      key: p.id,
      // First the actions, each sitting in the column it belongs to — merge
      // under the name because it is about who this person is, move under the
      // team because it is about which team they are on. Then every event, in
      // these same columns. Always one action row so Delete works even with
      // zero roster appearances.
      detailRows: (active.length
        ? active
        : [{ memberId: `solo-${p.id}`, registrationId: null, teamName: null, tournamentName: null, className: null, signed: false }]
      ).map((a, idx) => ({
        key: a.memberId,
        cells: {
          // The person's own columns are blank on an event row, so the actions
          // live there — on the first one only. Merge under the name because it
          // is about who this person is.
          name:
            idx === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <RowAction
                  label="Merge duplicate"
                  title={`Merge into ${p.full_name}`}
                  note="Everything on the duplicate moves here. Nothing is deleted."
                  placeholder="Pick the duplicate…"
                  action="mergePlayers"
                  valueKey="dropId"
                  payload={{ keepId: p.id }}
                  confirmText={`Merge {name} into ${p.full_name}? Nothing is deleted.`}
                  options={players
                    .filter((o) => o.id !== p.id)
                    .map((o) => ({
                      id: o.id,
                      label: `${o.full_name}${o.birth_date ? ` (${o.birth_date})` : ""}`,
                    }))}
                />
                <DeletePlayer playerId={p.id} name={p.full_name} />
              </div>
            ) : null,
          dob:
            idx === 0 ? (
              <ContactButton
                name={p.full_name}
                phone={contact?.phone}
                email={contact?.email}
                via={contact?.via}
              />
            ) : null,
          rating:
            a.registrationId ? (
              <RowAction
                label="Switch Team"
                title={`Switch ${p.full_name}`}
                note={
                  a.tournamentName
                    ? `Only teams in ${a.tournamentName}. Both waivers are rebuilt.`
                    : "Both waivers are rebuilt."
                }
                placeholder="Pick a team in this tournament…"
                action="movePlayer"
                valueKey="toRegistrationId"
                payload={{ memberId: a.memberId }}
                confirmText={`Switch ${p.full_name} to {name}? Both waivers are rebuilt.`}
                options={openRegistrations.filter(
                  (o) =>
                    o.id !== a.registrationId &&
                    (a.tournamentId
                      ? o.tournamentId === a.tournamentId
                      : true)
                )}
              />
            ) : null,
          team: a.registrationId ? (
            <Link
              href={`/director/registrations/${a.registrationId}`}
              className="text-afa-navy hover:underline"
            >
              {a.teamName}
            </Link>
          ) : (
            "—"
          ),
          tournament: a.tournamentName ?? "—",
          class: a.className ?? "—",
          // How the team finished, where the row above counts events.
          events: a.tournamentId ? formatResult(results.get(a.tournamentId, a.teamName)) : "—",
          waiver: a.signed,
        },
      })),
      tags,
      search: `${p.full_name} ${teams.join(" ")} ${active.map((a) => a.tournamentName).join(" ")} ${p.rating ?? ""}`,
      cells: {
        name: lastNameFirst(p.full_name),
        gender: (
          <InlineSelect
            label="M/F"
            action="setPlayerGender"
            valueKey="gender"
            payload={{ playerId: p.id }}
            value={p.gender ?? ""}
            options={["M", "F"]}
            subject={p.full_name}
          />
        ),
        dob: bornWithAge(p.birth_date, today),
        rating: (
          <InlineSelect
            label="Rating"
            action="setPlayerRating"
            valueKey="rating"
            payload={{ playerId: p.id }}
            value={p.rating ?? ""}
            options={RATINGS}
            subject={p.full_name}
          />
        ),
        team: lastAppearance ? (
          <Link
            href={`/director/registrations/${lastAppearance.registrationId}`}
            className="text-afa-navy hover:underline"
          >
            {lastAppearance.teamName}
          </Link>
        ) : (
          "—"
        ),
        tournament: lastAppearance?.tournamentName ?? "—",
        class: lastAppearance?.className ?? "—",
        events: active.length,
        // Ticked when every roster they are on is signed.
        waiver: active.length > 0 && unsigned === 0,
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
