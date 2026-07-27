"use client";

import { useState } from "react";

const STATUS_LABEL = { submitted: "Submitted", confirmed: "Confirmed", withdrawn: "Withdrawn" };

function money(cents) {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export default function RegistrationCard({ registration, classes = [] }) {
  const [reg, setReg] = useState(registration);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const { active_members: active, signed_members: signed, is_official: official } = reg.progress;
  const outstanding = active - signed;
  const enteredClass = classes.find((c) => c.id === reg.class_id)?.name ?? null;
  const scope = [reg.divisions?.display_name ?? reg.divisions?.name, enteredClass]
    .filter(Boolean)
    .join(" · ");
  const sug = reg.suggestion;

  async function patch(body) {
    setBusy(true);
    setError("");
    try {
      // Class goes through the directory route (it writes class_id); the
      // rest are registration fields on the registration route.
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
    <div className={"card p-4 space-y-3" + (reg.status === "withdrawn" ? " opacity-60" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="team-name text-lg">{reg.team_name}</p>
          {scope && <p className="t-meta">{scope}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="t-label">{STATUS_LABEL[reg.status] ?? reg.status}</p>
          <p className="t-meta">
            {reg.paid_at ? `Paid ${money(reg.amount_paid_cents)}`.trim() : "Unpaid"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="t-strong">
          {signed} of {active} signed
        </span>
        {official ? (
          <span className="t-label text-afa-navy">Official</span>
        ) : (
          <span className="t-meta">{outstanding} outstanding</span>
        )}
      </div>

      {sug && (
        <div className="rounded-lg bg-afa-navy/[0.04] p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-label">Suggested class</p>
            <p className="t-strong">{sug.className ?? "—"}</p>
          </div>
          <p className="t-meta">{sug.reason}</p>
          {sug.counts.length > 0 && (
            <p className="t-meta">
              Roster: {sug.counts.map((c) => `${c.count} ${c.name}`).join(" · ")}
              {sug.unranked > 0 && ` · ${sug.unranked} unranked`}
            </p>
          )}
          {/* A suggestion never sets anything. The director enters the team,
              because they know things a roster does not say. */}
          <div className="flex flex-wrap gap-2">
            {[{ id: "", name: "Not set" }, ...classes].map((c) => (
              <button
                key={c.id || "none"}
                type="button"
                disabled={busy}
                onClick={() => patch({ classId: c.id || null })}
                className={
                  "px-3 py-2 rounded-lg t-label border min-w-[3.5rem] " +
                  (reg.class_id === c.id || (!reg.class_id && !c.id)
                    ? "bg-afa-navy text-white border-afa-navy"
                    : c.id === sug.classId
                      ? "border-afa-navy text-afa-navy"
                      : "border-afa-navy/20 text-afa-muted")
                }
              >
                {c.name}
              </button>
            ))}
          </div>
          <p className="t-meta">
            {enteredClass
              ? `Entered as ${enteredClass}.`
              : "Not entered at a class yet — the outlined one is the suggestion."}
          </p>
        </div>
      )}

      <p className="t-meta">
        {reg.manager_name}
        {reg.manager_email && <> &middot; {reg.manager_email}</>}
        {reg.manager_phone && <> &middot; {reg.manager_phone}</>}
      </p>

      <div className="flex flex-wrap gap-2">
        {!reg.paid_at && (
          <button className="btn-quiet" disabled={busy} onClick={() => patch({ paid: true })}>
            Mark paid
          </button>
        )}
        {reg.paid_at && (
          <button className="btn-quiet" disabled={busy} onClick={() => patch({ paid: false })}>
            Undo paid
          </button>
        )}
        {reg.status !== "confirmed" && (
          <button
            className="btn-quiet"
            disabled={busy}
            onClick={() => patch({ status: "confirmed" })}
          >
            Confirm
          </button>
        )}
        {reg.status !== "withdrawn" ? (
          <button
            className="btn-quiet"
            disabled={busy}
            onClick={() => patch({ status: "withdrawn" })}
          >
            Withdraw
          </button>
        ) : (
          <button
            className="btn-quiet"
            disabled={busy}
            onClick={() => patch({ status: "submitted" })}
          >
            Reinstate
          </button>
        )}
        <button className="btn-quiet" onClick={() => copyLink("roster")}>
          {copied === "roster" ? "Copied" : "Team link"}
        </button>
        {/* The manager's private link. A director resends it when she loses
            it — which is the only way she gets it back. */}
        <button className="btn-quiet" onClick={() => copyLink("manage")}>
          {copied === "manage" ? "Copied" : "Manager link"}
        </button>
        {reg.pdf_storage_path && (
          <a
            className="btn-quiet"
            href={`/api/scorekeeper/registrations/${reg.id}/waiver`}
            target="_blank"
            rel="noreferrer"
          >
            Waiver
          </a>
        )}
        <button className="btn-quiet" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide roster" : "Roster"}
        </button>
      </div>

      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}

      {open && (
        <ul className="divide-y divide-black/5 border-t border-black/5 pt-1">
          {reg.members.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="t-body">
                {m.name}
                {m.role !== "player" && <span className="t-meta"> &middot; {m.role}</span>}
                {/* A roster entry with no person behind it means no birth date,
                    so there was no safe key to match on. Worth showing: it is a
                    director task, not an error. */}
                {!m.player_id && (
                  <span className="t-meta text-afa-red"> &middot; no person record</span>
                )}
              </span>
              <span className="t-label shrink-0">{m.signed_at ? "Signed" : "Waiting"}</span>
            </li>
          ))}
        </ul>
      )}

      {reg.director_notes && <p className="t-meta italic">{reg.director_notes}</p>}
    </div>
  );
}
