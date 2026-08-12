"use client";

import DirectorTable from "./DirectorTable";
import TeamActions from "./TeamActions";
import InlineSelect from "./InlineSelect";
import EligibilityPill from "./EligibilityPill";
import { enteredClassName } from "@/lib/class";

// The teams in one division, one line each.
//
// JD, 2026-07-28: "major UI cleanup to one line." The card said the team's
// name, then its division, then Confirmed, Unpaid, 0 of 0 signed and No
// manager yet each on its own line, then six buttons — eleven lines for one
// team, nine times over. The same facts fit on one row of a table, and the
// buttons open under the team they belong to, the way the player rows do.

const STATUS_LABEL = { submitted: "Submitted", confirmed: "Confirmed", withdrawn: "Withdrawn" };

const money = (cents) =>
  cents == null ? "" : `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

const TAIL = [
  { key: "class", label: "Class", align: "center", width: "5.5rem" },
  { key: "status", label: "Status", width: "6rem" },
  { key: "paid", label: "Paid", align: "center", width: "5rem" },
  { key: "signed", label: "Signed", align: "center", width: "5rem" },
  { key: "manager", label: "Manager" },
];

// Inside a division the tournament and the bracket are the heading above the
// table; on the registrations page they are the first thing you need.
const COLUMNS = [{ key: "team", label: "Team" }, ...TAIL];
const WIDE = [
  { key: "team", label: "Team" },
  { key: "tournament", label: "Tournament" },
  { key: "division", label: "Division", width: "8rem" },
  ...TAIL,
];

const FILTERS = [
  { key: "unpaid", label: "Unpaid", tag: "unpaid" },
  { key: "unsigned", label: "Waiver missing", tag: "unsigned" },
  { key: "nomanager", label: "No manager", tag: "nomanager" },
];

export default function TeamTable({
  registrations,
  classes = [],
  divisions = [],
  divisionHasClass,
  // The whole league rather than one bracket: two more columns, a search box
  // and the filters that go with a long list.
  wide = false,
}) {
  const rows = registrations.map((reg) => {
    const { active_members: active, signed_members: signed } =
      reg.progress ?? { active_members: 0, signed_members: 0 };
    const enteredClass = enteredClassName(reg, classes);
    const sug = reg.suggestion;

    const tournamentName = reg.tournaments?.name ?? "—";
    const divisionLabel = reg.divisions?.display_name ?? reg.divisions?.name ?? "—";

    const tags = [];
    if (!reg.paid_at) tags.push("unpaid");
    if (active === 0 || signed < active) tags.push("unsigned");
    if (!reg.manager_name) tags.push("nomanager");

    return {
      key: reg.id,
      tags,
      search: `${reg.team_name} ${reg.manager_name ?? ""} ${enteredClass ?? ""} ${tournamentName} ${divisionLabel}`,
      sortValues: {
        team: reg.team_name.toLowerCase(),
        class: enteredClass ?? "",
        status: reg.status,
        paid: reg.paid_at ? 1 : 0,
        // Nobody signed and nobody to sign are different problems; a team with
        // no roster sorts below one that has a roster and no signatures.
        signed: active === 0 ? -1 : signed / active,
        manager: (reg.manager_name ?? "").toLowerCase(),
        tournament: tournamentName.toLowerCase(),
        division: divisionLabel.toLowerCase(),
      },
      cells: {
        tournament: tournamentName,
        division: divisionLabel,
        team: (
          <span className={reg.status === "withdrawn" ? "line-through opacity-60" : ""}>
            {reg.team_name}
          </span>
        ),
        // A bracket that already IS a class (Coed D) says so in its own row.
        // Only a class-less division needs this control on every team.
        class: divisionHasClass ? (
          (enteredClass ?? "—")
        ) : (
          <span className="inline-flex items-center gap-1">
            <InlineSelect
              label="Class"
              subject={reg.team_name}
              value={enteredClass ?? ""}
              options={classes.map((c) => c.name)}
              action="setRegistrationClass"
              valueKey="className"
              payload={{ registrationId: reg.id }}
            />
            {sug && (
              <EligibilityPill
                teamName={reg.team_name}
                enteredClass={enteredClass}
                suggestedClass={sug.className}
                check={reg.check}
                composition={reg.composition}
                dualRoster={reg.dualRoster}
                roster={reg.roster ?? []}
              />
            )}
          </span>
        ),
        status: STATUS_LABEL[reg.status] ?? reg.status,
        paid: (() => {
          const due = reg.tournaments?.entry_fee_cents ?? null;
          if (reg.paid_at || reg.amount_paid_cents != null) {
            const paid = reg.amount_paid_cents;
            if (paid != null && due != null && paid < due) {
              return (
                <span className="font-semibold text-afa-part">
                  {money(paid)}
                  <span className="text-afa-muted font-normal"> / {money(due)}</span>
                </span>
              );
            }
            return (
              <span className="text-afa-go font-semibold">{money(paid) || "☑"}</span>
            );
          }
          return (
            <span className="text-afa-muted/60">
              {due != null ? money(due) : "☐"}
            </span>
          );
        })(),
        // "0 of 0 signed" was three words for one fraction. A team with no
        // roster shows an em dash, because 0/0 reads like a failure.
        signed: active === 0 ? "—" : `${signed}/${active}`,
        manager: reg.manager_name ?? <span className="t-meta">No manager yet</span>,
      },
      detail: (
        <div className="space-y-2">
          {(reg.manager_email || reg.manager_phone) && (
            <p className="t-meta">
              {[reg.manager_email, reg.manager_phone].filter(Boolean).join(" · ")}
            </p>
          )}
          <TeamActions
            registration={reg}
            // Across the whole league a team may only move inside its own
            // tournament. Options with no tournament of their own are already
            // one tournament's list.
            divisions={divisions.filter(
              (d) => !d.tournamentId || d.tournamentId === reg.tournament_id
            )}
          />
        </div>
      ),
    };
  });

  return (
    <DirectorTable
      columns={wide ? WIDE : COLUMNS}
      rows={rows}
      filters={wide ? FILTERS : []}
      defaultSort={wide ? { key: "tournament", dir: "asc" } : { key: "team", dir: "asc" }}
      search={wide}
      searchPlaceholder="Team, manager or tournament…"
      empty={wide ? "Nobody matches that." : "No teams in this division yet."}
    />
  );
}
