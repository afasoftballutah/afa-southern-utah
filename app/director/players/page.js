import { requireDirectorPage } from "@/lib/staff-gate";
import { listPeople, listTeams } from "@/lib/director";
import { RATINGS } from "@/lib/class";
import {
  directoryNameLabel,
  lastNameKey,
  bornWithAge,
} from "@/lib/names";
import { leagueToday } from "@/lib/tournament-state";
import { getServiceClient } from "@/lib/supabase";
import {
  isSuspensionActive,
  listOpenSuspensions,
  suspensionScopeLabel,
} from "@/lib/suspensions";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import InlineSelect from "@/components/scorekeeper/InlineSelect";
import RowAction from "@/components/scorekeeper/RowAction";
import DeletePlayer from "@/components/scorekeeper/DeletePlayer";
import EditPlayer from "@/components/scorekeeper/EditPlayer";
import NewPlayer from "@/components/scorekeeper/NewPlayer";
import SuspendPlayer from "@/components/scorekeeper/SuspendPlayer";
import WaiverSignLink from "@/components/scorekeeper/WaiverSignLink";
import Link from "next/link";

export const dynamic = "force-dynamic"; // reads PII — never cached
export const metadata = { title: "Players — Director" };

// One row per person. Desktop: full columns. Phone: name · M/F · DOB only;
// everything else (and tournaments) is in the expand panel.
// JD: player database is people, not a repeating tournament list.
const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "gender", label: "M/F", align: "center", width: "3.5rem" },
  { key: "dob", label: "DOB", width: "9rem" },
  { key: "address", label: "Address", hideBelow: "sm" },
  { key: "email", label: "Email", hideBelow: "sm" },
  { key: "class", label: "Class", align: "center", width: "4rem", hideBelow: "sm" },
  { key: "events", label: "#", align: "center", width: "2.25rem", hideBelow: "sm" },
  {
    key: "waiver",
    label: "W",
    type: "check",
    align: "center",
    width: "2.25rem",
    hideBelow: "sm",
  },
  // One compact actions cluster — full Edit/Suspend/Merge/Delete columns ate the row.
  {
    key: "actions",
    label: "",
    align: "right",
    width: "1%",
    hideBelow: "sm",
  },
];

/** Tight pill for player row actions */
const COMPACT =
  "inline-flex items-center justify-center rounded border border-afa-navy/25 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-afa-navy leading-none whitespace-nowrap hover:border-afa-navy/50";
const COMPACT_DANGER =
  "inline-flex items-center justify-center rounded border border-afa-red/35 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-afa-red leading-none whitespace-nowrap hover:border-afa-red";
const COMPACT_SUSP =
  "inline-flex items-center justify-center rounded border border-afa-red/40 bg-afa-red/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-afa-red leading-none whitespace-nowrap";

const FILTERS = [
  { key: "unsigned", label: "Waiver missing", tag: "unsigned" },
  { key: "unconfirmed", label: "Unconfirmed", tag: "unconfirmed" },
  { key: "managers", label: "Managers", tag: "manager" },
  { key: "norating", label: "Unranked", tag: "norating" },
  { key: "nogender", label: "No M/F", tag: "nogender" },
  { key: "nodob", label: "No birth date", tag: "nodob" },
  { key: "suspended", label: "Suspended", tag: "suspended" },
];

const ratingRank = (r) => {
  const i = RATINGS.indexOf(r);
  return i === -1 ? -1 : RATINGS.length - i;
};

