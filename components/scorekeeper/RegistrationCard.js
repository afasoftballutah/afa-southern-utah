"use client";

import { useState } from "react";
import EligibilityPill from "./EligibilityPill";
import ConfirmDialog from "./ConfirmDialog";
import InlineSelect from "./InlineSelect";
import RowAction from "./RowAction";

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
  const [reg, setReg] = useState(registration);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [ask, setAsk] = useState(null);

  const { active_members: active, signed_members: signed } = reg.progress;
  const enteredClass = classes.find((c) => c.id === reg.class_id)?.name ?? null;
  const division = reg.divisions?.display_name ?? reg.divisions?.name;
  const sug = reg.suggestion;

  function confirmThen(message, body, confirmLabel) {
    setAsk({ message, body, confirmLabel });
  }

  async function patch(body) {
    setAsk(null);
    setBusy(true);
    setError("");
    try {
      const isClass = "classId" in body;
      const res = await fetch(
        isClass ? "/api/scorekeeper/directory" : `/api/scorekeeper/registrations/${reg.id}`,
        {
          method: isClass ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isClass
              ? { action: "setRegistrationClass", registrationId: reg.id, classId: body.classId }
              : body
          ),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      if (isClass) setReg((cur) => ({ ...cur, class_id: body.classId }));
      else setReg((cur) => ({ ...cur, ...json.registration }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function copyLink(kind) {
    const path = kind === "manage" ? "manage" : "roster";
    const tok = kind === "manage" ? reg.manage_token : reg.roster_token;
    navigator.clipboard?.writeText(`${window.location.origin}/register/${path}/${tok}`);
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  }

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
          <p className="t-meta">{[division, enteredClass].filter(Boolean).join(" · ")}</p>
        </div>
      )}

      {/* Every fact about this registration on one line, in the order a
          director reads them: are they in, have they paid, have they signed,
          what class, and is that class legal. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 dense-controls">
        <span className="t-label">{STATUS_LABEL[reg.status] ?? reg.status}</span>
        <span className="t-body">
          {reg.paid_at ? `Paid ${money(reg.amount_paid_cents)}`.trim() : "Unpaid"}
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
              roster={reg.roster ?? []}
            />
          </span>
        )}
      </div>

      <p className="t-meta">
        {reg.manager_name}
        {reg.manager_email && <> &middot; {reg.manager_email}</>}
        {reg.manager_phone && <> &middot; {reg.manager_phone}</>}
      </p>

      <div className="flex flex-wrap gap-2">
        {!reg.paid_at && (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Mark ${reg.team_name} as paid?`, { paid: true }, "Mark paid")}>
            Mark paid
          </button>
        )}
        {reg.paid_at && (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Undo payment for ${reg.team_name}? The amount is cleared too.`, { paid: false }, "Undo paid")}>
            Undo paid
          </button>
        )}
        {reg.status !== "confirmed" && (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Confirm ${reg.team_name} for this tournament?`, { status: "confirmed" }, "Confirm")}>
            Confirm
          </button>
        )}
        {reg.status !== "withdrawn" ? (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Withdraw ${reg.team_name}? Their name is freed for another team.`, { status: "withdrawn" }, "Withdraw")}>
            Withdraw
          </button>
        ) : (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Reinstate ${reg.team_name}?`, { status: "submitted" }, "Reinstate")}>
            Reinstate
          </button>
        )}
        {/* Setting up a tournament leaves teams in the division they
            registered for, which may no longer be the bracket they belong in.
            The route refuses to remove a division that still has a team, so
            this is how you empty one. */}
        <RowAction
          label="Move division"
          title={`Move ${reg.team_name}`}
          note="Same tournament only."
          placeholder="Pick a division…"
          action="moveRegistration"
          valueKey="divisionId"
          payload={{ registrationId: reg.id }}
          confirmText={`Move ${reg.team_name} into {name}?`}
          options={divisions.filter((d) => d.id !== reg.division_id)}
        />
        <button className="pill" onClick={() => copyLink("roster")}>
          {copied === "roster" ? "Copied" : "Team link"}
        </button>
        <button className="pill" onClick={() => copyLink("manage")}>
          {copied === "manage" ? "Copied" : "Manager link"}
        </button>
        {reg.pdf_storage_path && (
          <a className="pill" href={`/api/scorekeeper/registrations/${reg.id}/waiver`} target="_blank" rel="noreferrer">
            Waiver
          </a>
        )}
      </div>

      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}
      {reg.director_notes && (
        <details>
          <summary className="t-meta cursor-pointer">Director note</summary>
          <p className="t-meta italic mt-1">{reg.director_notes}</p>
        </details>
      )}

      {ask && (
        <ConfirmDialog
          title={reg.team_name}
          message={ask.message}
          confirmLabel={ask.confirmLabel}
          busy={busy}
          onConfirm={() => patch(ask.body)}
          onCancel={() => setAsk(null)}
        />
      )}
    </div>
  );
}
