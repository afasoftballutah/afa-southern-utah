"use client";

import { useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import RowAction from "./RowAction";

// Everything a director can do to one team's entry. One set of buttons, used
// by the row that opens in the division list and by the registration's own
// page — two sets of buttons for one object is how this got messy before.
//
// Payment records amount (cents) as well as paid_at — deposits are common, so
// "Mark paid" always asks how much.

function dollarsFromCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "";
  return String(Math.round(Number(cents) / 100));
}

function centsFromDollarsInput(raw) {
  const cleaned = String(raw ?? "").trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

function moneyLabel(cents) {
  if (cents == null) return null;
  return `$${Math.round(cents / 100)}`;
}

export default function TeamActions({ registration: reg, divisions = [], fees = null, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [ask, setAsk] = useState(null);
  const [payOpen, setPayOpen] = useState(false);

  const entryFeeCents = fees?.entryFeeCents ?? reg.tournaments?.entry_fee_cents ?? null;
  const depositCents = fees?.depositCents ?? reg.tournaments?.deposit_cents ?? null;

  const defaultPayDollars = useMemo(() => {
    // Default $0; full entry is a chip, not a pre-fill (deposits are common).
    if (reg.amount_paid_cents != null) return dollarsFromCents(reg.amount_paid_cents);
    return "0";
  }, [reg.amount_paid_cents]);

  const [payDollars, setPayDollars] = useState(defaultPayDollars);

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
      if (onDone) onDone(json.registration);
      else window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function openPayDialog() {
    setPayDollars(defaultPayDollars);
    setError("");
    setPayOpen(true);
  }

  async function savePayment() {
    const cents = centsFromDollarsInput(payDollars);
    if (cents === null) {
      setError("Enter an amount (0 is allowed).");
      return;
    }
    if (Number.isNaN(cents)) {
      setError("Amount must be a number of dollars.");
      return;
    }
    setPayOpen(false);
    await patch({ paid: true, amountPaidCents: cents });
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
          <>
            <button className="pill" disabled={busy} onClick={openPayDialog}>
              Edit amount
              {reg.amount_paid_cents != null ? ` (${moneyLabel(reg.amount_paid_cents)})` : ""}
            </button>
            <button
              className="pill"
              disabled={busy}
              onClick={() =>
                confirmThen(
                  `Undo payment for ${reg.team_name}? The amount is cleared too.`,
                  { paid: false },
                  "Undo paid"
                )
              }
            >
              Undo paid
            </button>
          </>
        ) : (
          <button className="pill" disabled={busy} onClick={openPayDialog}>
            Record payment
          </button>
        )}
        {reg.status !== "confirmed" && (
          <button
            className="pill"
            disabled={busy}
            onClick={() =>
              confirmThen(`Confirm ${reg.team_name} for this tournament?`, { status: "confirmed" }, "Confirm")
            }
          >
            Confirm
          </button>
        )}
        {reg.status !== "withdrawn" ? (
          <button
            className="pill"
            disabled={busy}
            onClick={() =>
              confirmThen(
                `Withdraw ${reg.team_name}? Their name is freed for another team, and every non-manager player is released to the free-agent pool so other managers can claim them.`,
                { status: "withdrawn", releaseRosterToPool: true },
                "Withdraw"
              )
            }
          >
            Withdraw
          </button>
        ) : (
          <button
            className="pill"
            disabled={busy}
            onClick={() => confirmThen(`Reinstate ${reg.team_name}?`, { status: "submitted" }, "Reinstate")}
          >
            Reinstate
          </button>
        )}
        <RowAction
          label="Move division"
          title={`Move ${reg.team_name}`}
          note="Same tournament only."
          placeholder="Pick a division…"
          emptyMessage="No other divisions in this tournament."
          countSingular="division"
          countPlural="divisions"
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

      {payOpen && (
        <Modal
          title={reg.paid_at ? `Edit payment · ${reg.team_name}` : `Record payment · ${reg.team_name}`}
          onClose={() => !busy && setPayOpen(false)}
          width="max-w-sm"
          footer={
            <>
              <button type="button" className="btn-transient" onClick={() => setPayOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-action" onClick={savePayment} disabled={busy}>
                {busy ? "Saving…" : reg.paid_at ? "Save amount" : "Record payment"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="t-meta">
              {[
                entryFeeCents != null ? `Entry ${moneyLabel(entryFeeCents)}` : null,
                depositCents != null ? `Deposit ${moneyLabel(depositCents)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No fee on file for this tournament — type what they paid."}
            </p>
            <label className="block">
              <span className="form-label">Amount paid ($)</span>
              <input
                type="text"
                inputMode="decimal"
                className="form-field"
                value={payDollars}
                onChange={(e) => setPayDollars(e.target.value)}
                autoFocus
                placeholder="0"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {entryFeeCents != null && (
                <button
                  type="button"
                  className="pill"
                  onClick={() => setPayDollars(dollarsFromCents(entryFeeCents))}
                >
                  Full amount {moneyLabel(entryFeeCents)}
                </button>
              )}
              {depositCents != null && (
                <button
                  type="button"
                  className="pill"
                  onClick={() => setPayDollars(dollarsFromCents(depositCents))}
                >
                  Deposit {moneyLabel(depositCents)}
                </button>
              )}
            </div>
            <p className="t-meta">
              Starts at $0. Use Full amount for the entry fee, or type a deposit — balance on Teams tracks what is still owed.
            </p>
          </div>
        </Modal>
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
