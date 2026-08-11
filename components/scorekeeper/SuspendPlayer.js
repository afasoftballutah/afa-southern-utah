"use client";

import { useState } from "react";
import Modal from "./Modal";
import { suspensionScopeLabel } from "@/lib/suspensions";

/**
 * Director-only: create or lift a player suspension (mid-tournament OK).
 *
 * @param {object} props
 * @param {{ id: string, full_name?: string, name?: string }} props.player
 * @param {Array<{ id: string, name: string, start_date?: string }>} [props.tournaments]
 * @param {Array} [props.suspensions] open + recent rows for this player
 * @param {string|null} [props.defaultTournamentId] pre-select (e.g. current event)
 * @param {string} [props.buttonLabel]
 * @param {string} [props.buttonClass]
 */
export default function SuspendPlayer({
  player,
  tournaments = [],
  suspensions = [],
  defaultTournamentId = null,
  buttonLabel = "Suspend",
  buttonClass = "pill",
}) {
  const [open, setOpen] = useState(false);
  const [tournamentId, setTournamentId] = useState(defaultTournamentId || "");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const name = player.full_name || player.name || "Player";
  const openRows = (suspensions ?? []).filter((s) => !s.lifted_at);
  const history = (suspensions ?? []).filter((s) => s.lifted_at).slice(0, 5);

  function openModal() {
    setTournamentId(defaultTournamentId || "");
    setStartsOn("");
    setEndsOn("");
    setNote("");
    setError("");
    setOpen(true);
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createSuspension",
          playerId: player.id,
          tournamentId: tournamentId || null,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          note: note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not suspend");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function lift(suspensionId) {
    if (!window.confirm(`Lift this suspension for ${name}?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scorekeeper/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "liftSuspension",
          suspensionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not lift");
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const tourBy = new Map(tournaments.map((t) => [t.id, t.name]));

  return (
    <>
      <button type="button" className={buttonClass} onClick={openModal}>
        {openRows.length > 0 ? "Suspension" : buttonLabel}
      </button>

      {open && (
        <Modal
          title={openRows.length ? `Suspension — ${name}` : `Suspend ${name}`}
          subtitle="They stay on the roster and may still sign. They do not count toward min men/women or class limits."
          onClose={() => !busy && setOpen(false)}
          width="max-w-lg"
          footer={
            <>
              <button
                type="button"
                className="btn-transient"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-action"
                disabled={busy}
                onClick={create}
              >
                {busy ? "Saving…" : "Add suspension"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {openRows.length > 0 && (
              <div className="space-y-2">
                <p className="t-strong text-sm">Active</p>
                <ul className="divide-y divide-black/5 rounded-lg border border-afa-navy/10">
                  {openRows.map((s) => (
                    <li
                      key={s.id}
                      className="px-3 py-2 flex flex-wrap items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="t-body text-sm font-semibold text-afa-red">
                          {suspensionScopeLabel(s, tourBy)}
                        </p>
                        {s.note ? (
                          <p className="t-meta text-[12px] mt-0.5 whitespace-pre-wrap">
                            {s.note}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="pill shrink-0"
                        disabled={busy}
                        onClick={() => lift(s.id)}
                      >
                        Lift
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <p className="t-strong text-sm">
                {openRows.length > 0 ? "Add another" : "Scope"}
              </p>
              <p className="t-meta text-[12px]">
                Tournament and/or dates. Leave both empty for open-ended until
                you lift it (note recommended).
              </p>
              <label className="block">
                <span className="form-label">Tournament (optional)</span>
                <select
                  className="form-field"
                  value={tournamentId}
                  onChange={(e) => setTournamentId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— Any / date only —</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.start_date ? ` (${t.start_date})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="form-label">From (optional)</span>
                  <input
                    type="date"
                    className="form-field"
                    value={startsOn}
                    onChange={(e) => setStartsOn(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="block">
                  <span className="form-label">Through (optional)</span>
                  <input
                    type="date"
                    className="form-field"
                    value={endsOn}
                    onChange={(e) => setEndsOn(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              <label className="block">
                <span className="form-label">Note</span>
                <textarea
                  className="form-field min-h-[4.5rem]"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Ejected game 3 — rest of weekend"
                  disabled={busy}
                />
              </label>
            </div>

            {history.length > 0 && (
              <div className="space-y-1">
                <p className="t-meta text-[11px] uppercase tracking-wide">
                  Recently lifted
                </p>
                <ul className="space-y-1">
                  {history.map((s) => (
                    <li key={s.id} className="t-meta text-[12px]">
                      {suspensionScopeLabel(s, tourBy)}
                      {s.note ? ` — ${s.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <p className="t-meta text-afa-red font-semibold">{error}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
