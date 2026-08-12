"use client";

import EligibilityPill from "./EligibilityPill";
import InlineSelect from "./InlineSelect";
import TeamActions from "./TeamActions";
import { enteredClassName } from "@/lib/class";

// One team's registration. Used twice: in the list on a tournament page,
// where it needs its own name; and on that registration's own page, where the
// page header already says the name and repeating it is noise.
//
// JD, 2026-07-27: "this section is all a disorganized repetitive mess."
// It was — the detail page printed Fallen, then the card printed Fallen,
// Coed · D, Submitted and Unpaid again underneath. `showTitle` is the whole
// difference between the two uses; everything else is identical, because two
// layouts for one object is how this got messy in the first place.

const STATUS_LABEL = { submitted: "Submitted", confirmed: "Confirmed", withdrawn: "Withdrawn" };

function money(cents) {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export default function RegistrationCard({ registration, classes = [], divisions = [], showTitle = true }) {
  const reg = registration;

  // A team a director typed in has no roster at all, so no progress row.
  // Zero of zero signed is the truth about it, not a reason to crash.
  const { active_members: active, signed_members: signed } =
    reg.progress ?? { active_members: 0, signed_members: 0 };
  const enteredClass = enteredClassName(reg, classes);
  const division = reg.divisions?.display_name ?? reg.divisions?.name;
  const sug = reg.suggestion;
  // Prefer division label alone when it already carries class ("Coed D").
  // Token match — not substring ("D" is inside "Coed").
  const titleScope = (() => {
    if (!division && !enteredClass) return null;
    if (!division) return enteredClass;
    if (!enteredClass) return division;
    const tokens = division.toLowerCase().split(/[\s/·.\-]+/).filter(Boolean);
    if (tokens.includes(String(enteredClass).toLowerCase())) return division;
    if (division.toLowerCase() === String(enteredClass).toLowerCase()) return division;
    return `${division} · ${enteredClass}`;
  })();

  return (
    // max-w-3xl because this card is a line of facts and a row of pills — it
    // has never needed more, and at the control centre's 84rem it was 1312px
    // wide with content stopping around 600 (JD, 2026-07-27: "can you narrow
    // the top card since we dont need it to be so wide?"). Tables keep the
    // full width; they earn it.
    <div
      className={
        "card p-4 space-y-3 max-w-3xl mx-auto" + (reg.status === "withdrawn" ? " opacity-60" : "")
      }
    >
      {showTitle && (
        <div className="flex items-baseline justify-between gap-3">
          <p className="team-name text-lg">{reg.team_name}</p>
          {titleScope && <p className="t-meta">{titleScope}</p>}
        </div>
      )}

      {/* Every fact about this registration on one line, in the order a
          director reads them: are they in, have they paid, have they signed,
          what class, and is that class legal. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 dense-controls">
        <span className="t-label">{STATUS_LABEL[reg.status] ?? reg.status}</span>
        <span className="t-body">
          {(() => {
            const due = reg.tournaments?.entry_fee_cents ?? null;
            const deposit = reg.tournaments?.deposit_cents ?? null;
            const paid = reg.amount_paid_cents;
            if (reg.paid_at || paid != null) {
              const paidLabel = paid != null ? money(paid) : "paid";
              if (due != null && paid != null && paid < due) {
                const left = money(due - paid);
                return `Paid ${paidLabel} · owes ${left}`;
              }
              return paid != null ? `Paid ${paidLabel}` : "Paid";
            }
            if (due != null) return `Unpaid · due ${money(due)}`;
            if (deposit != null) return `Unpaid · deposit ${money(deposit)}`;
            return "Unpaid";
          })()}
        </span>
        <span className="t-body">
          {signed} of {active} signed
        </span>
        {sug && (
          <span className="flex items-center gap-2">
            <span className="t-label">Class</span>
            <span className="w-16">
              <InlineSelect
                label="Class"
                subject={reg.team_name}
                value={enteredClass ?? ""}
                options={classes.map((c) => c.name)}
                action="setRegistrationClass"
                valueKey="className"
                payload={{ registrationId: reg.id }}
              />
            </span>
            <EligibilityPill
              teamName={reg.team_name}
              enteredClass={enteredClass}
              suggestedClass={sug.className}
              check={reg.check}
              composition={reg.composition}
              dualRoster={reg.dualRoster}
              roster={reg.roster ?? []}
            />
          </span>
        )}
      </div>

      <p className="t-meta">
        {reg.manager_name ?? "No manager yet"}
        {reg.manager_email && <> &middot; {reg.manager_email}</>}
        {reg.manager_phone && <> &middot; {reg.manager_phone}</>}
      </p>

      <TeamActions registration={reg} divisions={divisions} />
    </div>
  );
}
