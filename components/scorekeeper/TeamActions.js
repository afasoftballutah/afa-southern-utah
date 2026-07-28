"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import RowAction from "./RowAction";

// Everything a director can do to one team's entry. One set of buttons, used
// by the row that opens in the division list and by the registration's own
// page — two sets of buttons for one object is how this got messy before.
//
// Every one of them confirms first (JD, 2026-07-27: "can we have basic
// confirms for changes (any)?"), and the message names the CONSEQUENCE, not
// the operation.

export default function TeamActions({ registration: reg, divisions = [], onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [ask, setAsk] = useState(null);

  const confirmThen = (message, body, confirmLabel) => setAsk({ message, body, confirmLabel });

  async function patch(body) {
    setAsk(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/registrations/${reg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      // Reload rather than patch a row in place: the counts above this table
      // (teams in the division, teams in the tournament) are computed on the
      // server and would go stale the moment a team is withdrawn.
      if (onDone) onDone(json.registration);
      else window.location.reload();
    } catch (err) {
      setError(err.message);
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {reg.paid_at ? (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Undo payment for ${reg.team_name}? The amount is cleared too.`, { paid: false }, "Undo paid")}>
            Undo paid
          </button>
        ) : (
          <button className="pill" disabled={busy}
            onClick={() => confirmThen(`Mark ${reg.team_name} as paid?`, { paid: true }, "Mark paid")}>
            Mark paid
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
      {reg.director_notes && <p className="t-meta italic">{reg.director_notes}</p>}

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
