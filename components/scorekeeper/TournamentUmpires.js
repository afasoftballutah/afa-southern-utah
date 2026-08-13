"use client";

import { useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  timeInputValue,
  formatTimeWindowLabel,
} from "@/lib/league-time";

const STATUS = [
  { value: "available", label: "Available", chip: "bg-afa-go/15 text-afa-go border-afa-go/40" },
  { value: "limited", label: "Limited", chip: "bg-amber-100 text-amber-950 border-amber-300" },
  {
    value: "unavailable",
    label: "Unavailable",
    chip: "bg-afa-navy/10 text-afa-muted border-afa-navy/20",
  },
];

function statusMeta(value) {
  return STATUS.find((s) => s.value === value) ?? STATUS[0];
}

function umpLabel(u) {
  if (!u) return "—";
  const pref = (u.preferredName || "").trim();
  if (pref) return pref;
  return [u.lastName, u.firstName].filter(Boolean).join(", ") || "—";
}

function pitchTag(u) {
  if (u.pitchFast && u.pitchSlow) return "B";
  if (u.pitchFast) return "F";
  if (u.pitchSlow) return "S";
  return "—";
}

/**
 * Director: attach umpires from the local roster to this tournament and
 * record their daily availability window (from / until).
 *
 * Scheduler note (future): these windows are tournament-wide wall-clock
 * times shared across all divisions — multiple divisions run in parallel
 * on the same fields, not as separate isolated schedules.
 */