function formatDate(iso) {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-");
  return `${m}/${d}/${y}`;
}

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

  const supabase = getServiceClient();
  // listPeople includes directory people + unconfirmed roster names
  // (manager-entered, not yet linked to a players row).
  const [{ players }, teams, openSuspensions, { data: tourRows }] =
    await Promise.all([
      listPeople(),
      listTeams(),
      listOpenSuspensions(supabase),
      supabase
        .from("tournaments")
        .select("id, name, start_date")
        .eq("is_placeholder", false)
        .order("start_date", { ascending: false }),
    ]);

  const tournaments = (tourRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    start_date: t.start_date,
  }));
  const tourNameBy = new Map(tournaments.map((t) => [t.id, t.name]));

  const suspensionsByPlayer = new Map();
  for (const s of openSuspensions) {
    if (!suspensionsByPlayer.has(s.player_id)) {
      suspensionsByPlayer.set(s.player_id, []);
    }
    suspensionsByPlayer.get(s.player_id).push({
      ...s,
      tournament_name: s.tournament_id
        ? tourNameBy.get(s.tournament_id)
        : null,
    });
  }

  // Switch Team options: same tournament only, grouped by division.
  const openRegistrations = teams.flatMap((t) =>
    t.registrations
      .filter((r) => r.status !== "withdrawn")
      .map((r) => ({
        id: r.registrationId,
        tournamentId: r.tournamentId,
        tournamentName: r.tournamentName,
        group: r.switchGroup || r.divisionLabel || "Unassigned division",
        label:
          r.switchLabel ||
          [
            t.name,
            r.managerName ? `mgr ${r.managerName}` : null,
            r.paid ? "paid" : "unpaid",
          ]
            .filter(Boolean)
            .join(" · "),
        sortKey: `${r.switchGroup || ""}|${(t.name || "").toLowerCase()}`,
      }))
  );

  const today = leagueToday();

  const mergeOptionsFor = (keepId) =>
    players
      .filter((o) => !o.provisional && o.id !== keepId)
      .map((o) => ({
        id: o.id,
        label: `${o.full_name}${o.birth_date ? ` (${o.birth_date})` : ""}`,
      }));

  const rows = players.map((p) => {
    const provisional = Boolean(p.provisional);
    const active = (p.appearances ?? []).filter((a) => !a.removed);
    const unsigned = active.filter((a) => !a.signed).length;
    const firstReg = active.find((a) => a.registrationId)?.registrationId;

    const playerSuspensions = provisional
      ? []
      : suspensionsByPlayer.get(p.id) ?? [];
    // Active in any open scope (date-only, any tour, or open-ended).
    const currentlySuspended = playerSuspensions.some((s) =>
      isSuspensionActive(s, { asOf: today, tournamentId: s.tournament_id })
    );

    const tags = [];
    if (provisional) tags.push("unconfirmed");
    if (unsigned > 0) tags.push("unsigned");
    if (active.some((a) => a.role === "manager")) tags.push("manager");
    if (!p.birth_date) tags.push("nodob");
    if (!p.rating) tags.push("norating");
    if (!p.gender) tags.push("nogender");
    if (currentlySuspended) tags.push("suspended");

    const nameLabel = (
      <span className="inline-flex flex-wrap items-center gap-1.5 min-w-0">
        <span className="truncate">
          {directoryNameLabel({
            legalFirstName: p.legal_first_name,
            legalLastName: p.legal_last_name,
            preferredName: p.preferred_name,
            fullName: p.full_name,
          })}
        </span>
        {provisional ? (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-afa-muted border border-afa-navy/25 rounded px-1 py-0.5">
            Roster
          </span>
        ) : null}
        {currentlySuspended ? (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-afa-red border border-afa-red/40 rounded px-1 py-0.5">
            Susp.
          </span>
        ) : null}
      </span>
    );

    // Unconfirmed: only open the team registration — no directory edit yet.
    const actionsCell = provisional ? (
      <span className="inline-flex flex-nowrap items-center justify-end gap-0.5">
        {firstReg ? (
          <Link href={`/director/registrations/${firstReg}`} className={COMPACT}>
            Team
          </Link>
        ) : (
          <span className="t-meta text-[11px]">On roster</span>
        )}
      </span>
    ) : (
      <span className="inline-flex flex-nowrap items-center justify-end gap-0.5">
        <EditPlayer player={p} buttonClass={COMPACT} />
        <SuspendPlayer
          player={p}
          tournaments={tournaments}
          suspensions={playerSuspensions}
          buttonClass={currentlySuspended ? COMPACT_SUSP : COMPACT}
        />
        <RowAction
          label="Merge"
          title={`Merge into ${p.full_name}`}
          note="Everything on the duplicate moves here. Nothing is deleted."
          placeholder="Pick the duplicate…"
          emptyMessage="No other people to merge."
          countSingular="person"
          countPlural="people"
          action="mergePlayers"
          valueKey="dropId"
          payload={{ keepId: p.id }}
          options={mergeOptionsFor(p.id)}
          buttonClass={COMPACT}
        />
        <DeletePlayer
          playerId={p.id}
          name={p.full_name}
          buttonClass={COMPACT_DANGER}
        />
      </span>
    );
    const classSelect = provisional ? (
      <span className="t-meta">—</span>
    ) : (
      <InlineSelect
        label="Class"
        action="setPlayerRating"
        valueKey="rating"
        payload={{ playerId: p.id }}
        value={p.rating ?? ""}
        options={RATINGS}
        subject={p.full_name}
      />
    );
    const genderCell = provisional ? (
      <span className="t-meta tabular-nums">{p.gender || "—"}</span>
    ) : (
      <InlineSelect
        label="M/F"
        action="setPlayerGender"
        valueKey="gender"
        payload={{ playerId: p.id }}
        value={p.gender ?? ""}
        options={["M", "F"]}
        subject={p.full_name}
      />
    );
    const allWaiversOk = active.length > 0 && unsigned === 0;

    const appearanceTable =
      active.length === 0 ? (
        <p className="t-meta text-[12px]">No tournament appearances on file.</p>
      ) : (
        <div className="space-y-1.5 min-w-0">
          <p className="t-label text-[11px] tracking-wide">
            Tournament appearances
          </p>
          <div className="overflow-x-auto rounded-md border border-afa-navy/10 bg-white/70">
            <table className="w-full min-w-[28rem] text-[12px] leading-snug">
              <thead>
                <tr className="border-b border-afa-navy/10 bg-afa-navy/[0.03]">
                  <th className="px-2.5 py-1 text-left t-label font-normal text-[10px]">
                    Date
                  </th>
                  <th className="px-2.5 py-1 text-left t-label font-normal text-[10px]">
                    Tournament
                  </th>
                  <th className="px-2.5 py-1 text-left t-label font-normal text-[10px]">
                    Division
                  </th>
                  <th className="px-2.5 py-1 text-left t-label font-normal text-[10px]">
                    Team
                  </th>
                  <th className="px-2.5 py-1 text-left t-label font-normal text-[10px]">
                    Waiver
                  </th>
                  <th className="px-2.5 py-1 text-left t-label font-normal text-[10px]" />
                </tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr
                    key={a.memberId}
                    className="border-b border-black/5 last:border-0"
                  >
                    <td className="px-2.5 py-1 whitespace-nowrap tabular-nums text-afa-ink/85">
                      {formatDate(a.startDate)}
                    </td>
                    <td className="px-2.5 py-1 whitespace-nowrap text-afa-ink/85">
                      {a.tournamentName ?? "—"}
                    </td>
                    <td className="px-2.5 py-1 whitespace-nowrap text-afa-ink/85">
                      {a.divisionLabel ?? a.className ?? "—"}
                    </td>
                    <td className="px-2.5 py-1 whitespace-nowrap">
                      {a.registrationId ? (
                        <Link
                          href={`/director/registrations/${a.registrationId}`}
                          className="text-afa-navy font-semibold hover:underline"
                        >
                          {a.teamName}
                        </Link>
                      ) : (
                        <span className="text-afa-ink/85">
                          {a.teamName ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-1 whitespace-nowrap">
                      <WaiverSignLink
                        href={a.signPath}
                        signed={a.signed}
                        signedAt={a.signedAt}
                        signedPlace={a.signedPlace}
                        signedVia={a.signedVia}
                        signedIp={a.signedIp}
                        compact
                      />
                    </td>
                    <td className="px-2.5 py-1">
                      {a.registrationId ? (
                        <RowAction
                          label="Switch Team"
                          title={`Switch ${p.full_name}`}
                          note={
                            a.tournamentName
                              ? `Same tournament only: ${a.tournamentName}. Both waivers are rebuilt.`
                              : "No tournament on this roster row — cannot switch."
                          }
                          optionKey="Team · manager · paid  (grouped by division)"
                          emptyMessage="No other teams in this tournament to switch to."
                          countSingular="team in this tournament"
                          countPlural="teams in this tournament"
                          listSize={12}
                          placeholder="Pick a team in this tournament…"
                          action="movePlayer"
                          valueKey="toRegistrationId"
                          payload={{ memberId: a.memberId }}
                          options={
                            a.tournamentId
                              ? openRegistrations
                                  .filter(
                                    (o) =>
                                      o.id !== a.registrationId &&
                                      o.tournamentId === a.tournamentId
                                  )
                                  .sort((x, y) =>
                                    (x.sortKey || x.label).localeCompare(
                                      y.sortKey || y.label,
                                      undefined,
                                      { sensitivity: "base" }
                                    )
                                  )
                              : []
                          }
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    // Phone list is name/M-F/DOB only; the rest of the person lives here on expand.
    const mobilePersonDetail = (
      <div className="sm:hidden space-y-2 pb-2.5 mb-2.5 border-b border-afa-navy/10">
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-[12px]">
          <dt className="t-meta">Address</dt>
          <dd className="text-afa-ink break-words">{p.address || "—"}</dd>
          <dt className="t-meta">Email</dt>
          <dd className="text-afa-ink break-all">{p.email || "—"}</dd>
          <dt className="t-meta">Class</dt>
          <dd className="max-w-[6rem]">{classSelect}</dd>
          <dt className="t-meta">Events</dt>
          <dd className="tabular-nums">{active.length}</dd>
          <dt className="t-meta">Waiver</dt>
          <dd>
            <span
              className={
                "tick text-[0.95em] " +
                (allWaiversOk ? "text-afa-go" : "text-afa-muted/50")
              }
            >
              {allWaiversOk ? "☑" : "☐"}
            </span>
            {unsigned > 0 ? (
              <span className="t-meta ml-1 text-[11px]">
                {unsigned} missing
              </span>
            ) : null}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2">{actionsCell}</div>
        {currentlySuspended && (
          <p className="t-meta text-[12px] text-afa-red">
            Suspended:{" "}
            {playerSuspensions
              .filter((s) =>
                isSuspensionActive(s, {
                  asOf: today,
                  tournamentId: s.tournament_id,
                })
              )
              .map((s) => suspensionScopeLabel(s, tourNameBy))
              .join("; ")}
          </p>
        )}
      </div>
    );

    return {
      key: p.id,
      // Nested under the player row: clear left rail, room from the card edge.
      detail: (
        <div className="ml-5 sm:ml-8 mr-1 sm:mr-2 pl-3 sm:pl-4 border-l-2 border-afa-navy/20 min-w-0 max-w-full">
          {mobilePersonDetail}
          {appearanceTable}
        </div>
      ),
      tags,
      search: [
        p.full_name,
        p.legal_first_name,
        p.legal_last_name,
        p.preferred_name,
        p.email,
        p.address,
        p.rating,
        currentlySuspended ? "suspended" : "",
        provisional ? "unconfirmed roster" : "",
        ...active.map((a) => a.teamName),
        ...active.map((a) => a.tournamentName),
      ]
        .filter(Boolean)
        .join(" "),
      cells: {
        name: nameLabel,
        gender: genderCell,
        dob: bornWithAge(p.birth_date, today),
        address: p.address || "—",
        email: p.email || "—",
        class: classSelect,
        events: active.length,
        waiver: allWaiversOk,
        actions: actionsCell,
      },
      sortValues: {
        name: lastNameKey(
          [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") ||
            p.full_name
        ),
        dob: p.birth_date ?? "",
        address: p.address ?? "",
        email: p.email ?? "",
        events: active.length,
        class: ratingRank(p.rating),
        gender: p.gender ?? "",
        waiver: allWaiversOk,
      },
    };
  });

  return (
    <DirectorShell title="Players" count={`${rows.length} on file`}>
      <NewPlayer />
      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        filters={FILTERS}
        defaultFilter="all"
        defaultSort={{ key: "name", dir: "asc" }}
        empty="Nobody matches that."
        searchPlaceholder="Name, email, team…"
      />
    </DirectorShell>
  );
}