export default function TournamentUmpires({
  tournamentId,
  tournamentName,
  /** League-local daily first-pitch time for this tournament (HH:MM[:SS]). */
  dayStartTime = null,
  /** Full local roster (active preferred). */
  roster = [],
  /** Existing tournament_umpires rows with nested umpire fields. */
  initial = [],
}) {
  const defaultFrom = timeInputValue(dayStartTime);

  const [entries, setEntries] = useState(initial);
  const [pickId, setPickId] = useState("");
  const [fromTime, setFromTime] = useState(defaultFrom);
  const [untilTime, setUntilTime] = useState("");
  const [status, setStatus] = useState("available");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editFrom, setEditFrom] = useState("");
  const [editUntil, setEditUntil] = useState("");
  const [editStatus, setEditStatus] = useState("available");
  const [drop, setDrop] = useState(null);

  const onCrew = useMemo(
    () => new Set(entries.map((e) => e.umpireId)),
    [entries]
  );

  const addable = useMemo(
    () =>
      roster
        .filter((u) => u.status !== "inactive" && !onCrew.has(u.id))
        .slice()
        .sort((a, b) =>
          umpLabel(a).localeCompare(umpLabel(b), undefined, {
            sensitivity: "base",
          })
        ),
    [roster, onCrew]
  );

  async function post(body) {
    const res = await fetch("/api/scorekeeper/umpires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function entryFromApi(jsonEntry, ump) {
    return {
      id: jsonEntry.id,
      umpireId: jsonEntry.umpire_id || ump?.id,
      status: jsonEntry.status,
      availableFrom: jsonEntry.available_from,
      availableUntil: jsonEntry.available_until,
      notes: jsonEntry.notes,
      umpire: ump || {
        id: jsonEntry.umpire_id,
        firstName: "?",
        lastName: "?",
      },
    };
  }

  async function add() {
    if (!pickId) {
      setError("Pick an umpire from the roster");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const json = await post({
        action: "addTournamentUmpire",
        tournamentId,
        umpireId: pickId,
        status,
        availableFrom: fromTime || null,
        availableUntil: untilTime || null,
      });
      const ump = roster.find((u) => u.id === pickId);
      setEntries((cur) =>
        [
          entryFromApi(json.entry, ump),
          ...cur,
        ].sort((a, b) =>
          umpLabel(a.umpire).localeCompare(umpLabel(b.umpire), undefined, {
            sensitivity: "base",
          })
        )
      );
      setPickId("");
      setFromTime(defaultFrom);
      setUntilTime("");
      setStatus("available");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(e) {
    setEditingId(e.id);
    setEditFrom(timeInputValue(e.availableFrom));
    setEditUntil(timeInputValue(e.availableUntil));
    setEditStatus(e.status || "available");
    setError("");
  }

  async function saveEdit(id) {
    setBusy(true);
    setError("");
    try {
      const json = await post({
        action: "updateTournamentUmpire",
        id,
        status: editStatus,
        availableFrom: editFrom || null,
        availableUntil: editUntil || null,
      });
      setEntries((cur) =>
        cur.map((row) =>
          row.id === id
            ? {
                ...row,
                status: json.entry.status,
                availableFrom: json.entry.available_from,
                availableUntil: json.entry.available_until,
                notes: json.entry.notes,
              }
            : row
        )
      );
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(e) {
    setBusy(true);
    setError("");
    try {
      await post({ action: "removeTournamentUmpire", id: e.id });
      setEntries((cur) => cur.filter((row) => row.id !== e.id));
      if (editingId === e.id) setEditingId(null);
      setDrop(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="t-meta text-afa-red font-semibold" role="alert">
          {error}
        </p>
      ) : null}

      {entries.length === 0 && roster.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="t-meta">Nobody on file.</p>
          <a href="/director/umpires" className="pill">
            Add umpires
          </a>
        </div>
      ) : entries.length === 0 ? (
        <p className="t-meta">Nobody on this event yet.</p>
      ) : (
          <ul className="divide-y divide-afa-navy/10 rounded-lg border border-afa-navy/10 overflow-hidden">
            {entries.map((e) => {
              const st = statusMeta(e.status);
              const editing = editingId === e.id;
              const window =
                formatTimeWindowLabel(e.availableFrom, e.availableUntil) ||
                (e.availability ? String(e.availability) : "");
              return (
                <li
                  key={e.id}
                  className="px-3 py-2.5 bg-white flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="t-body font-semibold">
                      {umpLabel(e.umpire)}
                      <span className="t-meta font-normal">
                        {" "}
                        · {pitchTag(e.umpire)}
                      </span>
                      {e.umpire?.phone ? (
                        <span className="t-meta font-normal">
                          {" "}
                          · {e.umpire.phone}
                        </span>
                      ) : null}
                    </p>
                    {editing ? (
                      <div className="space-y-2 max-w-md">
                        <label className="block">
                          <span className="form-label">Status</span>
                          <select
                            className="form-field"
                            value={editStatus}
                            onChange={(ev) => setEditStatus(ev.target.value)}
                            disabled={busy}
                          >
                            {STATUS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="form-label">Available from</span>
                            <input
                              type="time"
                              className="form-field"
                              value={editFrom}
                              onChange={(ev) => setEditFrom(ev.target.value)}
                              disabled={busy}
                            />
                          </label>
                          <label className="block">
                            <span className="form-label">Until</span>
                            <input
                              type="time"
                              className="form-field"
                              value={editUntil}
                              onChange={(ev) => setEditUntil(ev.target.value)}
                              disabled={busy}
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="pill pill-solid"
                            disabled={busy}
                            onClick={() => saveEdit(e.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="pill"
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold " +
                            st.chip
                          }
                        >
                          {st.label}
                        </span>
                        {window ? (
                          <p className="t-meta text-[13px] mt-1 tabular-nums">
                            {window}
                            <span className="text-afa-muted"> each day</span>
                          </p>
                        ) : (
                          <p className="t-meta text-[12px] mt-1 italic">
                            No hours set
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {!editing && (
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="pill text-[12px]"
                        disabled={busy}
                        onClick={() => startEdit(e)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="pill text-[12px] text-afa-red border-afa-red/30"
                        disabled={busy}
                        onClick={() => setDrop(e)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      {addable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="form-field min-w-[12rem] max-w-xs"
            value={pickId}
            aria-label="Umpire"
            onChange={(e) => setPickId(e.target.value)}
            disabled={busy}
          >
            <option value="">Add umpire…</option>
            {addable.map((u) => (
              <option key={u.id} value={u.id}>
                {umpLabel(u)}
                {u.pitchFast || u.pitchSlow ? ` (${pitchTag(u)})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pill"
            disabled={busy || !pickId}
            onClick={add}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      ) : null}

      {drop ? (
        <ConfirmDialog
          title={`Remove ${umpLabel(drop.umpire)}`}
          message={`Take ${umpLabel(drop.umpire)} off ${tournamentName || "this event"}?`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={() => remove(drop)}
          onCancel={() => setDrop(null)}
        />
      ) : null}
    </div>
  );
}
